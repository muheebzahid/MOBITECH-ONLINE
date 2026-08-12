'use server'

import { createClient } from '@/lib/supabase/server'

export async function getProfitabilityHeatmap() {
  const supabase = await createClient()

  // 1. Fetch Deals & Logistics & Deal Items
  const { data: deals } = await supabase
    .from('deals')
    .select(`
      id, deal_number, quantity, total_commitment, amex_amount, funding_source,
      shipment_deals(shipments(total_logistics_cost, shipment_deals(deals(quantity)))),
      deal_items(*)
    `)
  
  // 2. Fetch B2B Invoice Line Items
  const { data: invoiceLineItems } = await supabase
    .from('invoice_line_items')
    .select('deal_id, deal_item_id, quantity, unit_price, invoices!inner(status)')
    .in('invoices.status', ['PAID', 'PARTIAL', 'ISSUED']) // exclude DRAFT, CANCELLED

  // 3. Fetch B2C Online Sales (Inventory Items that are sold)
  const { data: soldInventory } = await supabase
    .from('inventory_items')
    .select('model, grade, unit_cost, logistics_cost, target_price')
    .not('online_order_id', 'is', null)

  // Map to hold results: Key = Model|Grade
  const heatMap: Record<string, { model: string, grade: string, unitsSold: number, revenue: number, cogs: number, netProfit: number, margin: number }> = {}

  const getHeatmapNode = (model: string, grade: string) => {
    model = model || 'Unknown'
    grade = grade || 'Unknown'
    const key = `${model.trim()}|${grade.trim()}`
    if (!heatMap[key]) heatMap[key] = { model: model.trim(), grade: grade.trim(), unitsSold: 0, revenue: 0, cogs: 0, netProfit: 0, margin: 0 }
    return heatMap[key]
  }

  // Process B2B Sales
  // We need a lookup for deal logistics cost and base cost
  const dealCosts: Record<string, { shippingCostPerUnit: number, averageBaseCost: number, amexProfitPerUnit: number }> = {}

  ;(deals || []).forEach(deal => {
    const dealQty = deal.quantity || 0
    const baseUnitCost = dealQty > 0 ? (deal.total_commitment || 0) / dealQty : 0
    
    let shippingCostPerUnit = 0
    const shipment = deal.shipment_deals?.[0]?.shipments as any
    if (shipment) {
      const totalShipmentUnits = shipment.shipment_deals?.reduce((sum: number, sd: any) => sum + (sd.deals?.quantity || 0), 0) || 0
      shippingCostPerUnit = totalShipmentUnits > 0 ? (shipment.total_logistics_cost || 0) / totalShipmentUnits : 0
    }

    let amexProfitMultiplier = 0
    if (deal.funding_source === 'AMEX') amexProfitMultiplier = 1
    else if (deal.funding_source === 'MIXED') amexProfitMultiplier = (Number(deal.amex_amount) || 0) / (Number(deal.total_commitment) || 1)
    
    dealCosts[deal.id] = {
      shippingCostPerUnit,
      averageBaseCost: baseUnitCost,
      amexProfitPerUnit: baseUnitCost * amexProfitMultiplier * 0.02
    }
  })

  // Add B2B to Heatmap
  ;(invoiceLineItems || []).forEach(li => {
    if (!li.deal_id) return
    const costs = dealCosts[li.deal_id]
    if (!costs) return

    // find model/grade
    const deal = deals?.find(d => d.id === li.deal_id)
    let model = 'Unknown'
    let grade = 'Unknown'
    let unitCost = costs.averageBaseCost

    if (deal && deal.deal_items?.length > 0) {
      const dItem = deal.deal_items.find((di: any) => di.id === li.deal_item_id)
      if (dItem) {
        model = dItem.model
        grade = dItem.grade
        unitCost = dItem.unit_cost || costs.averageBaseCost
      } else {
        // Fallback: just pick the first item's model/grade, or 'Mixed'
        if (deal.deal_items.length === 1) {
          model = deal.deal_items[0].model
          grade = deal.deal_items[0].grade
          unitCost = deal.deal_items[0].unit_cost || costs.averageBaseCost
        } else {
          model = 'Mixed (Bulk)'
          grade = 'Mixed'
        }
      }
    }

    const node = getHeatmapNode(model, grade)
    node.unitsSold += (li.quantity || 0)
    node.revenue += (li.quantity || 0) * (li.unit_price || 0)
    
    const trueCost = Number(unitCost) + costs.shippingCostPerUnit
    node.cogs += (li.quantity || 0) * trueCost - ((li.quantity || 0) * costs.amexProfitPerUnit) // Amex profit effectively reduces COGS
  })

  // Add B2C to Heatmap
  ;(soldInventory || []).forEach(inv => {
    const node = getHeatmapNode(inv.model, inv.grade)
    node.unitsSold += 1
    node.revenue += Number(inv.target_price || 0)
    node.cogs += Number(inv.unit_cost || 0) + Number(inv.logistics_cost || 0)
  })

  return Object.values(heatMap)
    .filter(n => n.unitsSold > 0)
    .map(n => {
      n.netProfit = n.revenue - n.cogs
      n.margin = n.revenue > 0 ? (n.netProfit / n.revenue) * 100 : 0
      return n
    })
    .sort((a, b) => b.revenue - a.revenue)
}

export async function getProcurementForecast() {
  const supabase = await createClient()
  
  const { data: invoiceLineItems } = await supabase
    .from('invoice_line_items')
    .select('deal_item_id, quantity, unit_price, invoices!inner(status, issue_date)')
    .in('invoices.status', ['PAID', 'PARTIAL', 'ISSUED'])

  const { data: dealItems } = await supabase
    .from('deal_items')
    .select('*, deals(auction_fee, total_cost)')

  const { data: onlineInventory } = await supabase
    .from('inventory_items')
    .select('model, storage, grade, status, target_price')

  // Map to hold results: Key = Model|Storage|Grade
  const forecast: Record<string, any> = {}

  const getForecastNode = (model: string, storage: string, grade: string) => {
    model = model || 'Unknown'
    storage = storage || 'Unknown'
    grade = grade || 'Unknown'
    const key = `${model.trim()}|${storage.trim()}|${grade.trim()}`
    if (!forecast[key]) forecast[key] = { 
      model: model.trim(), 
      storage: storage.trim(),
      grade: grade.trim(), 
      totalSold: 0, 
      earliestSale: null, 
      currentStock: 0,
      invoicedSold: 0,
      invoicedRevenue: 0,
      totalCost: 0,
      totalAuctionFee: 0,
      totalInitialQty: 0
    }
    return forecast[key]
  }

  // Calculate total deal items (initial stock)
  ;(dealItems || []).forEach(di => {
    const node = getForecastNode(di.model, di.storage, di.grade)
    node.currentStock += (di.quantity || 0)
    node.totalInitialQty += (di.quantity || 0)
    
    const cost = Number(di.unit_cost || 0)
    node.totalCost += cost * (di.quantity || 0)
    
    // Calculate auction fee for this item based on deal's average
    if (di.deals && di.deals.total_cost > 0) {
      const feeRatio = (Number(di.deals.auction_fee) || 0) / Number(di.deals.total_cost)
      node.totalAuctionFee += (cost * feeRatio) * (di.quantity || 0)
    }
  })

  // Subtract B2B sold units from stock and calculate sales velocity
  ;(invoiceLineItems || []).forEach(li => {
    if (!li.deal_item_id) return
    const dItem = dealItems?.find(d => d.id === li.deal_item_id)
    if (!dItem) return

    const node = getForecastNode(dItem.model, dItem.storage, dItem.grade)
    node.currentStock -= (li.quantity || 0)
    node.totalSold += (li.quantity || 0)
    node.invoicedSold += (li.quantity || 0)
    node.invoicedRevenue += (li.quantity || 0) * Number(li.unit_price || 0)

    const inv = Array.isArray(li.invoices) ? li.invoices[0] : (li.invoices as any)
    if (inv && inv.issue_date) {
      const issueDate = new Date(inv.issue_date).getTime()
      if (!isNaN(issueDate)) {
        if (!node.earliestSale || issueDate < node.earliestSale) {
          node.earliestSale = issueDate
        }
      }
    }
  })

  // Subtract B2C pulled inventory from stock
  ;(onlineInventory || []).forEach(inv => {
    const node = getForecastNode(inv.model, inv.storage, inv.grade)
    node.currentStock -= 1
    if (inv.status === 'SOLD') {
      node.totalSold += 1
    }
  })

  const now = new Date().getTime()

  return Object.values(forecast)
    .map(n => {
      // Calculate months active (min 1 month)
      const msActive = n.earliestSale ? now - n.earliestSale : 0
      let monthsActive = msActive / (1000 * 60 * 60 * 24 * 30.44)
      if (monthsActive < 1) monthsActive = 1 // If less than a month, assume 1 month for conservative run rate

      n.mrr = Math.round(n.totalSold / monthsActive)
      n.currentStock = Math.max(0, n.currentStock) // Don't show negative stock
      n.shortfall = Math.max(0, n.mrr - n.currentStock)
      
      // Target for auction: Restock for a full month (MRR)
      n.recommendedBid = Math.max(0, n.mrr - n.currentStock)
      
      // If stock is below 50% of MRR, it's a critical low stock alert
      n.isLowStock = n.mrr > 0 && n.currentStock <= (n.mrr * 0.5)

      // Calculate averages (Force rebuild 1)
      n.avgSellingPrice = n.invoicedSold > 0 ? n.invoicedRevenue / n.invoicedSold : 0
      n.avgUnitCost = n.totalInitialQty > 0 ? n.totalCost / n.totalInitialQty : 0
      n.avgAuctionFee = n.totalInitialQty > 0 ? n.totalAuctionFee / n.totalInitialQty : 0

      return n
    })
    .filter(n => n.totalSold > 0 || n.currentStock > 0)
    .sort((a, b) => b.mrr - a.mrr)
}

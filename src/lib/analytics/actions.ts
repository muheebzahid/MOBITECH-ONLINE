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

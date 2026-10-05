'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Constant conversion rate
const USD_TO_AED = 3.674

export async function logExpense(category: string, description: string, amount: number, referenceLink?: string, expenseDate?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('operating_expenses')
    .insert({
      category,
      description,
      amount,
      expense_date: expenseDate || new Date().toISOString(),
      logged_by: user?.id,
      reference_link: referenceLink || null
    })
    .select()
    .single()

  if (error) throw error
  revalidatePath('/dashboard/accounting')
  return data
}

export async function deleteExpense(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('operating_expenses').delete().eq('id', id)
  if (error) throw error
  revalidatePath('/dashboard/accounting')
}

export async function editExpense(id: string, data: { amount?: number, category?: string, description?: string, expense_date?: string, reference_link?: string }) {
  const supabase = await createClient()
  const { error } = await supabase.from('operating_expenses').update(data).eq('id', id)
  if (error) throw error
  revalidatePath('/dashboard/accounting')
}

export async function getFinancialSummary(statementDateFilter?: string, fromDate?: string, toDate?: string) {
  const supabase = await createClient()

  // 1. Prepare queries
  let invoicesQuery = supabase
    .from('invoices')
    .select('id, client_id, total_amount, balance_due, amount_paid, status, issue_date')
    .neq('status', 'CANCELLED')
    .neq('client_id', '4b6cd459-dd29-4be7-a28e-58cbbed31285')
  if (fromDate) invoicesQuery = invoicesQuery.gte('issue_date', fromDate)
  if (toDate) invoicesQuery = invoicesQuery.lte('issue_date', toDate)

  let onlineOrdersQuery = supabase
    .from('online_orders')
    .select('id, order_number, platform, status, total_amount, sale_date, items:online_order_items(id, model, storage, grade, color, quantity, unit_price)')
    .neq('status', 'CANCELLED')
  if (fromDate) onlineOrdersQuery = onlineOrdersQuery.gte('sale_date', fromDate)
  if (toDate) onlineOrdersQuery = onlineOrdersQuery.lte('sale_date', toDate)

  let dealsQuery = supabase
    .from('deals')
    .select(`
      id, quantity, unit_cost, auction_fee, other_fees, total_commitment, funding_source, amex_amount, cash_amount, cashback_amount, cashback_received, status, amex_statement_date,
      shipment_deals ( shipments ( id, total_logistics_cost, shipment_deals ( deals ( quantity ) ) ) )
    `)
  if (statementDateFilter) dealsQuery = dealsQuery.eq('amex_statement_date', statementDateFilter)

  let opexQuery = supabase
    .from('operating_expenses')
    .select('*')
    .order('expense_date', { ascending: false })
  if (fromDate) opexQuery = opexQuery.gte('expense_date', fromDate)
  if (toDate) opexQuery = opexQuery.lte('expense_date', toDate)

  // Execute all independent queries in parallel via Promise.all
  const [
    { data: invoices, error: invErr },
    { data: onlineOrders },
    { data: deals },
    { data: allLineItems },
    { data: allLineItemsForSnapshot },
    { data: onlineInventory },
    { data: shipments, error: shipErr },
    { data: fetchedOpex, error: opexErr },
    { data: settings },
    { data: lineItemsWithPrice }
  ] = await Promise.all([
    invoicesQuery,
    onlineOrdersQuery,
    dealsQuery,
    supabase.from('invoice_line_items').select('quantity, deal_id, deal_item_id, deal_items(unit_cost), invoices!inner(id, status, issue_date, client_id)'),
    supabase.from('invoice_line_items').select('quantity, deal_id, invoices!inner(status)'),
    supabase.from('inventory_items').select('id, unit_cost, logistics_cost, repair_cost, model, storage, grade, color, online_order_id, online_order_item_id, status, refurb_stage').not('online_order_id', 'is', null),
    supabase.from('shipments').select('total_logistics_cost'),
    opexQuery,
    supabase.from('treasury_settings').select('*').limit(1).single(),
    statementDateFilter
      ? supabase.from('invoice_line_items').select('quantity, unit_price, deal_id, invoices!inner(status)')
      : Promise.resolve({ data: null, error: null } as any)
  ])

  let wholesaleRevenue = 0
  if (!invErr && invoices) {
    wholesaleRevenue = invoices.filter((inv: any) => inv.status !== 'DRAFT').reduce((sum, inv) => sum + Number(inv.total_amount), 0)
  }

  let onlineRevenue = 0
  if (onlineOrders) {
    onlineRevenue = onlineOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0)
  }

  if (statementDateFilter) {
    wholesaleRevenue = 0
    let filteredRevenue = 0
    if (lineItemsWithPrice && deals) {
      const validDealIds = new Set(deals.map((d: any) => d.id))
      lineItemsWithPrice.forEach((li: any) => {
        if (li.invoices && li.invoices.status !== 'CANCELLED' && li.invoices.status !== 'DRAFT' && validDealIds.has(li.deal_id)) {
          filteredRevenue += (li.quantity || 0) * (Number(li.unit_price) || 0)
        }
      })
    }
    wholesaleRevenue = filteredRevenue
    onlineRevenue = 0
  }

  const totalRevenue = wholesaleRevenue + onlineRevenue

  const dealCosts: Record<string, { averageBaseCost: number, dealFeePerUnit: number, shippingCostPerUnit: number, amexProfitPerUnit: number }> = {}
  let amexProfit = 0
  if (deals) {
    deals.forEach((deal: any) => {
      const dealQty = deal.quantity || 0
      const averageBaseCost = dealQty > 0 ? (deal.total_commitment || 0) / dealQty : 0
      const dealFeePerUnit = dealQty > 0 ? ((Number(deal.auction_fee || 0) + Number(deal.other_fees || 0)) / dealQty) : 0
      
      const shipment = deal.shipment_deals?.[0]?.shipments
      let shippingCostPerUnit = 0
      if (shipment) {
        const totalShipmentUnits = shipment.shipment_deals?.reduce((sum: number, sd: any) => sum + (sd.deals?.quantity || 0), 0) || 0
        shippingCostPerUnit = totalShipmentUnits > 0 ? (shipment.total_logistics_cost || 0) / totalShipmentUnits : 0
      }
      
      let amexProfitPerUnit = 0
      if (deal.cashback_received && (deal.funding_source === 'AMEX' || deal.funding_source === 'MIXED')) {
        const amexAmount = Number(deal.amex_amount) || (deal.funding_source === 'MIXED' ? Number(deal.total_commitment) / 2 : Number(deal.total_commitment))
        amexProfitPerUnit = (amexAmount * 0.02) / (dealQty || 1)
      }
      
      dealCosts[deal.id] = { averageBaseCost, dealFeePerUnit, shippingCostPerUnit, amexProfitPerUnit }
    })
  }

  const validInvoiceIds = new Set(invoices?.map((i: any) => i.id) || [])
  let activeLineItems = (allLineItems || []).filter(
    (li: any) => li.invoices && li.invoices.status !== 'CANCELLED' && li.invoices.status !== 'DRAFT' && li.invoices.client_id !== '4b6cd459-dd29-4be7-a28e-58cbbed31285'
  )
  
  if (fromDate || toDate) {
    activeLineItems = activeLineItems.filter((li: any) => validInvoiceIds.has(li.invoices.id))
  }
  
  if (statementDateFilter && deals) {
    const validDealIds = new Set(deals.map((d: any) => d.id))
    activeLineItems = activeLineItems.filter((li: any) => validDealIds.has(li.deal_id))
  }

  const dealSoldQuantities: Record<string, number> = {}
  if (allLineItemsForSnapshot) {
    allLineItemsForSnapshot.forEach((li: any) => {
      if (li.invoices && li.invoices.status !== 'CANCELLED' && li.invoices.status !== 'DRAFT' && li.deal_id) {
        dealSoldQuantities[li.deal_id] = (dealSoldQuantities[li.deal_id] || 0) + (li.quantity || 0)
      }
    })
  }

  let wholesaleCogsDevices = 0
  let wholesaleCogsLogistics = 0
  let wholesaleCogs = 0

  activeLineItems.forEach((li: any) => {
    if (li.deal_id) {
      const costs = dealCosts[li.deal_id]
      if (costs) {
        const itemUnitCost = li.deal_items?.unit_cost !== undefined ? Number(li.deal_items.unit_cost) : (costs.averageBaseCost - costs.dealFeePerUnit)
        const stockPlusFeeCost = itemUnitCost + costs.dealFeePerUnit
        
        wholesaleCogsDevices += li.quantity * stockPlusFeeCost
        wholesaleCogsLogistics += li.quantity * costs.shippingCostPerUnit
        wholesaleCogs += li.quantity * (stockPlusFeeCost + costs.shippingCostPerUnit)
        
        amexProfit += li.quantity * (costs.amexProfitPerUnit || 0)
      }
    }
  })

  let onlineCogsDevices = 0
  let onlineCogsLogistics = 0
  let onlineTotalRepairCost = 0
  let onlineOtherExpenses = 0
  let onlineTotalUnitsSold = 0

  const orderMap = new Map<string, any>()
  if (onlineOrders) {
    onlineOrders.forEach((ord: any) => {
      orderMap.set(ord.id, ord)
    })
  }

  // Platform and SKU breakdown accumulators
  const platformStats = {
    AMAZON: { unitsSold: 0, revenue: 0, cogsDevices: 0, cogsLogistics: 0, repairCost: 0, otherExpenses: 0, totalCost: 0, grossProfit: 0, netProfit: 0, roi: 0 },
    REVIBE: { unitsSold: 0, revenue: 0, cogsDevices: 0, cogsLogistics: 0, repairCost: 0, otherExpenses: 0, totalCost: 0, grossProfit: 0, netProfit: 0, roi: 0 }
  }

  const skuMap = new Map<string, {
    model: string
    storage: string
    grade: string
    quantity: number
    revenue: number
    cogsDevices: number
    logisticsCost: number
    repairCost: number
    totalCost: number
    netProfit: number
    avgPrice: number
    avgCost: number
    profitPerUnit: number
    roi: number
  }>()

  if (!statementDateFilter) {
    const validOnlineOrderIds = new Set(onlineOrders?.map((o: any) => o.id) || [])

    // 1. Process online inventory items
    if (onlineInventory) {
      onlineInventory.forEach(item => {
        if ((fromDate || toDate) && !validOnlineOrderIds.has(item.online_order_id)) {
          return
        }

        const devCost = Number(item.unit_cost || 0)
        const logCost = Number(item.logistics_cost || 0)
        const repCost = Number(item.repair_cost || 0)

        onlineCogsDevices += devCost
        onlineCogsLogistics += logCost
        onlineTotalRepairCost += repCost
        onlineTotalUnitsSold += 1

        const order = orderMap.get(item.online_order_id)
        const plat = (order?.platform === 'AMAZON' ? 'AMAZON' : 'REVIBE') as 'AMAZON' | 'REVIBE'
        if (platformStats[plat]) {
          platformStats[plat].unitsSold += 1
          platformStats[plat].cogsDevices += devCost
          platformStats[plat].cogsLogistics += logCost
          platformStats[plat].repairCost += repCost
        }

        // SKU Map grouping
        const skuKey = `${item.model || 'Unknown'}__${item.storage || ''}__${item.grade || ''}`.toUpperCase()
        if (!skuMap.has(skuKey)) {
          skuMap.set(skuKey, {
            model: item.model || 'Unknown',
            storage: item.storage || '',
            grade: item.grade || '',
            quantity: 0,
            revenue: 0,
            cogsDevices: 0,
            logisticsCost: 0,
            repairCost: 0,
            totalCost: 0,
            netProfit: 0,
            avgPrice: 0,
            avgCost: 0,
            profitPerUnit: 0,
            roi: 0
          })
        }
        const skuEntry = skuMap.get(skuKey)!
        skuEntry.quantity += 1
        skuEntry.cogsDevices += devCost
        skuEntry.logisticsCost += logCost
        skuEntry.repairCost += repCost
        skuEntry.totalCost += (devCost + logCost + repCost)
      })
    }

    // 2. Add platform revenue & SKU revenue from orders
    if (onlineOrders) {
      onlineOrders.forEach((order: any) => {
        const plat = (order.platform === 'AMAZON' ? 'AMAZON' : 'REVIBE') as 'AMAZON' | 'REVIBE'
        const ordRevenue = Number(order.total_amount || 0)
        if (platformStats[plat]) {
          platformStats[plat].revenue += ordRevenue
        }

        // Distribute revenue to SKUs
        if (order.items && Array.isArray(order.items)) {
          order.items.forEach((it: any) => {
            const skuKey = `${it.model || 'Unknown'}__${it.storage || ''}__${it.grade || ''}`.toUpperCase()
            const itemRev = Number(it.unit_price || 0) * (Number(it.quantity) || 1)
            if (skuMap.has(skuKey)) {
              skuMap.get(skuKey)!.revenue += itemRev
            } else {
              skuMap.set(skuKey, {
                model: it.model || 'Unknown',
                storage: it.storage || '',
                grade: it.grade || '',
                quantity: Number(it.quantity) || 1,
                revenue: itemRev,
                cogsDevices: 0,
                logisticsCost: 0,
                repairCost: 0,
                totalCost: 0,
                netProfit: 0,
                avgPrice: 0,
                avgCost: 0,
                profitPerUnit: 0,
                roi: 0
              })
            }
          })
        }
      })
    }

    // 3. Online-specific operational expenses (e.g. Marketing / Platform Fees)
    if (fetchedOpex) {
      fetchedOpex.forEach((exp: any) => {
        const cat = String(exp.category || '').toUpperCase()
        const desc = String(exp.description || '').toLowerCase()
        if (cat === 'MARKETING' || desc.includes('amazon') || desc.includes('revibe') || desc.includes('online')) {
          onlineOtherExpenses += Number(exp.amount || 0)
        }
      })
    }
  }

  // Finalize Platform Stats
  (['AMAZON', 'REVIBE'] as const).forEach(plat => {
    const p = platformStats[plat]
    p.totalCost = p.cogsDevices + p.cogsLogistics + p.repairCost + p.otherExpenses
    p.grossProfit = p.revenue - (p.cogsDevices + p.cogsLogistics)
    p.netProfit = p.revenue - p.totalCost
    p.roi = p.totalCost > 0 ? (p.netProfit / p.totalCost) * 100 : 0
  })

  // Finalize SKU Breakdown
  const skuBreakdown = Array.from(skuMap.values()).map(sku => {
    const netProfit = sku.revenue - sku.totalCost
    const avgPrice = sku.quantity > 0 ? sku.revenue / sku.quantity : 0
    const avgCost = sku.quantity > 0 ? sku.totalCost / sku.quantity : 0
    const profitPerUnit = sku.quantity > 0 ? netProfit / sku.quantity : 0
    const roi = sku.totalCost > 0 ? (netProfit / sku.totalCost) * 100 : 0
    return {
      ...sku,
      netProfit,
      avgPrice,
      avgCost,
      profitPerUnit,
      roi
    }
  }).sort((a, b) => b.revenue - a.revenue)

  const onlineTotalCost = onlineCogsDevices + onlineCogsLogistics + onlineTotalRepairCost + onlineOtherExpenses
  const onlineGrossProfit = onlineRevenue - (onlineCogsDevices + onlineCogsLogistics)
  const onlineNetProfit = onlineRevenue - onlineTotalCost
  const onlineRoi = onlineTotalCost > 0 ? (onlineNetProfit / onlineTotalCost) * 100 : 0
  const onlineGrossMarginPct = onlineRevenue > 0 ? (onlineGrossProfit / onlineRevenue) * 100 : 0
  const onlineNetMarginPct = onlineRevenue > 0 ? (onlineNetProfit / onlineRevenue) * 100 : 0
  const onlineAvgSellingPrice = onlineTotalUnitsSold > 0 ? onlineRevenue / onlineTotalUnitsSold : 0
  const onlineAvgCostPerUnit = onlineTotalUnitsSold > 0 ? onlineTotalCost / onlineTotalUnitsSold : 0
  const onlineAvgProfitPerUnit = onlineTotalUnitsSold > 0 ? onlineNetProfit / onlineTotalUnitsSold : 0

  const onlineCogs = onlineCogsDevices + onlineCogsLogistics

  const cogsDevices = wholesaleCogsDevices + onlineCogsDevices
  const cogsLogistics = wholesaleCogsLogistics + onlineCogsLogistics
  const cogs = wholesaleCogs + onlineCogs
  const totalSoldShippingCost = wholesaleCogsLogistics + onlineCogsLogistics

  let onlineUnsoldValue = 0
  const { data: onlineUnsoldItems } = await supabase
    .from('inventory_items')
    .select('unit_cost, logistics_cost, repair_cost')
    .neq('refurb_stage', 'SOLD')

  if (onlineUnsoldItems) {
    onlineUnsoldItems.forEach(item => {
      const cost = Number(item.unit_cost || 0) + Number(item.logistics_cost || 0) + Number(item.repair_cost || 0)
      onlineUnsoldValue += cost
    })
  }

  let inventoryValue = 0 // Wholesale unsold inventory value
  if (deals) {
    deals.forEach((deal: any) => {
      const soldQty = dealSoldQuantities[deal.id] || 0
      const unsoldQty = Math.max(0, (deal.quantity || 0) - soldQty)
      const costs = dealCosts[deal.id]
      if (costs && unsoldQty > 0) {
        const unitTotalCost = costs.averageBaseCost + costs.shippingCostPerUnit
        inventoryValue += unsoldQty * unitTotalCost
      }
    })
  }

  let freightExpense = 0
  if (!statementDateFilter) {
    if (!shipErr && shipments) {
      freightExpense = shipments.reduce((sum, ship) => sum + Number(ship.total_logistics_cost || 0), 0)
    }
    freightExpense = Math.max(0, freightExpense - totalSoldShippingCost)
  }

  let totalOpex = 0
  let opex: any[] = []
  if (!statementDateFilter) {
    if (!opexErr && fetchedOpex) {
      opex = fetchedOpex
      totalOpex = fetchedOpex.reduce((sum, exp) => sum + Number(exp.amount), 0)
    }
  }

  const grossProfitWholesale = wholesaleRevenue - wholesaleCogs
  const grossProfitOnline = onlineGrossProfit
  const grossProfit = totalRevenue - cogs
  const netProfit = grossProfit + amexProfit - totalOpex

  const amexLimit = settings?.amex_limit || 500000
  const cashLimit = settings?.cash_limit || 300000

  const amexStuck = deals ? deals
    .filter((d: any) => d.status !== 'DEAL_CLOSED' && (d.funding_source === 'AMEX' || d.funding_source === 'MIXED'))
    .reduce((s, d) => s + (Number(d.amex_amount) || Number(d.total_commitment)), 0) : 0
    
  const cashStuck = deals ? deals
    .filter((d: any) => d.status !== 'DEAL_CLOSED' && (d.funding_source === 'CASH_POOL' || d.funding_source === 'MIXED'))
    .reduce((s, d) => s + (Number(d.cash_amount) || Number(d.total_commitment)), 0) : 0

  const amexAvailable = amexLimit - amexStuck
  const cashAvailable = cashLimit - cashStuck

  // Balance Sheet Calculations (GAAP Standard)
  const accountsReceivable = invoices ? invoices
    .filter((inv: any) => inv.status !== 'CANCELLED' && inv.status !== 'VOIDED')
    .reduce((sum, inv) => sum + (Number(inv.balance_due) || 0), 0) : 0

  const accountsPayable = 0
  const amexLiability = amexStuck
  const liquidCash = Math.max(0, cashAvailable)
  const retainedEarnings = netProfit

  const totalAssets = liquidCash + accountsReceivable + inventoryValue + onlineUnsoldValue
  const totalLiabilities = accountsPayable + amexLiability
  const totalEquity = retainedEarnings

  const onlineMetricsUsd = {
    totalUnitsSold: onlineTotalUnitsSold,
    totalRevenue: onlineRevenue,
    cogsDevices: onlineCogsDevices,
    cogsLogistics: onlineCogsLogistics,
    totalRepairCost: onlineTotalRepairCost,
    otherExpenses: onlineOtherExpenses,
    totalCost: onlineTotalCost,
    grossProfit: onlineGrossProfit,
    netProfit: onlineNetProfit,
    roi: onlineRoi,
    grossMarginPct: onlineGrossMarginPct,
    netMarginPct: onlineNetMarginPct,
    avgSellingPrice: onlineAvgSellingPrice,
    avgCostPerUnit: onlineAvgCostPerUnit,
    avgProfitPerUnit: onlineAvgProfitPerUnit,
    platformBreakdown: {
      amazon: platformStats.AMAZON,
      revibe: platformStats.REVIBE
    },
    skuBreakdown
  }

  const onlineMetricsAed = {
    totalUnitsSold: onlineTotalUnitsSold,
    totalRevenue: onlineRevenue * USD_TO_AED,
    cogsDevices: onlineCogsDevices * USD_TO_AED,
    cogsLogistics: onlineCogsLogistics * USD_TO_AED,
    totalRepairCost: onlineTotalRepairCost * USD_TO_AED,
    otherExpenses: onlineOtherExpenses * USD_TO_AED,
    totalCost: onlineTotalCost * USD_TO_AED,
    grossProfit: onlineGrossProfit * USD_TO_AED,
    netProfit: onlineNetProfit * USD_TO_AED,
    roi: onlineRoi,
    grossMarginPct: onlineGrossMarginPct,
    netMarginPct: onlineNetMarginPct,
    avgSellingPrice: onlineAvgSellingPrice * USD_TO_AED,
    avgCostPerUnit: onlineAvgCostPerUnit * USD_TO_AED,
    avgProfitPerUnit: onlineAvgProfitPerUnit * USD_TO_AED,
    platformBreakdown: {
      amazon: {
        ...platformStats.AMAZON,
        revenue: platformStats.AMAZON.revenue * USD_TO_AED,
        cogsDevices: platformStats.AMAZON.cogsDevices * USD_TO_AED,
        cogsLogistics: platformStats.AMAZON.cogsLogistics * USD_TO_AED,
        repairCost: platformStats.AMAZON.repairCost * USD_TO_AED,
        otherExpenses: platformStats.AMAZON.otherExpenses * USD_TO_AED,
        totalCost: platformStats.AMAZON.totalCost * USD_TO_AED,
        grossProfit: platformStats.AMAZON.grossProfit * USD_TO_AED,
        netProfit: platformStats.AMAZON.netProfit * USD_TO_AED
      },
      revibe: {
        ...platformStats.REVIBE,
        revenue: platformStats.REVIBE.revenue * USD_TO_AED,
        cogsDevices: platformStats.REVIBE.cogsDevices * USD_TO_AED,
        cogsLogistics: platformStats.REVIBE.cogsLogistics * USD_TO_AED,
        repairCost: platformStats.REVIBE.repairCost * USD_TO_AED,
        otherExpenses: platformStats.REVIBE.otherExpenses * USD_TO_AED,
        totalCost: platformStats.REVIBE.totalCost * USD_TO_AED,
        grossProfit: platformStats.REVIBE.grossProfit * USD_TO_AED,
        netProfit: platformStats.REVIBE.netProfit * USD_TO_AED
      }
    },
    skuBreakdown: skuBreakdown.map(sku => ({
      ...sku,
      revenue: sku.revenue * USD_TO_AED,
      cogsDevices: sku.cogsDevices * USD_TO_AED,
      logisticsCost: sku.logisticsCost * USD_TO_AED,
      repairCost: sku.repairCost * USD_TO_AED,
      totalCost: sku.totalCost * USD_TO_AED,
      netProfit: sku.netProfit * USD_TO_AED,
      avgPrice: sku.avgPrice * USD_TO_AED,
      avgCost: sku.avgCost * USD_TO_AED,
      profitPerUnit: sku.profitPerUnit * USD_TO_AED
    }))
  }

  return {
    usd: {
      revenue: totalRevenue,
      revenueWholesale: wholesaleRevenue,
      revenueOnline: onlineRevenue,
      cogs: cogs,
      cogsWholesale: wholesaleCogs,
      cogsOnline: onlineCogs,
      cogsDevices: cogsDevices,
      cogsLogistics: cogsLogistics,
      wholesaleCogsDevices,
      wholesaleCogsLogistics,
      onlineCogsDevices,
      onlineCogsLogistics,
      grossProfit: grossProfit,
      grossProfitWholesale,
      grossProfitOnline,
      amexProfit: amexProfit,
      freight: freightExpense,
      opex: totalOpex,
      netProfit: netProfit,
      inventoryAsset: inventoryValue + onlineUnsoldValue,
      inventoryAssetWholesale: inventoryValue,
      inventoryAssetOnline: onlineUnsoldValue,
      onlineMetrics: onlineMetricsUsd,
      treasury: {
        amexLimit,
        amexStuck,
        amexAvailable,
        cashLimit,
        cashStuck,
        cashAvailable
      },
      balanceSheet: {
        liquidCash,
        accountsReceivable,
        inventoryAsset: inventoryValue + onlineUnsoldValue,
        inventoryAssetWholesale: inventoryValue,
        inventoryAssetOnline: onlineUnsoldValue,
        totalAssets,
        accountsPayable,
        amexLiability,
        totalLiabilities,
        partnerCapital: 0,
        retainedEarnings,
        totalEquity,
        isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1
      }
    },
    aed: {
      revenue: totalRevenue * USD_TO_AED,
      revenueWholesale: wholesaleRevenue * USD_TO_AED,
      revenueOnline: onlineRevenue * USD_TO_AED,
      cogs: cogs * USD_TO_AED,
      cogsWholesale: wholesaleCogs * USD_TO_AED,
      cogsOnline: onlineCogs * USD_TO_AED,
      cogsDevices: cogsDevices * USD_TO_AED,
      cogsLogistics: cogsLogistics * USD_TO_AED,
      wholesaleCogsDevices: wholesaleCogsDevices * USD_TO_AED,
      wholesaleCogsLogistics: wholesaleCogsLogistics * USD_TO_AED,
      onlineCogsDevices: onlineCogsDevices * USD_TO_AED,
      onlineCogsLogistics: onlineCogsLogistics * USD_TO_AED,
      grossProfit: grossProfit * USD_TO_AED,
      grossProfitWholesale: grossProfitWholesale * USD_TO_AED,
      grossProfitOnline: grossProfitOnline * USD_TO_AED,
      amexProfit: amexProfit * USD_TO_AED,
      freight: freightExpense * USD_TO_AED,
      opex: totalOpex * USD_TO_AED,
      netProfit: netProfit * USD_TO_AED,
      inventoryAsset: (inventoryValue + onlineUnsoldValue) * USD_TO_AED,
      inventoryAssetWholesale: inventoryValue * USD_TO_AED,
      inventoryAssetOnline: onlineUnsoldValue * USD_TO_AED,
      onlineMetrics: onlineMetricsAed,
      treasury: {
        amexLimit: amexLimit * USD_TO_AED,
        amexStuck: amexStuck * USD_TO_AED,
        amexAvailable: amexAvailable * USD_TO_AED,
        cashLimit: cashLimit * USD_TO_AED,
        cashStuck: cashStuck * USD_TO_AED,
        cashAvailable: cashAvailable * USD_TO_AED
      },
      balanceSheet: {
        liquidCash: liquidCash * USD_TO_AED,
        accountsReceivable: accountsReceivable * USD_TO_AED,
        inventoryAsset: (inventoryValue + onlineUnsoldValue) * USD_TO_AED,
        inventoryAssetWholesale: inventoryValue * USD_TO_AED,
        inventoryAssetOnline: onlineUnsoldValue * USD_TO_AED,
        totalAssets: totalAssets * USD_TO_AED,
        accountsPayable: accountsPayable * USD_TO_AED,
        amexLiability: amexLiability * USD_TO_AED,
        totalLiabilities: totalLiabilities * USD_TO_AED,
        partnerCapital: 0,
        retainedEarnings: retainedEarnings * USD_TO_AED,
        totalEquity: totalEquity * USD_TO_AED,
        isBalanced: Math.abs(totalAssets * USD_TO_AED - ((totalLiabilities + totalEquity) * USD_TO_AED)) < 1
      }
    },
    expenseHistory: opex || []
  }
}

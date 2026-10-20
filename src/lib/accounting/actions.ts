'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createSupabaseAdmin(url, key)
}

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
  const supabase = getAdminClient()

  const REVIBE_CLIENT_ID = 'ed2d7d34-799d-46eb-ad8d-c7ae7ed04c66'
  const isRevibe = (inv: any) => Boolean(
    inv && (
      inv.client_id === REVIBE_CLIENT_ID || 
      (typeof inv.customer_name === 'string' && inv.customer_name.toUpperCase().includes('REVIBE'))
    )
  )

  // 1. Prepare queries
  let invoicesQuery = supabase
    .from('invoices')
    .select('id, invoice_number, client_id, customer_name, total_amount, balance_due, amount_paid, repair_cost, status, issue_date')
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
      shipment_deals ( shipments ( id, total_logistics_cost, shipment_deals ( deals ( quantity ) ) ) ),
      items:deal_items ( * )
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
    supabase.from('invoice_line_items').select('id, quantity, unit_price, total_price, repair_cost, description, deal_id, deal_item_id, deal_items(*), invoices!inner(id, invoice_number, status, issue_date, client_id, customer_name, repair_cost)'),
    supabase.from('invoice_line_items').select('quantity, deal_id, invoices!inner(status)'),
    supabase.from('inventory_items').select('id, unit_cost, logistics_cost, repair_cost, model, storage, grade, color, online_order_id, online_order_item_id, status, refurb_stage').not('online_order_id', 'is', null),
    supabase.from('shipments').select('total_logistics_cost'),
    opexQuery,
    supabase.from('treasury_settings').select('*').limit(1).single(),
    statementDateFilter
      ? supabase.from('invoice_line_items').select('quantity, unit_price, deal_id, invoices!inner(status)')
      : Promise.resolve({ data: null, error: null } as any)
  ])

  const wholesaleInvoices = (invoices || []).filter((inv: any) => !isRevibe(inv))
  const revibeInvoicesList = (invoices || []).filter((inv: any) => isRevibe(inv) && inv.status !== 'CANCELLED' && inv.status !== 'DRAFT')

  let wholesaleRevenue = 0
  let revibeRevenue = 0

  if (!invErr && invoices) {
    wholesaleRevenue = wholesaleInvoices
      .filter((inv: any) => inv.status !== 'DRAFT')
      .reduce((sum: number, inv: any) => sum + Number(inv.total_amount || 0), 0)

    revibeRevenue = revibeInvoicesList
      .filter((inv: any) => inv.status !== 'DRAFT')
      .reduce((sum: number, inv: any) => sum + Number(inv.total_amount || 0), 0)
  }

  let onlineRevenue = revibeRevenue

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
    revibeRevenue = 0
  }

  const totalRevenue = wholesaleRevenue + revibeRevenue

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
  let wholesaleRepairCost = 0
  let wholesaleCogs = 0

  let revibeCogsDevices = 0
  let revibeCogsLogistics = 0
  let revibeTotalUnitsSold = 0

  const revibeInvoiceStats: Record<string, { units: number, cogs: number }> = {}
  revibeInvoicesList.forEach((inv: any) => {
    revibeInvoiceStats[inv.id] = { units: 0, cogs: 0 }
  })

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

  const dealMap = new Map<string, any>()
  if (deals) {
    deals.forEach((d: any) => dealMap.set(d.id, d))
  }

  activeLineItems.forEach((li: any) => {
    const isRev = isRevibe(li.invoices)
    const qty = Number(li.quantity || 0)

    let stockPlusFeeCost = 0
    let shippingCostPerUnit = 0

    if (li.deal_id) {
      const costs = dealCosts[li.deal_id]
      if (costs) {
        const itemUnitCost = li.deal_items?.unit_cost !== undefined ? Number(li.deal_items.unit_cost) : (costs.averageBaseCost - costs.dealFeePerUnit)
        stockPlusFeeCost = itemUnitCost + costs.dealFeePerUnit
        shippingCostPerUnit = costs.shippingCostPerUnit

        if (!isRev) {
          amexProfit += qty * (costs.amexProfitPerUnit || 0)
        }
      }
    }

    if (isRev) {
      revibeTotalUnitsSold += qty
      revibeCogsDevices += qty * stockPlusFeeCost
      revibeCogsLogistics += qty * shippingCostPerUnit

      const invId = li.invoices?.id
      if (invId) {
        if (!revibeInvoiceStats[invId]) {
          revibeInvoiceStats[invId] = { units: 0, cogs: 0 }
        }
        revibeInvoiceStats[invId].units += qty
        revibeInvoiceStats[invId].cogs += qty * (stockPlusFeeCost + shippingCostPerUnit)
      }

      // SKU breakdown for Revibe
      const desc = li.description || ''
      let model = li.deal_items?.model || ''
      let storage = li.deal_items?.storage || ''
      let grade = li.deal_items?.grade || ''

      if (!model) {
        const match = desc.match(/(iPhone\s+[^\s]+(?:\s+(?:Pro\s+Max|Pro|Plus|Mini))?)/i)
        model = match ? match[1] : (desc.split('(')[0].trim() || 'Unknown Model')
        const storageMatch = desc.match(/(64GB|128GB|256GB|512GB|1TB)/i)
        if (storageMatch) storage = storageMatch[1].toUpperCase()
        const gradeMatch = desc.match(/Grade\s+([A-Za-z0-9_]+)/i)
        if (gradeMatch) grade = gradeMatch[1]
      }

      const skuKey = `${model}__${storage}__${grade}`.toUpperCase()
      if (!skuMap.has(skuKey)) {
        skuMap.set(skuKey, {
          model,
          storage,
          grade,
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
      const itemRev = qty * Number(li.unit_price || 0)
      const itemDevCost = qty * stockPlusFeeCost
      const itemLogCost = qty * shippingCostPerUnit
      const itemRepCost = Number(li.repair_cost || 0)

      skuEntry.quantity += qty
      skuEntry.revenue += itemRev
      skuEntry.cogsDevices += itemDevCost
      skuEntry.logisticsCost += itemLogCost
      skuEntry.repairCost += itemRepCost
      skuEntry.totalCost += (itemDevCost + itemLogCost + itemRepCost)
    } else {
      let itemRepairCost = Number(li.repair_cost || li.deal_items?.repair_cost || 0)
      if (!itemRepairCost) {
        const dealObj = dealMap.get(li.deal_id)
        if (dealObj?.items?.length === 1) {
          itemRepairCost = Number(dealObj.items[0]?.repair_cost || 0)
        }
      }
      wholesaleCogsDevices += qty * stockPlusFeeCost
      wholesaleCogsLogistics += qty * shippingCostPerUnit
      wholesaleRepairCost += qty * itemRepairCost
      wholesaleCogs += qty * (stockPlusFeeCost + shippingCostPerUnit + itemRepairCost)
    }
  })

  // Revibe total repair cost from invoices
  const revibeTotalRepairCost = revibeInvoicesList.reduce((sum: number, inv: any) => sum + Number(inv.repair_cost || 0), 0)
  const revibeTotalCost = revibeCogsDevices + revibeCogsLogistics + revibeTotalRepairCost
  const revibeGrossProfit = revibeRevenue - (revibeCogsDevices + revibeCogsLogistics)
  const revibeNetProfit = revibeRevenue - revibeTotalCost
  const revibeRoi = revibeTotalCost > 0 ? (revibeNetProfit / revibeTotalCost) * 100 : 0
  const revibeGrossMarginPct = revibeRevenue > 0 ? (revibeGrossProfit / revibeRevenue) * 100 : 0
  const revibeNetMarginPct = revibeRevenue > 0 ? (revibeNetProfit / revibeRevenue) * 100 : 0
  const revibeAvgSellingPrice = revibeTotalUnitsSold > 0 ? revibeRevenue / revibeTotalUnitsSold : 0
  const revibeAvgCostPerUnit = revibeTotalUnitsSold > 0 ? revibeTotalCost / revibeTotalUnitsSold : 0
  const revibeAvgProfitPerUnit = revibeTotalUnitsSold > 0 ? revibeNetProfit / revibeTotalUnitsSold : 0
  const revibeTotalPaid = revibeInvoicesList.reduce((sum: number, inv: any) => sum + Number(inv.amount_paid || 0), 0)
  const revibeTotalBalanceDue = revibeInvoicesList.reduce((sum: number, inv: any) => sum + Number(inv.balance_due || 0), 0)

  // Monthly settlement invoices for Revibe
  const revibeMonthlyInvoices = revibeInvoicesList.map((inv: any) => {
    const stats = revibeInvoiceStats[inv.id] || { units: 0, cogs: 0 }
    const totalAmount = Number(inv.total_amount || 0)
    const repairCost = Number(inv.repair_cost || 0)
    const netProfit = totalAmount - stats.cogs - repairCost
    const amountPaid = Number(inv.amount_paid || 0)
    const balanceDue = Number(inv.balance_due || 0)
    const totalCost = stats.cogs + repairCost
    const roi = totalCost > 0 ? (netProfit / totalCost) * 100 : 0
    return {
      id: inv.id,
      invoice_number: inv.invoice_number,
      issue_date: inv.issue_date,
      status: inv.status,
      total_amount: totalAmount,
      units: stats.units,
      cogs: stats.cogs,
      repair_cost: repairCost,
      net_profit: netProfit,
      amount_paid: amountPaid,
      balance_due: balanceDue,
      roi
    }
  }).sort((a: any, b: any) => new Date(a.issue_date).getTime() - new Date(b.issue_date).getTime())

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

  // Platform Stats
  const platformStats = {
    AMAZON: { unitsSold: 0, revenue: 0, cogsDevices: 0, cogsLogistics: 0, repairCost: 0, otherExpenses: 0, totalCost: 0, grossProfit: 0, netProfit: 0, roi: 0 },
    REVIBE: {
      unitsSold: revibeTotalUnitsSold,
      revenue: revibeRevenue,
      cogsDevices: revibeCogsDevices,
      cogsLogistics: revibeCogsLogistics,
      repairCost: revibeTotalRepairCost,
      otherExpenses: 0,
      totalCost: revibeTotalCost,
      grossProfit: revibeGrossProfit,
      netProfit: revibeNetProfit,
      roi: revibeRoi
    }
  }

  // Backward-compatible online alias metrics
  const onlineCogsDevices = revibeCogsDevices
  const onlineCogsLogistics = revibeCogsLogistics
  const onlineTotalRepairCost = revibeTotalRepairCost
  const onlineOtherExpenses = 0
  const onlineTotalUnitsSold = revibeTotalUnitsSold
  const onlineTotalCost = revibeTotalCost
  const onlineGrossProfit = revibeGrossProfit
  const onlineNetProfit = revibeNetProfit
  const onlineRoi = revibeRoi
  const onlineGrossMarginPct = revibeGrossMarginPct
  const onlineNetMarginPct = revibeNetMarginPct
  const onlineAvgSellingPrice = revibeAvgSellingPrice
  const onlineAvgCostPerUnit = revibeAvgCostPerUnit
  const onlineAvgProfitPerUnit = revibeAvgProfitPerUnit
  const onlineCogs = revibeTotalCost

  const cogsDevices = wholesaleCogsDevices + revibeCogsDevices
  const cogsLogistics = wholesaleCogsLogistics + revibeCogsLogistics
  const cogs = wholesaleCogs + revibeTotalCost
  const totalSoldShippingCost = wholesaleCogsLogistics + revibeCogsLogistics

  const onlineUnsoldValue = 0 // All unsold inventory has been restored into deals

  let inventoryValue = 0 // Wholesale and restored unsold inventory value
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
  const opexByCategory: Record<string, { category: string, total: number, count: number, items: any[] }> = {}

  if (!statementDateFilter) {
    if (!opexErr && fetchedOpex) {
      opex = fetchedOpex
      totalOpex = fetchedOpex.reduce((sum, exp) => sum + Number(exp.amount), 0)

      fetchedOpex.forEach((exp: any) => {
        const cat = exp.category || 'OTHER'
        if (!opexByCategory[cat]) {
          opexByCategory[cat] = { category: cat, total: 0, count: 0, items: [] }
        }
        opexByCategory[cat].total += Number(exp.amount || 0)
        opexByCategory[cat].count += 1
        opexByCategory[cat].items.push(exp)
      })
    }
  }

  const grossProfitWholesale = wholesaleRevenue - wholesaleCogs
  const grossProfitOnline = revibeGrossProfit
  const grossProfit = totalRevenue - (wholesaleCogsDevices + wholesaleCogsLogistics + revibeCogsDevices + revibeCogsLogistics)
  const netProfit = totalRevenue - cogs + amexProfit - totalOpex

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
  const accountsReceivableWholesale = wholesaleInvoices
    .filter((inv: any) => inv.status !== 'CANCELLED' && inv.status !== 'VOIDED')
    .reduce((sum, inv) => sum + (Number(inv.balance_due) || 0), 0)
  
  const accountsReceivableRevibe = revibeTotalBalanceDue
  const accountsReceivable = accountsReceivableWholesale + accountsReceivableRevibe

  const accountsPayable = 0
  const amexLiability = amexStuck
  const liquidCash = Math.max(0, cashAvailable)
  const retainedEarnings = netProfit

  const totalAssets = liquidCash + accountsReceivable + inventoryValue
  const totalLiabilities = accountsPayable + amexLiability
  const totalEquity = retainedEarnings

  const onlineMetricsUsd = {
    totalUnitsSold: revibeTotalUnitsSold,
    totalRevenue: revibeRevenue,
    cogsDevices: revibeCogsDevices,
    cogsLogistics: revibeCogsLogistics,
    totalRepairCost: revibeTotalRepairCost,
    otherExpenses: 0,
    totalCost: revibeTotalCost,
    grossProfit: revibeGrossProfit,
    netProfit: revibeNetProfit,
    roi: revibeRoi,
    grossMarginPct: revibeGrossMarginPct,
    netMarginPct: revibeNetMarginPct,
    avgSellingPrice: revibeAvgSellingPrice,
    avgCostPerUnit: revibeAvgCostPerUnit,
    avgProfitPerUnit: revibeAvgProfitPerUnit,
    totalPaid: revibeTotalPaid,
    totalBalanceDue: revibeTotalBalanceDue,
    monthlyInvoices: revibeMonthlyInvoices,
    platformBreakdown: {
      amazon: platformStats.AMAZON,
      revibe: platformStats.REVIBE
    },
    skuBreakdown
  }

  const onlineMetricsAed = {
    totalUnitsSold: revibeTotalUnitsSold,
    totalRevenue: revibeRevenue * USD_TO_AED,
    cogsDevices: revibeCogsDevices * USD_TO_AED,
    cogsLogistics: revibeCogsLogistics * USD_TO_AED,
    totalRepairCost: revibeTotalRepairCost * USD_TO_AED,
    otherExpenses: 0,
    totalCost: revibeTotalCost * USD_TO_AED,
    grossProfit: revibeGrossProfit * USD_TO_AED,
    netProfit: revibeNetProfit * USD_TO_AED,
    roi: revibeRoi,
    grossMarginPct: revibeGrossMarginPct,
    netMarginPct: revibeNetMarginPct,
    avgSellingPrice: revibeAvgSellingPrice * USD_TO_AED,
    avgCostPerUnit: revibeAvgCostPerUnit * USD_TO_AED,
    avgProfitPerUnit: revibeAvgProfitPerUnit * USD_TO_AED,
    totalPaid: revibeTotalPaid * USD_TO_AED,
    totalBalanceDue: revibeTotalBalanceDue * USD_TO_AED,
    monthlyInvoices: revibeMonthlyInvoices.map((inv: any) => ({
      ...inv,
      total_amount: inv.total_amount * USD_TO_AED,
      cogs: inv.cogs * USD_TO_AED,
      repair_cost: inv.repair_cost * USD_TO_AED,
      net_profit: inv.net_profit * USD_TO_AED,
      amount_paid: inv.amount_paid * USD_TO_AED,
      balance_due: inv.balance_due * USD_TO_AED
    })),
    platformBreakdown: {
      amazon: platformStats.AMAZON,
      revibe: {
        ...platformStats.REVIBE,
        revenue: platformStats.REVIBE.revenue * USD_TO_AED,
        cogsDevices: platformStats.REVIBE.cogsDevices * USD_TO_AED,
        cogsLogistics: platformStats.REVIBE.cogsLogistics * USD_TO_AED,
        repairCost: platformStats.REVIBE.repairCost * USD_TO_AED,
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
      revenueRevibe: revibeRevenue,
      cogs: cogs,
      cogsWholesale: wholesaleCogs,
      cogsOnline: onlineCogs,
      cogsRevibe: revibeTotalCost,
      cogsDevices: cogsDevices,
      cogsLogistics: cogsLogistics,
      wholesaleCogsDevices,
      wholesaleCogsLogistics,
      wholesaleRepairCost,
      onlineCogsDevices,
      onlineCogsLogistics,
      grossProfit: grossProfit,
      grossProfitWholesale,
      grossProfitOnline,
      grossProfitRevibe: revibeGrossProfit,
      amexProfit: amexProfit,
      freight: freightExpense,
      opex: totalOpex,
      opexByCategory: Object.values(opexByCategory),
      netProfit: netProfit,
      netProfitRevibe: revibeNetProfit,
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
        accountsReceivableWholesale,
        accountsReceivableRevibe,
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
      revenueRevibe: revibeRevenue * USD_TO_AED,
      cogs: cogs * USD_TO_AED,
      cogsWholesale: wholesaleCogs * USD_TO_AED,
      cogsOnline: onlineCogs * USD_TO_AED,
      cogsRevibe: revibeTotalCost * USD_TO_AED,
      cogsDevices: cogsDevices * USD_TO_AED,
      cogsLogistics: cogsLogistics * USD_TO_AED,
      wholesaleCogsDevices: wholesaleCogsDevices * USD_TO_AED,
      wholesaleCogsLogistics: wholesaleCogsLogistics * USD_TO_AED,
      wholesaleRepairCost: wholesaleRepairCost * USD_TO_AED,
      onlineCogsDevices: onlineCogsDevices * USD_TO_AED,
      onlineCogsLogistics: onlineCogsLogistics * USD_TO_AED,
      grossProfit: grossProfit * USD_TO_AED,
      grossProfitWholesale: grossProfitWholesale * USD_TO_AED,
      grossProfitOnline: grossProfitOnline * USD_TO_AED,
      grossProfitRevibe: revibeGrossProfit * USD_TO_AED,
      amexProfit: amexProfit * USD_TO_AED,
      freight: freightExpense * USD_TO_AED,
      opex: totalOpex * USD_TO_AED,
      opexByCategory: Object.values(opexByCategory).map(c => ({ ...c, total: c.total * USD_TO_AED })),
      netProfit: netProfit * USD_TO_AED,
      netProfitRevibe: revibeNetProfit * USD_TO_AED,
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
        accountsReceivableWholesale: accountsReceivableWholesale * USD_TO_AED,
        accountsReceivableRevibe: accountsReceivableRevibe * USD_TO_AED,
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

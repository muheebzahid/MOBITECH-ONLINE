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
    .select('id, total_amount, balance_due, amount_paid, status, issue_date')
    .neq('status', 'CANCELLED')
  if (fromDate) invoicesQuery = invoicesQuery.gte('issue_date', fromDate)
  if (toDate) invoicesQuery = invoicesQuery.lte('issue_date', toDate)

  let onlineOrdersQuery = supabase
    .from('online_orders')
    .select('id, total_amount, order_date')
    .neq('status', 'CANCELLED')
  if (fromDate) onlineOrdersQuery = onlineOrdersQuery.gte('order_date', fromDate)
  if (toDate) onlineOrdersQuery = onlineOrdersQuery.lte('order_date', toDate)

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

  // Execute all independent queries in parallel via Promise.all (1 roundtrip instead of 11 sequential roundtrips)
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
    { data: partners },
    { data: partnerTx },
    { data: lineItemsWithPrice }
  ] = await Promise.all([
    invoicesQuery,
    onlineOrdersQuery,
    dealsQuery,
    supabase.from('invoice_line_items').select('quantity, deal_id, deal_item_id, deal_items(unit_cost), invoices!inner(id, status, issue_date)'),
    supabase.from('invoice_line_items').select('quantity, deal_id, invoices!inner(status)'),
    supabase.from('inventory_items').select('unit_cost, logistics_cost, online_order_id').not('online_order_id', 'is', null),
    supabase.from('shipments').select('total_logistics_cost'),
    opexQuery,
    supabase.from('treasury_settings').select('*').limit(1).single(),
    supabase.from('partners').select('*').order('name', { ascending: true }),
    supabase.from('partner_transactions').select('*, partners(name)').order('created_at', { ascending: false }),
    statementDateFilter
      ? supabase.from('invoice_line_items').select('quantity, unit_price, deal_id, invoices!inner(status)')
      : Promise.resolve({ data: null, error: null } as any)
  ])

  let totalRevenue = 0
  if (!invErr && invoices) {
    totalRevenue = invoices.filter((inv: any) => inv.status !== 'DRAFT').reduce((sum, inv) => sum + Number(inv.total_amount), 0)
  }

  let onlineRevenue = 0
  if (onlineOrders) {
    onlineRevenue = onlineOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0)
  }
  totalRevenue += onlineRevenue

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
    (li: any) => li.invoices && li.invoices.status !== 'CANCELLED' && li.invoices.status !== 'DRAFT'
  )
  
  if (fromDate || toDate) {
    activeLineItems = activeLineItems.filter((li: any) => validInvoiceIds.has(li.invoices.id))
  }
  
  if (statementDateFilter && deals) {
    const validDealIds = new Set(deals.map((d: any) => d.id))
    activeLineItems = activeLineItems.filter((li: any) => validDealIds.has(li.deal_id))
  }

  if (statementDateFilter) {
    totalRevenue = 0
    let filteredRevenue = 0
    if (lineItemsWithPrice && deals) {
      const validDealIds = new Set(deals.map((d: any) => d.id))
      lineItemsWithPrice.forEach((li: any) => {
        if (li.invoices && li.invoices.status !== 'CANCELLED' && li.invoices.status !== 'DRAFT' && validDealIds.has(li.deal_id)) {
          filteredRevenue += (li.quantity || 0) * (Number(li.unit_price) || 0)
        }
      })
    }
    totalRevenue = filteredRevenue
    onlineRevenue = 0
  }

  let cogs = 0
  let cogsDevices = 0
  let cogsLogistics = 0
  let totalSoldShippingCost = 0
  
  const dealSoldQuantities: Record<string, number> = {}
  if (allLineItemsForSnapshot) {
    allLineItemsForSnapshot.forEach((li: any) => {
      if (li.invoices && li.invoices.status !== 'CANCELLED' && li.invoices.status !== 'DRAFT' && li.deal_id) {
        dealSoldQuantities[li.deal_id] = (dealSoldQuantities[li.deal_id] || 0) + (li.quantity || 0)
      }
    })
  }

  activeLineItems.forEach((li: any) => {
    if (li.deal_id) {
      const costs = dealCosts[li.deal_id]
      if (costs) {
        const itemUnitCost = li.deal_items?.unit_cost !== undefined ? Number(li.deal_items.unit_cost) : (costs.averageBaseCost - costs.dealFeePerUnit)
        const stockPlusFeeCost = itemUnitCost + costs.dealFeePerUnit
        
        cogsDevices += li.quantity * stockPlusFeeCost
        cogsLogistics += li.quantity * costs.shippingCostPerUnit
        
        const unitTotalCost = stockPlusFeeCost + costs.shippingCostPerUnit
        cogs += li.quantity * unitTotalCost
        totalSoldShippingCost += li.quantity * costs.shippingCostPerUnit
        
        amexProfit += li.quantity * (costs.amexProfitPerUnit || 0)
      }
    }
  })

  if (!statementDateFilter) {
    const validOnlineOrderIds = new Set(onlineOrders?.map((o: any) => o.id) || [])
    let onlineCogsDevices = 0
    let onlineCogsLogistics = 0
    if (onlineInventory) {
      onlineInventory.forEach(item => {
        if ((fromDate || toDate) && !validOnlineOrderIds.has(item.online_order_id)) {
          return
        }
        onlineCogsDevices += Number(item.unit_cost || 0)
        onlineCogsLogistics += Number(item.logistics_cost || 0)
      })
    }
    cogsDevices += onlineCogsDevices
    cogsLogistics += onlineCogsLogistics
    cogs += (onlineCogsDevices + onlineCogsLogistics)
    totalSoldShippingCost += onlineCogsLogistics
  }

  let inventoryValue = 0
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

  // Suppliers (ATT, ecoATM, T-Mobile) are paid 100% upfront at auction win time.
  const accountsPayable = 0
  const amexLiability = amexStuck
  const liquidCash = Math.max(0, cashAvailable)
  const partnerCapital = (partners || []).reduce((sum: number, p: any) => sum + Number(p.current_balance || 0), 0)
  const retainedEarnings = netProfit

  const totalAssets = liquidCash + accountsReceivable + inventoryValue
  const totalLiabilities = accountsPayable + amexLiability
  const totalEquity = partnerCapital + retainedEarnings

  return {
    usd: {
      revenue: totalRevenue,
      cogs: cogs,
      cogsDevices: cogsDevices,
      cogsLogistics: cogsLogistics,
      grossProfit: grossProfit,
      amexProfit: amexProfit,
      freight: freightExpense,
      opex: totalOpex,
      netProfit: netProfit,
      inventoryAsset: inventoryValue,
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
        inventoryAsset: inventoryValue,
        totalAssets,
        accountsPayable,
        amexLiability,
        totalLiabilities,
        partnerCapital,
        retainedEarnings,
        totalEquity,
        isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1
      }
    },
    aed: {
      revenue: totalRevenue * USD_TO_AED,
      cogs: cogs * USD_TO_AED,
      cogsDevices: cogsDevices * USD_TO_AED,
      cogsLogistics: cogsLogistics * USD_TO_AED,
      grossProfit: grossProfit * USD_TO_AED,
      amexProfit: amexProfit * USD_TO_AED,
      freight: freightExpense * USD_TO_AED,
      opex: totalOpex * USD_TO_AED,
      netProfit: netProfit * USD_TO_AED,
      inventoryAsset: inventoryValue * USD_TO_AED,
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
        inventoryAsset: inventoryValue * USD_TO_AED,
        totalAssets: totalAssets * USD_TO_AED,
        accountsPayable: accountsPayable * USD_TO_AED,
        amexLiability: amexLiability * USD_TO_AED,
        totalLiabilities: totalLiabilities * USD_TO_AED,
        partnerCapital: partnerCapital * USD_TO_AED,
        retainedEarnings: retainedEarnings * USD_TO_AED,
        totalEquity: totalEquity * USD_TO_AED,
        isBalanced: Math.abs(totalAssets * USD_TO_AED - ((totalLiabilities + totalEquity) * USD_TO_AED)) < 1
      }
    },
    expenseHistory: opex || [],
    partners: partners || [],
    partnerTransactions: partnerTx || []
  }
}

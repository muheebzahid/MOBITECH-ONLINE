import { requireWriteAccess } from '@/lib/admin/actions'
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Constant conversion rate
const USD_TO_AED = 3.674

export async function logExpense(category: string, description: string, amount: number, referenceLink?: string, expenseDate?: string) {
  await requireWriteAccess();

  await requireWriteAccess();

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
  await requireWriteAccess();

  await requireWriteAccess();

  const supabase = await createClient()
  const { error } = await supabase.from('operating_expenses').delete().eq('id', id)
  if (error) throw error
  revalidatePath('/dashboard/accounting')
}

export async function editExpense(id: string, data: { amount?: number, category?: string, description?: string, expense_date?: string, reference_link?: string }) {
  await requireWriteAccess();

  await requireWriteAccess();

  const supabase = await createClient()
  const { error } = await supabase.from('operating_expenses').update(data).eq('id', id)
  if (error) throw error
  revalidatePath('/dashboard/accounting')
}

export async function getFinancialSummary(statementDateFilter?: string, fromDate?: string, toDate?: string) {
  const supabase = await createClient()

  // 1. Total Revenue (From Invoices)
  // Sum of total_amount for all non-cancelled invoices
  let invoicesQuery = supabase
    .from('invoices')
    .select('id, total_amount, status, issue_date')
    .neq('status', 'CANCELLED')
    
  if (fromDate) invoicesQuery = invoicesQuery.gte('issue_date', fromDate)
  if (toDate) invoicesQuery = invoicesQuery.lte('issue_date', toDate)
  
  const { data: invoices, error: invErr } = await invoicesQuery
  
  let totalRevenue = 0
  if (!invErr && invoices) {
    totalRevenue = invoices.filter((inv: any) => inv.status !== 'DRAFT').reduce((sum, inv) => sum + Number(inv.total_amount), 0)
  }

  // Add Online Sales Revenue
  let onlineOrdersQuery = supabase
    .from('online_orders')
    .select('id, total_amount, order_date')
    .neq('status', 'CANCELLED')
    
  if (fromDate) onlineOrdersQuery = onlineOrdersQuery.gte('order_date', fromDate)
  if (toDate) onlineOrdersQuery = onlineOrdersQuery.lte('order_date', toDate)

  const { data: onlineOrders } = await onlineOrdersQuery

  let onlineRevenue = 0
  if (onlineOrders) {
    onlineRevenue = onlineOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0)
  }
  totalRevenue += onlineRevenue

  // Fetch all deals with their shipment details and funding details
  let dealsQuery = supabase
    .from('deals')
    .select(`
      id,
      quantity,
      unit_cost,
      auction_fee,
      other_fees,
      total_commitment,
      funding_source,
      amex_amount,
      cash_amount,
      cashback_amount,
      cashback_received,
      status,
      amex_statement_date,
      shipment_deals (
        shipments (
          id,
          total_logistics_cost,
          shipment_deals (
            deals (
              quantity
            )
          )
        )
      )
    `)
    
  if (statementDateFilter) {
    dealsQuery = dealsQuery.eq('amex_statement_date', statementDateFilter)
  }
  
  const { data: deals } = await dealsQuery
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

  // If filtering by statement date, we must only include invoices that are linked to the deals in this statement date
  // Fetch all active invoice line items
  let lineItemsQuery = supabase
    .from('invoice_line_items')
    .select('quantity, deal_id, deal_item_id, deal_items(unit_cost), invoices!inner(id, status, issue_date)')
    
  // We can't filter the join easily in supabase-js for the inner table, so we'll filter in memory or pass the valid invoice IDs
  const validInvoiceIds = new Set(invoices?.map((i: any) => i.id) || [])
  const { data: allLineItems } = await lineItemsQuery

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

  // We need to re-calculate Revenue if statementDateFilter is applied
  if (statementDateFilter) {
    totalRevenue = 0 // Reset revenue, we will sum it up from activeLineItems
    // Wait, activeLineItems doesn't have the invoice total, but we can compute the revenue 
    // actually it's easier to just fetch invoices for the valid deals, or compute revenue by unit price?
    // Invoice line items have unit_price, let's fetch it:
    const { data: lineItemsWithPrice } = await supabase
      .from('invoice_line_items')
      .select('quantity, unit_price, deal_id, invoices!inner(status)')
    
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
    onlineRevenue = 0 // Exclude online sales if filtering by statement date
  }

  // Sum up COGS and pro-rated shipping cost components for sold items
  let cogs = 0
  let cogsDevices = 0
  let cogsLogistics = 0
  let totalSoldShippingCost = 0
  
  // Track quantities sold per deal to calculate asset snapshot (we use a separate unbounded query for inventory snapshot)
  const { data: allLineItemsForSnapshot } = await supabase
    .from('invoice_line_items')
    .select('quantity, deal_id, invoices!inner(status)')
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
        
        // Add Amex profit pro-rated for these sold units
        amexProfit += li.quantity * (costs.amexProfitPerUnit || 0)
      }
    }
  })

  // Add Online Sales COGS (direct device costs and pro-rated logistics cost of allocated devices)
  if (!statementDateFilter) {
    const validOnlineOrderIds = new Set(onlineOrders?.map((o: any) => o.id) || [])
    let onlineInvQuery = supabase
      .from('inventory_items')
      .select('unit_cost, logistics_cost, online_order_id')
      .not('online_order_id', 'is', null)

    const { data: onlineInventory } = await onlineInvQuery

    let onlineCogsDevices = 0
    let onlineCogsLogistics = 0
    if (onlineInventory) {
      onlineInventory.forEach(item => {
        if ((fromDate || toDate) && !validOnlineOrderIds.has(item.online_order_id)) {
          return // Skip if filtered out by date
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

  // Calculate current inventory asset value (Unsold inventory)
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

  // 3. Freight & Logistics Expenses (raw total logistics costs)
  let freightExpense = 0
  if (!statementDateFilter) {
    const { data: shipments, error: shipErr } = await supabase
      .from('shipments')
      .select('total_logistics_cost')
      
    if (!shipErr && shipments) {
      freightExpense = shipments.reduce((sum, ship) => sum + Number(ship.total_logistics_cost || 0), 0)
    }

    // Deduct pro-rated shipping cost of sold units to prevent double-counting
    freightExpense = Math.max(0, freightExpense - totalSoldShippingCost)
  }

  // 4. Operating Expenses
  let totalOpex = 0
  let opex: any[] = []
  if (!statementDateFilter) {
    let opexQuery = supabase
      .from('operating_expenses')
      .select('*')
      .order('expense_date', { ascending: false })
      
    if (fromDate) opexQuery = opexQuery.gte('expense_date', fromDate)
    if (toDate) opexQuery = opexQuery.lte('expense_date', toDate)
    
    const { data: fetchedOpex, error: opexErr } = await opexQuery
      
    if (!opexErr && fetchedOpex) {
      opex = fetchedOpex
      totalOpex = fetchedOpex.reduce((sum, exp) => sum + Number(exp.amount), 0)
    }
  }

  // 5. Calculations
  const grossProfit = totalRevenue - cogs
  const netProfit = grossProfit + amexProfit - totalOpex

  // 6. Treasury Controls & Calculations
  const { data: settings } = await supabase.from('treasury_settings').select('*').single()
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

  // 7. Partner Balances & Profit Withdrawal Details
  const { data: partners } = await supabase.from('partners').select('*').order('name', { ascending: true })
  const { data: partnerTx } = await supabase
    .from('partner_transactions')
    .select('*, partners(name)')
    .order('created_at', { ascending: false })

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
      }
    },
    expenseHistory: opex || [],
    partners: partners || [],
    partnerTransactions: partnerTx || []
  }
}

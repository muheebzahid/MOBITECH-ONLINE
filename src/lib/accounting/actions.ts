'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Constant conversion rate
const USD_TO_AED = 3.674

export async function logExpense(category: string, description: string, amount: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('operating_expenses')
    .insert({
      category,
      description,
      amount,
      logged_by: user?.id
    })
    .select()
    .single()

  if (error) throw error
  revalidatePath('/dashboard/accounting')
  return data
}

export async function getFinancialSummary() {
  const supabase = await createClient()

  // 1. Total Revenue (From Invoices)
  // Sum of total_amount for all non-cancelled invoices
  const { data: invoices, error: invErr } = await supabase
    .from('invoices')
    .select('total_amount, status')
    .neq('status', 'CANCELLED')
  
  let totalRevenue = 0
  if (!invErr && invoices) {
    totalRevenue = invoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0)
  }

  // 2. Cost of Goods Sold (From Deals)
  // COGS is calculated based on Deals. To be exact, it should be the cost of items actually sold.
  // For simplicity, we will calculate the Total Commitment of ALL Deals (Inventory Asset + COGS)
  // But strictly, COGS is the cost of SOLD inventory.
  const { data: soldInventory, error: invtErr } = await supabase
    .from('inventory_items')
    .select('total_cost')
    .eq('status', 'SOLD')
  
  let cogs = 0
  if (!invtErr && soldInventory) {
    cogs = soldInventory.reduce((sum, item) => sum + Number(item.total_cost || 0), 0)
  }

  // Calculate current inventory value (Asset, not expense)
  const { data: activeInventory, error: actInvtErr } = await supabase
    .from('inventory_items')
    .select('total_cost')
    .neq('status', 'SOLD')
    .neq('status', 'RETURNED')
    
  let inventoryValue = 0
  if (!actInvtErr && activeInventory) {
    inventoryValue = activeInventory.reduce((sum, item) => sum + Number(item.total_cost || 0), 0)
  }

  // 3. Freight & Logistics Expenses
  const { data: shipments, error: shipErr } = await supabase
    .from('shipments')
    .select('total_cost')
    
  let freightExpense = 0
  if (!shipErr && shipments) {
    freightExpense = shipments.reduce((sum, ship) => sum + Number(ship.total_cost || 0), 0)
  }

  // 4. Operating Expenses
  const { data: opex, error: opexErr } = await supabase
    .from('operating_expenses')
    .select('*')
    .order('expense_date', { ascending: false })
    
  let totalOpex = 0
  if (!opexErr && opex) {
    totalOpex = opex.reduce((sum, exp) => sum + Number(exp.amount), 0)
  }

  // 5. Calculations
  const grossProfit = totalRevenue - cogs
  const netProfit = grossProfit - freightExpense - totalOpex

  return {
    usd: {
      revenue: totalRevenue,
      cogs: cogs,
      grossProfit: grossProfit,
      freight: freightExpense,
      opex: totalOpex,
      netProfit: netProfit,
      inventoryAsset: inventoryValue
    },
    aed: {
      revenue: totalRevenue * USD_TO_AED,
      cogs: cogs * USD_TO_AED,
      grossProfit: grossProfit * USD_TO_AED,
      freight: freightExpense * USD_TO_AED,
      opex: totalOpex * USD_TO_AED,
      netProfit: netProfit * USD_TO_AED,
      inventoryAsset: inventoryValue * USD_TO_AED
    },
    expenseHistory: opex || []
  }
}

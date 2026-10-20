const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const USD_TO_AED = 3.674;
const REVIBE_CLIENT_ID = 'ed2d7d34-799d-46eb-ad8d-c7ae7ed04c66';
const isRevibe = (inv) => Boolean(
  inv && (
    inv.client_id === REVIBE_CLIENT_ID || 
    (typeof inv.customer_name === 'string' && inv.customer_name.toUpperCase().includes('REVIBE'))
  )
);

async function calculateSummaryForClient(supabase, envName) {
  let invoicesQuery = supabase
    .from('invoices')
    .select('id, invoice_number, client_id, customer_name, total_amount, balance_due, amount_paid, repair_cost, status, issue_date')
    .neq('status', 'CANCELLED')
    .neq('client_id', '4b6cd459-dd29-4be7-a28e-58cbbed31285');

  let dealsQuery = supabase
    .from('deals')
    .select(`
      id, quantity, unit_cost, auction_fee, other_fees, total_commitment, funding_source, amex_amount, cash_amount, cashback_amount, cashback_received, status, amex_statement_date,
      shipment_deals ( shipments ( id, total_logistics_cost, shipment_deals ( deals ( quantity ) ) ) ),
      items:deal_items ( * )
    `);

  let opexQuery = supabase
    .from('operating_expenses')
    .select('*')
    .order('expense_date', { ascending: false });

  const [
    { data: invoices, error: invErr },
    { data: deals, error: dealsErr },
    { data: allLineItems, error: liErr },
    { data: allLineItemsForSnapshot, error: snapErr },
    { data: shipments, error: shipErr },
    { data: fetchedOpex, error: opexErr },
    { data: settings, error: settErr }
  ] = await Promise.all([
    invoicesQuery,
    dealsQuery,
    supabase.from('invoice_line_items').select('id, quantity, unit_price, total_price, repair_cost, description, deal_id, deal_item_id, deal_items(*), invoices!inner(id, invoice_number, status, issue_date, client_id, customer_name, repair_cost)'),
    supabase.from('invoice_line_items').select('quantity, deal_id, invoices!inner(status)'),
    supabase.from('shipments').select('total_logistics_cost'),
    opexQuery,
    supabase.from('treasury_settings').select('*').limit(1).maybeSingle()
  ]);

  if (invErr) console.error(`[${envName}] invErr:`, invErr.message);
  if (dealsErr) console.error(`[${envName}] dealsErr:`, dealsErr.message);
  if (liErr) console.error(`[${envName}] liErr:`, liErr.message);
  if (shipErr) console.error(`[${envName}] shipErr:`, shipErr.message);
  if (opexErr) console.error(`[${envName}] opexErr:`, opexErr.message);

  const wholesaleInvoices = (invoices || []).filter((inv) => !isRevibe(inv));
  const revibeInvoicesList = (invoices || []).filter((inv) => isRevibe(inv) && inv.status !== 'CANCELLED' && inv.status !== 'DRAFT');

  let wholesaleRevenue = 0;
  let revibeRevenue = 0;

  if (!invErr && invoices) {
    wholesaleRevenue = wholesaleInvoices
      .filter((inv) => inv.status !== 'DRAFT')
      .reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);

    revibeRevenue = revibeInvoicesList
      .filter((inv) => inv.status !== 'DRAFT')
      .reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
  }

  const totalRevenue = wholesaleRevenue + revibeRevenue;

  const dealCosts = {};
  let amexProfit = 0;
  if (deals) {
    deals.forEach((deal) => {
      const dealQty = deal.quantity || 0;
      const averageBaseCost = dealQty > 0 ? (deal.total_commitment || 0) / dealQty : 0;
      const dealFeePerUnit = dealQty > 0 ? ((Number(deal.auction_fee || 0) + Number(deal.other_fees || 0)) / dealQty) : 0;
      
      const shipment = deal.shipment_deals?.[0]?.shipments;
      let shippingCostPerUnit = 0;
      if (shipment) {
        const totalShipmentUnits = shipment.shipment_deals?.reduce((sum, sd) => sum + (sd.deals?.quantity || 0), 0) || 0;
        shippingCostPerUnit = totalShipmentUnits > 0 ? (shipment.total_logistics_cost || 0) / totalShipmentUnits : 0;
      }
      
      let amexProfitPerUnit = 0;
      if (deal.cashback_received && (deal.funding_source === 'AMEX' || deal.funding_source === 'MIXED')) {
        const amexAmount = Number(deal.amex_amount) || (deal.funding_source === 'MIXED' ? Number(deal.total_commitment) / 2 : Number(deal.total_commitment));
        amexProfitPerUnit = (amexAmount * 0.02) / (dealQty || 1);
      }
      
      dealCosts[deal.id] = { averageBaseCost, dealFeePerUnit, shippingCostPerUnit, amexProfitPerUnit };
    });
  }

  let activeLineItems = (allLineItems || []).filter(
    (li) => li.invoices && li.invoices.status !== 'CANCELLED' && li.invoices.status !== 'DRAFT' && li.invoices.client_id !== '4b6cd459-dd29-4be7-a28e-58cbbed31285'
  );

  const dealSoldQuantities = {};
  if (allLineItemsForSnapshot) {
    allLineItemsForSnapshot.forEach((li) => {
      if (li.invoices && li.invoices.status !== 'CANCELLED' && li.invoices.status !== 'DRAFT' && li.deal_id) {
        dealSoldQuantities[li.deal_id] = (dealSoldQuantities[li.deal_id] || 0) + (li.quantity || 0);
      }
    });
  }

  let wholesaleCogsDevices = 0;
  let wholesaleCogsLogistics = 0;
  let wholesaleRepairCost = 0;
  let wholesaleCogs = 0;

  let revibeCogsDevices = 0;
  let revibeCogsLogistics = 0;
  let revibeTotalUnitsSold = 0;

  const dealMap = new Map();
  if (deals) {
    deals.forEach((d) => dealMap.set(d.id, d));
  }

  activeLineItems.forEach((li) => {
    const isRev = isRevibe(li.invoices);
    const qty = Number(li.quantity || 0);

    let stockPlusFeeCost = 0;
    let shippingCostPerUnit = 0;

    if (li.deal_id) {
      const costs = dealCosts[li.deal_id];
      if (costs) {
        const itemUnitCost = li.deal_items?.unit_cost !== undefined ? Number(li.deal_items.unit_cost) : (costs.averageBaseCost - costs.dealFeePerUnit);
        stockPlusFeeCost = itemUnitCost + costs.dealFeePerUnit;
        shippingCostPerUnit = costs.shippingCostPerUnit;

        if (!isRev) {
          amexProfit += qty * (costs.amexProfitPerUnit || 0);
        }
      }
    }

    if (isRev) {
      revibeTotalUnitsSold += qty;
      revibeCogsDevices += qty * stockPlusFeeCost;
      revibeCogsLogistics += qty * shippingCostPerUnit;
    } else {
      let itemRepairCost = Number(li.repair_cost || li.deal_items?.repair_cost || 0);
      if (!itemRepairCost) {
        const dealObj = dealMap.get(li.deal_id);
        if (dealObj?.items?.length === 1) {
          itemRepairCost = Number(dealObj.items[0]?.repair_cost || 0);
        }
      }
      wholesaleCogsDevices += qty * stockPlusFeeCost;
      wholesaleCogsLogistics += qty * shippingCostPerUnit;
      wholesaleRepairCost += qty * itemRepairCost;
      wholesaleCogs += qty * (stockPlusFeeCost + shippingCostPerUnit + itemRepairCost);
    }
  });

  const revibeTotalRepairCost = revibeInvoicesList.reduce((sum, inv) => sum + Number(inv.repair_cost || 0), 0);
  const revibeTotalCost = revibeCogsDevices + revibeCogsLogistics + revibeTotalRepairCost;
  const revibeGrossProfit = revibeRevenue - (revibeCogsDevices + revibeCogsLogistics);
  const revibeNetProfit = revibeRevenue - revibeTotalCost;
  const revibeRoi = revibeTotalCost > 0 ? (revibeNetProfit / revibeTotalCost) * 100 : 0;
  const revibeTotalPaid = revibeInvoicesList.reduce((sum, inv) => sum + Number(inv.amount_paid || 0), 0);
  const revibeTotalBalanceDue = revibeInvoicesList.reduce((sum, inv) => sum + Number(inv.balance_due || 0), 0);

  const cogsDevices = wholesaleCogsDevices + revibeCogsDevices;
  const cogsLogistics = wholesaleCogsLogistics + revibeCogsLogistics;
  const cogs = wholesaleCogs + revibeTotalCost;
  const totalSoldShippingCost = wholesaleCogsLogistics + revibeCogsLogistics;

  let inventoryValue = 0;
  if (deals) {
    deals.forEach((deal) => {
      const soldQty = dealSoldQuantities[deal.id] || 0;
      const unsoldQty = Math.max(0, (deal.quantity || 0) - soldQty);
      const costs = dealCosts[deal.id];
      if (costs && unsoldQty > 0) {
        const unitTotalCost = costs.averageBaseCost + costs.shippingCostPerUnit;
        inventoryValue += unsoldQty * unitTotalCost;
      }
    });
  }

  let freightExpense = 0;
  if (!shipErr && shipments) {
    const totalActualShipping = shipments.reduce((sum, s) => sum + Number(s.total_logistics_cost || 0), 0);
    freightExpense = Math.max(0, totalActualShipping - totalSoldShippingCost);
  }

  const grossProfit = totalRevenue - cogs;
  const expenses = (fetchedOpex || []).reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
  const totalOperatingExpenses = expenses + freightExpense;
  const netProfit = grossProfit - totalOperatingExpenses + amexProfit;
  const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  const totalWholesaleInvoiced = wholesaleInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
  const totalWholesalePaid = wholesaleInvoices.reduce((sum, inv) => sum + Number(inv.amount_paid || 0), 0);
  const wholesaleAccountsReceivable = Math.max(0, totalWholesaleInvoiced - totalWholesalePaid);
  const accountsReceivable = wholesaleAccountsReceivable + revibeTotalBalanceDue;

  return {
    totalRevenue: totalRevenue.toFixed(2),
    wholesaleRevenue: wholesaleRevenue.toFixed(2),
    revibeRevenue: revibeRevenue.toFixed(2),
    revibeUnitsSold: revibeTotalUnitsSold,
    cogs: cogs.toFixed(2),
    wholesaleCogs: wholesaleCogs.toFixed(2),
    revibeTotalCost: revibeTotalCost.toFixed(2),
    revibeNetProfit: revibeNetProfit.toFixed(2),
    revibeRoi: revibeRoi.toFixed(2) + '%',
    grossProfit: grossProfit.toFixed(2),
    expenses: expenses.toFixed(2),
    freightExpense: freightExpense.toFixed(2),
    totalOperatingExpenses: totalOperatingExpenses.toFixed(2),
    netProfit: netProfit.toFixed(2),
    netMargin: netMargin.toFixed(2) + '%',
    inventoryValue: inventoryValue.toFixed(2),
    accountsReceivable: accountsReceivable.toFixed(2),
    revibeBalanceDue: revibeTotalBalanceDue.toFixed(2),
    invoicesCount: (invoices || []).length,
    revibeInvoicesCount: revibeInvoicesList.length,
    lineItemsCount: (allLineItems || []).length,
    dealsCount: (deals || []).length
  };
}

async function main() {
  const localSupabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const onlineSupabase = createClient(process.env.ONLINE_SUPABASE_URL, process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY);

  console.log('Calculating Accounting Financial Summary for Local...');
  const localSummary = await calculateSummaryForClient(localSupabase, 'LOCAL');

  console.log('Calculating Accounting Financial Summary for Online...');
  const onlineSummary = await calculateSummaryForClient(onlineSupabase, 'ONLINE');

  console.log('\n======================================================');
  console.log('       ACCOUNTING FINANCIAL SUMMARY COMPARISON');
  console.log('======================================================');
  const allKeys = Object.keys(localSummary);
  let matches = 0;
  let mismatches = 0;

  for (const key of allKeys) {
    const loc = localSummary[key];
    const onl = onlineSummary[key];
    const match = loc === onl;
    if (match) matches++; else mismatches++;
    console.log(`${match ? '✅' : '❌'} ${key.padEnd(25)}: Local = ${String(loc).padEnd(15)} | Online = ${onl}`);
  }

  console.log('======================================================');
  console.log(`Results: ${matches} matching metrics, ${mismatches} mismatches`);
}

main().catch(console.error);

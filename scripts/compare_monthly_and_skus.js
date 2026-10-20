const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const REVIBE_CLIENT_ID = 'ed2d7d34-799d-46eb-ad8d-c7ae7ed04c66';
const isRevibe = (inv) => Boolean(
  inv && (
    inv.client_id === REVIBE_CLIENT_ID || 
    (typeof inv.customer_name === 'string' && inv.customer_name.toUpperCase().includes('REVIBE'))
  )
);

async function getDetailedRevibe(sb) {
  const { data: invoices } = await sb
    .from('invoices')
    .select('id, invoice_number, client_id, customer_name, total_amount, balance_due, amount_paid, repair_cost, status, issue_date')
    .neq('status', 'CANCELLED')
    .neq('status', 'DRAFT')
    .neq('client_id', '4b6cd459-dd29-4be7-a28e-58cbbed31285');

  const { data: deals } = await sb
    .from('deals')
    .select(`
      id, quantity, unit_cost, auction_fee, other_fees, total_commitment, funding_source, amex_amount, cash_amount, cashback_amount, cashback_received, status, amex_statement_date,
      shipment_deals ( shipments ( id, total_logistics_cost, shipment_deals ( deals ( quantity ) ) ) ),
      items:deal_items ( * )
    `);

  const { data: allLineItems } = await sb.from('invoice_line_items').select('id, quantity, unit_price, total_price, repair_cost, description, deal_id, deal_item_id, deal_items(*), invoices!inner(id, invoice_number, status, issue_date, client_id, customer_name, repair_cost)');

  const revibeInvoicesList = (invoices || []).filter(isRevibe);

  const dealCosts = {};
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
      dealCosts[deal.id] = { averageBaseCost, dealFeePerUnit, shippingCostPerUnit };
    });
  }

  const activeLineItems = (allLineItems || []).filter(
    (li) => li.invoices && li.invoices.status !== 'CANCELLED' && li.invoices.status !== 'DRAFT' && isRevibe(li.invoices)
  );

  const revibeInvoiceStats = {};
  revibeInvoicesList.forEach((inv) => {
    revibeInvoiceStats[inv.id] = { units: 0, cogs: 0 };
  });

  activeLineItems.forEach((li) => {
    const qty = Number(li.quantity || 0);
    let stockPlusFeeCost = 0;
    let shippingCostPerUnit = 0;

    if (li.deal_id) {
      const costs = dealCosts[li.deal_id];
      if (costs) {
        const itemUnitCost = li.deal_items?.unit_cost !== undefined ? Number(li.deal_items.unit_cost) : (costs.averageBaseCost - costs.dealFeePerUnit);
        stockPlusFeeCost = itemUnitCost + costs.dealFeePerUnit;
        shippingCostPerUnit = costs.shippingCostPerUnit;
      }
    }

    const invId = li.invoices?.id;
    if (invId) {
      if (!revibeInvoiceStats[invId]) {
        revibeInvoiceStats[invId] = { units: 0, cogs: 0 };
      }
      revibeInvoiceStats[invId].units += qty;
      revibeInvoiceStats[invId].cogs += qty * (stockPlusFeeCost + shippingCostPerUnit);
    }
  });

  const revibeMonthlyInvoices = revibeInvoicesList.map((inv) => {
    const stats = revibeInvoiceStats[inv.id] || { units: 0, cogs: 0 };
    const totalAmount = Number(inv.total_amount || 0);
    const repairCost = Number(inv.repair_cost || 0);
    const netProfit = totalAmount - stats.cogs - repairCost;
    const amountPaid = Number(inv.amount_paid || 0);
    const balanceDue = Number(inv.balance_due || 0);
    const totalCost = stats.cogs + repairCost;
    const roi = totalCost > 0 ? (netProfit / totalCost) * 100 : 0;
    return {
      invoice_number: inv.invoice_number,
      issue_date: inv.issue_date,
      status: inv.status,
      total_amount: totalAmount.toFixed(2),
      units: stats.units,
      cogs: stats.cogs.toFixed(2),
      repair_cost: repairCost.toFixed(2),
      net_profit: netProfit.toFixed(2),
      amount_paid: amountPaid.toFixed(2),
      balance_due: balanceDue.toFixed(2),
      roi: roi.toFixed(2) + '%'
    };
  }).sort((a, b) => a.invoice_number.localeCompare(b.invoice_number));

  return revibeMonthlyInvoices;
}

async function main() {
  const localSupabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const onlineSupabase = createClient(process.env.ONLINE_SUPABASE_URL, process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY);

  const loc = await getDetailedRevibe(localSupabase);
  const onl = await getDetailedRevibe(onlineSupabase);

  console.log('=== REVIBE MONTHLY INVOICE SETTLEMENTS AUDIT ===\n');
  console.log('LOCAL SETTLEMENTS:');
  console.table(loc);
  console.log('ONLINE SETTLEMENTS:');
  console.table(onl);

  let match = JSON.stringify(loc) === JSON.stringify(onl);
  console.log(`Parity Status: ${match ? '✅ 100% IDENTICAL' : '❌ MISMATCH'}`);
}

main().catch(console.error);

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const REVIBE_CLIENT_ID = 'ed2d7d34-799d-46eb-ad8d-c7ae7ed04c66';
const isRevibe = (inv) => Boolean(
  inv && (
    inv.client_id === REVIBE_CLIENT_ID || 
    (typeof inv.customer_name === 'string' && inv.customer_name.toUpperCase().includes('REVIBE'))
  )
);

async function getSkus(sb) {
  const { data: deals } = await sb
    .from('deals')
    .select(`
      id, quantity, unit_cost, auction_fee, other_fees, total_commitment, funding_source, amex_amount, cash_amount, cashback_amount, cashback_received, status, amex_statement_date,
      shipment_deals ( shipments ( id, total_logistics_cost, shipment_deals ( deals ( quantity ) ) ) ),
      items:deal_items ( * )
    `);

  const { data: allLineItems } = await sb.from('invoice_line_items').select('id, quantity, unit_price, total_price, repair_cost, description, deal_id, deal_item_id, deal_items(*), invoices!inner(id, invoice_number, status, issue_date, client_id, customer_name, repair_cost)');

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

  const skuMap = new Map();

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

    const desc = li.description || '';
    let model = li.deal_items?.model || '';
    let storage = li.deal_items?.storage || '';
    let grade = li.deal_items?.grade || '';

    if (!model) {
      const match = desc.match(/(iPhone\s+[^\s]+(?:\s+(?:Pro\s+Max|Pro|Plus|Mini))?)/i);
      model = match ? match[1] : (desc.split('(')[0].trim() || 'Unknown Model');
      const storageMatch = desc.match(/(64GB|128GB|256GB|512GB|1TB)/i);
      if (storageMatch) storage = storageMatch[1].toUpperCase();
      const gradeMatch = desc.match(/Grade\s+([A-Za-z0-9_]+)/i);
      if (gradeMatch) grade = gradeMatch[1];
    }

    const skuKey = `${model}__${storage}__${grade}`.toUpperCase();
    if (!skuMap.has(skuKey)) {
      skuMap.set(skuKey, {
        skuKey,
        model,
        storage,
        grade,
        quantity: 0,
        revenue: 0,
        totalCost: 0,
        netProfit: 0,
        roi: '0%'
      });
    }

    const entry = skuMap.get(skuKey);
    const itemRev = qty * Number(li.unit_price || 0);
    const itemDevCost = qty * stockPlusFeeCost;
    const itemLogCost = qty * shippingCostPerUnit;
    const itemRepCost = Number(li.repair_cost || 0);

    entry.quantity += qty;
    entry.revenue += itemRev;
    entry.totalCost += (itemDevCost + itemLogCost + itemRepCost);
  });

  const skus = Array.from(skuMap.values()).map(s => {
    const netProfit = s.revenue - s.totalCost;
    const roi = s.totalCost > 0 ? (netProfit / s.totalCost) * 100 : 0;
    return {
      sku: `${s.model} ${s.storage} (${s.grade})`,
      qty: s.quantity,
      revenue: s.revenue.toFixed(2),
      cost: s.totalCost.toFixed(2),
      profit: netProfit.toFixed(2),
      roi: roi.toFixed(1) + '%'
    };
  }).sort((a, b) => b.qty - a.qty);

  return skus;
}

async function main() {
  const localSupabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const onlineSupabase = createClient(process.env.ONLINE_SUPABASE_URL, process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY);

  const loc = await getSkus(localSupabase);
  const onl = await getSkus(onlineSupabase);

  console.log(`Local SKUs count: ${loc.length}, Online SKUs count: ${onl.length}`);
  let match = JSON.stringify(loc) === JSON.stringify(onl);
  console.log(`SKU Parity Status: ${match ? '✅ 100% IDENTICAL' : '❌ MISMATCH'}`);
  if (!match) {
    console.log('Local:', loc);
    console.log('Online:', onl);
  } else {
    console.log('Top 5 SKUs:');
    console.table(loc.slice(0, 5));
  }
}

main().catch(console.error);

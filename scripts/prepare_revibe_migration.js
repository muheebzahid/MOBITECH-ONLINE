const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');

const env = dotenv.parse(fs.readFileSync('.env.local'));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function inspectMonthlyItemsDetailed() {
  const { data: orders } = await supabase.from('online_orders').select('*').order('sale_date');
  const { data: invItems } = await supabase.from('inventory_items').select('*').not('online_order_id', 'is', null);
  const { data: dealItems } = await supabase.from('deal_items').select('*');
  const { data: deals } = await supabase.from('deals').select('id, deal_number');

  const dealMap = {};
  for (const d of deals) dealMap[d.id] = d.deal_number;

  const invByOrderId = {};
  for (const it of invItems) {
    if (!invByOrderId[it.online_order_id]) invByOrderId[it.online_order_id] = [];
    invByOrderId[it.online_order_id].push(it);
  }

  const months = ['2026-04', '2026-08', '2026-09', '2026-10'];
  for (const m of months) {
    const mOrders = orders.filter(o => (o.sale_date || o.created_at || '').startsWith(m));
    const totalRev = mOrders.reduce((s,o) => s + Number(o.total_amount||0), 0);
    
    // Group items by deal_id + model + storage + grade
    const lineItemGroups = {};
    for (const o of mOrders) {
      const units = invByOrderId[o.id] || [];
      if (units.length > 0) {
        for (const u of units) {
          const key = `${u.deal_id}_${u.model}_${u.storage || ''}_${u.grade || ''}`;
          if (!lineItemGroups[key]) {
            lineItemGroups[key] = {
              deal_id: u.deal_id,
              model: u.model,
              storage: u.storage,
              grade: u.grade,
              unit_cost: Number(u.unit_cost || 0),
              quantity: 0,
              total_revenue: 0,
              unit_price: 0
            };
          }
          lineItemGroups[key].quantity += 1;
          // Approximate or exact price from order
          const orderUnitPrice = Number(o.total_amount || 0) / units.length;
          lineItemGroups[key].total_revenue += orderUnitPrice;
        }
      } else {
        // Unlinked order
        const key = `UNLINKED_${o.order_number}`;
        lineItemGroups[key] = {
          deal_id: null,
          model: 'Online Order ' + o.order_number,
          storage: '',
          grade: '',
          unit_cost: 0,
          quantity: 1,
          total_revenue: Number(o.total_amount || 0),
          unit_price: Number(o.total_amount || 0)
        };
      }
    }

    console.log(`\n================== MONTH ${m} ==================`);
    console.log(`Orders: ${mOrders.length} | Total Revenue: $${totalRev.toFixed(2)}`);
    for (const [k, g] of Object.entries(lineItemGroups)) {
      g.unit_price = g.quantity > 0 ? (g.total_revenue / g.quantity) : 0;
      const dNum = dealMap[g.deal_id] || 'NO_DEAL';
      console.log(`  - [${dNum}] ${g.model} ${g.storage} (${g.grade}): Qty ${g.quantity} @ $${g.unit_price.toFixed(2)} = $${g.total_revenue.toFixed(2)} (Cost/u: $${g.unit_cost.toFixed(2)})`);
    }
  }
}

inspectMonthlyItemsDetailed();

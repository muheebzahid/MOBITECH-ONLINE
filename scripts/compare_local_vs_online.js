const { createClient } = require('@supabase/supabase-js');
const { Client: PgClient } = require('pg');

async function main() {
  console.log('=== MOBITECH ERP: LOCAL VS ONLINE AUDIT ===\n');

  // 1. Connect Local Postgres
  const localPg = new PgClient({
    host: '127.0.0.1',
    port: 54322,
    user: 'postgres',
    password: 'postgres',
    database: 'postgres'
  });
  await localPg.connect();

  // 2. Connect Online Supabase
  require('dotenv').config({ path: '.env.local' });
  const onlineUrl = process.env.ONLINE_SUPABASE_URL || 'https://aivcmkwclfipntadipec.supabase.co';
  const onlineKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY || '';
  const onlineSupabase = createClient(onlineUrl, onlineKey);

  // A. Schema: repair_cost in invoices & invoice_line_items
  const localInvCols = await localPg.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'repair_cost'");
  const localLiCols = await localPg.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'invoice_line_items' AND column_name = 'repair_cost'");
  
  const hasLocalRepairCost = localInvCols.rows.length > 0 && localLiCols.rows.length > 0;

  const { data: onlineInvSample, error: onlineInvErr } = await onlineSupabase
    .from('invoices')
    .select('repair_cost')
    .limit(1);

  const hasOnlineRepairCost = !onlineInvErr;

  console.log('--- 1. DATABASE SCHEMA ---');
  console.log(`Local invoices.repair_cost: ${hasLocalRepairCost ? '✅ EXISTS' : '❌ MISSING'}`);
  console.log(`Online invoices.repair_cost: ${hasOnlineRepairCost ? '✅ EXISTS' : '❌ MISSING (' + (onlineInvErr?.message || '') + ')'}`);

  // B. Revibe Invoices
  const localRevibeInvs = await localPg.query("SELECT invoice_number, total_amount, amount_paid, balance_due, repair_cost FROM invoices WHERE invoice_number LIKE '%REVIBE%' ORDER BY invoice_number");
  
  const { data: onlineRevibeInvs, error: onlineRErr } = await onlineSupabase
    .from('invoices')
    .select('invoice_number, total_amount, amount_paid, balance_due')
    .ilike('invoice_number', '%REVIBE%');

  console.log('\n--- 2. REVIBE MONTHLY INVOICES ---');
  console.log(`Local Revibe Invoices (${localRevibeInvs.rows.length}):`);
  localRevibeInvs.rows.forEach(r => {
    console.log(`  - ${r.invoice_number}: Total $${r.total_amount}, Paid $${r.amount_paid}, Due $${r.balance_due}, Repair $${r.repair_cost}`);
  });

  console.log(`Online Revibe Invoices (${onlineRevibeInvs ? onlineRevibeInvs.length : 0}):`);
  if (onlineRevibeInvs && onlineRevibeInvs.length > 0) {
    onlineRevibeInvs.forEach(r => {
      console.log(`  - ${r.invoice_number}: Total $${r.total_amount}, Paid $${r.amount_paid}, Due $${r.balance_due}`);
    });
  } else {
    console.log('  ❌ NONE found in online database');
  }

  // C. Clients: REVIBE online
  const localClient = await localPg.query("SELECT id, name FROM clients WHERE name ILIKE '%REVIBE%'");
  const { data: onlineClient } = await onlineSupabase.from('clients').select('id, name').ilike('name', '%REVIBE%');

  console.log('\n--- 3. CLIENT RECORD: REVIBE online ---');
  console.log(`Local client:`, localClient.rows);
  console.log(`Online client:`, onlineClient);

  // D. Old online transfer invoices (INV-ONL-...)
  const localOldInvs = await localPg.query("SELECT invoice_number FROM invoices WHERE invoice_number LIKE 'INV-ONL%'");
  const { data: onlineOldInvs } = await onlineSupabase.from('invoices').select('invoice_number').ilike('invoice_number', 'INV-ONL%');

  console.log('\n--- 4. LEGACY INTERNAL TRANSFER INVOICES (INV-ONL-...) ---');
  console.log(`Local count: ${localOldInvs.rows.length} (Deleted: ${localOldInvs.rows.length === 0 ? '✅ YES' : '❌ NO'})`);
  console.log(`Online count: ${onlineOldInvs ? onlineOldInvs.length : 0} (${onlineOldInvs?.map(x=>x.invoice_number).join(', ') || 'None'})`);

  // E. Historical Payments
  const localPmts = await localPg.query("SELECT COUNT(*) as count, SUM(amount) as total FROM payments");
  const { data: onlinePmts } = await onlineSupabase.from('payments').select('amount');
  const onlinePmtTotal = (onlinePmts || []).reduce((s, p) => s + Number(p.amount || 0), 0);

  console.log('\n--- 5. PAYMENTS RECONCILIATION ---');
  console.log(`Local payments: ${localPmts.rows[0].count} payments, Total $${Number(localPmts.rows[0].total).toFixed(2)}`);
  console.log(`Online payments: ${(onlinePmts || []).length} payments, Total $${onlinePmtTotal.toFixed(2)}`);

  await localPg.end();
}

main().catch(console.error);

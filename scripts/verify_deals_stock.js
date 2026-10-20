const { Client } = require('pg');

async function verify() {
  const client = new Client({ host: '127.0.0.1', port: 54322, user: 'postgres', password: 'postgres', database: 'postgres' });
  await client.connect();

  const dealsRes = await client.query(`
    SELECT id, deal_number, quantity 
    FROM deals 
    WHERE deal_number ILIKE '%DL-2026-0016%' 
       OR deal_number ILIKE '%ATT-2026-0012%' 
       OR deal_number ILIKE '%ECO%' 
       OR deal_number ILIKE '%DL-2026-0018%' 
       OR deal_number ILIKE '%YUSEF%'
    ORDER BY deal_number;
  `);
  
  console.log('=== DEAL STOCK STATUS AFTER REVIBE MIGRATION ===');
  for (const d of dealsRes.rows) {
    const linesRes = await client.query(`
      SELECT COALESCE(SUM(ili.quantity), 0) as invoiced_qty 
      FROM invoice_line_items ili 
      JOIN deal_items di ON di.id = ili.deal_item_id 
      WHERE di.deal_id = $1;
    `, [d.id]);
    const invoiced = Number(linesRes.rows[0].invoiced_qty || 0);
    const remaining = Math.max(0, d.quantity - invoiced);
    console.log(`${d.deal_number} | Total Deal Qty: ${d.quantity} | Total Invoiced: ${invoiced} | Remaining Available: ${remaining}`);
  }

  await client.end();
}

verify().catch(console.error);

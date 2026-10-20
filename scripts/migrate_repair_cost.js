const { Client } = require('pg');

async function migrateLocal() {
  const client = new Client({
    host: '127.0.0.1',
    port: 54322,
    user: 'postgres',
    password: 'postgres',
    database: 'postgres'
  });
  await client.connect();
  console.log('Connected to local PostgreSQL.');

  await client.query('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS repair_cost NUMERIC(12,2) NOT NULL DEFAULT 0;');
  console.log('Added repair_cost to invoices.');

  await client.query('ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS repair_cost NUMERIC(12,2) NOT NULL DEFAULT 0;');
  console.log('Added repair_cost to invoice_line_items.');

  const res1 = await client.query("SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'repair_cost';");
  console.log('invoices.repair_cost:', res1.rows);

  const res2 = await client.query("SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'invoice_line_items' AND column_name = 'repair_cost';");
  console.log('invoice_line_items.repair_cost:', res2.rows);

  await client.end();
}

migrateLocal().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

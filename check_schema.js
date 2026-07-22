const {Client} = require('pg');
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
client.connect().then(async () => {
  const r = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='inventory_items'");
  console.log('inventory_items:', r.rows);
  
  const r2 = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='invoice_line_items'");
  console.log('invoice_line_items:', r2.rows);
}).finally(() => client.end());

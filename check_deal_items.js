const {Client} = require('pg');
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
client.connect().then(async () => {
  const r = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='deal_items'");
  console.log('deal_items:', r.rows);
}).finally(() => client.end());

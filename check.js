const {Client} = require('pg');
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
client.connect().then(async () => {
  const lessQty = await client.query('SELECT d.id, d.deal_number, d.quantity, COUNT(i.id) FROM deals d JOIN inventory_items i ON d.id=i.deal_id GROUP BY d.id HAVING COUNT(i.id) < d.quantity');
  console.log('Deals with less inventory than quantity:', lessQty.rowCount);
  
  const dupImei = await client.query('SELECT imei, COUNT(*) FROM inventory_items WHERE imei IS NOT NULL AND imei != \'\' GROUP BY imei HAVING COUNT(*) > 1');
  console.log('Duplicate IMEIs in inventory:', dupImei.rowCount);
  
  const dupSerial = await client.query('SELECT serial_number, COUNT(*) FROM inventory_items WHERE serial_number IS NOT NULL AND serial_number != \'\' GROUP BY serial_number HAVING COUNT(*) > 1');
  console.log('Duplicate Serial Numbers in inventory:', dupSerial.rowCount);

}).finally(() => client.end());

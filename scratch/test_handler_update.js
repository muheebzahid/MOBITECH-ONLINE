const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/) || env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

const url = urlMatch[1].trim();
const key = keyMatch[1].trim();
const supabase = createClient(url, key);

async function main() {
  const { data: shipments, error: getErr } = await supabase.from('shipments').select('id, shipment_number, handled_by').limit(1);
  console.log('Get shipment res:', { shipments, getErr });

  if (shipments && shipments.length > 0) {
    const sId = shipments[0].id;
    const { data: updateRes, error: updateErr } = await supabase.from('shipments').update({ handled_by: 'SB Technology' }).eq('id', sId).select();
    console.log('Update res:', { updateRes, updateErr });
  }
}
main();

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const anonKeyMatch = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
const serviceKeyMatch = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);

const url = urlMatch[1].trim();
const anonKey = anonKeyMatch[1].trim();
const serviceKey = serviceKeyMatch ? serviceKeyMatch[1].trim() : anonKey;

const supabaseAnon = createClient(url, anonKey);
const supabaseAdmin = createClient(url, serviceKey);

async function main() {
  console.log('Testing update with anon key...');
  const { data: s, error: sErr } = await supabaseAnon.from('shipments').select('id, handled_by').limit(1);
  console.log('Select shipment with anon key:', { s, sErr });

  if (s && s.length > 0) {
    const { data: uRes, error: uErr } = await supabaseAnon.from('shipments').update({ handled_by: 'Turbo Logistics' }).eq('id', s[0].id).select();
    console.log('Update shipment with anon key:', { uRes, uErr });

    const { data: aRes, error: aErr } = await supabaseAnon.from('audit_logs').insert([{
      table_name: 'shipments',
      record_id: s[0].id,
      action: 'UPDATE',
      old_data: { handled_by: null },
      new_data: { handled_by: 'Turbo Logistics' }
    }]).select();
    console.log('Insert audit_logs with anon key:', { aRes, aErr });
  }
}
main();

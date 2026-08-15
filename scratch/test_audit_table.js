const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/) || env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

const url = urlMatch[1].trim();
const key = keyMatch[1].trim();
const supabase = createClient(url, key);

async function main() {
  const res = await supabase.from('audit_logs').insert([{
    action: 'UPDATE',
    table_name: 'deals',
    record_id: '00000000-0000-0000-0000-000000000001',
    old_data: { quantity: 50, unit_cost: 100, _user: { email: 'accountant@mobitech.com', role: 'FINANCE' } },
    new_data: { quantity: 60, unit_cost: 105, _user: { email: 'accountant@mobitech.com', role: 'FINANCE' } }
  }]).select();

  console.log('Inserted audit log:', res.data[0]);
  if (res.data && res.data.length > 0) {
    await supabase.from('audit_logs').delete().eq('id', res.data[0].id);
  }
}
main();

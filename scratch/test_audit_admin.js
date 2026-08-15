const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const serviceKeyMatch = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);

const url = urlMatch[1].trim();
const serviceKey = serviceKeyMatch[1].trim();
const supabaseAdmin = createClient(url, serviceKey);

async function main() {
  const { data: userRoles, error: rErr } = await supabaseAdmin.from('user_roles').select('*');
  console.log('User roles in DB:', userRoles);
}
main();

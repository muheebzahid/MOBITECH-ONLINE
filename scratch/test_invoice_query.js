const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/) || env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

const url = urlMatch[1].trim();
const key = keyMatch[1].trim();
const supabase = createClient(url, key);

async function main() {
  console.log('Testing getInvoiceById query...');
  const id = 'ce77268d-2e16-4cd1-b56d-cff3a32d306b';
  
  // Test 1: Full query with invoice_documents
  const res1 = await supabase
    .from('invoices')
    .select(`
      *,
      invoice_line_items(*, deals(deal_number, model, storage, grade)),
      payments(*),
      invoice_documents(*)
    `)
    .eq('id', id)
    .single();
    
  console.log('Query 1 result with invoice_documents:', { data: res1.data ? 'Found' : 'Null', error: res1.error });

  // Test 2: Query without invoice_documents
  const res2 = await supabase
    .from('invoices')
    .select(`
      *,
      invoice_line_items(*, deals(deal_number, model, storage, grade)),
      payments(*)
    `)
    .eq('id', id)
    .single();
    
  console.log('Query 2 result without invoice_documents:', { data: res2.data ? 'Found' : 'Null', error: res2.error });
}
main();

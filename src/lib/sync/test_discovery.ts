import { createClient } from '@supabase/supabase-js'
import { discoverDealPackage } from './discoverDealPackage'

import { config } from 'dotenv'
config({ path: '.env.local' })

async function runTests() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const results: any = {}

  try {
    const { data: deals } = await supabase.from('deals').select('id').limit(10)
    const simpleDealId = deals?.[0]?.id
    if (simpleDealId) {
      results['1_simple_deal'] = await discoverDealPackage({ dealIds: [simpleDealId] }, supabase)
    }

    const { data: sDeals } = await supabase.from('shipment_deals').select('deal_id').limit(1)
    if (sDeals?.[0]) results['2_shipment_deal'] = await discoverDealPackage({ dealIds: [sDeals[0].deal_id] }, supabase)

    const { data: iDeals } = await supabase.from('invoice_line_items').select('deal_id').limit(1)
    if (iDeals?.[0]) results['3_invoice_deal'] = await discoverDealPackage({ dealIds: [iDeals[0].deal_id] }, supabase)

    const { data: invDeals } = await supabase.from('inventory_items').select('deal_id').limit(1)
    if (invDeals?.[0]) results['6_inventory_deal'] = await discoverDealPackage({ dealIds: [invDeals[0].deal_id] }, supabase)

    results['9_invalid_uuid'] = await discoverDealPackage({ dealIds: ['not-a-uuid'] }, supabase)
    results['10_missing_deal'] = await discoverDealPackage({ dealIds: ['00000000-0000-0000-0000-000000000000'] }, supabase)

    for (const [name, test] of Object.entries(results)) {
      const t = test as any
      console.log('--- TEST: ' + name)
      console.log('Success: ' + t.success)
      if (t.error) console.log('Error: ' + t.error)
      if (t.counts) console.log('Total Records: ' + t.counts.total_records)
      if (t.required_dependencies) console.log('Dependencies: ' + t.required_dependencies.length)
      console.log('')
    }
  } catch (err: any) {
    console.error('Test script failed:', err)
  }
}

runTests()

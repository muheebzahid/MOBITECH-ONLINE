import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { discoverDealPackage } from './discoverDealPackage'
import { buildSyncManifest } from './buildSyncManifest'
import { preflightSyncManifest } from './preflightSyncManifest'

config({ path: '.env.local' })

async function runTests() {
  const localSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const results: any = {}

  try {
    const { data: iDeals } = await localSupabase.from('invoice_line_items').select('deal_id').limit(1)
    if (iDeals?.[0]) {
      const p3 = await discoverDealPackage({ dealIds: [iDeals[0].deal_id] }, localSupabase)
      const m3 = buildSyncManifest(p3)
      results['3_invoice_deal_preflight'] = await preflightSyncManifest(m3, p3.package!, localSupabase)
    }

    for (const [name, res] of Object.entries(results)) {
      const r = res as any
      console.log('--- TEST: ' + name)
      console.log('Status: ' + r.status)
      console.log('Summary:', r.summary)
      if (r.error) console.log('Error:', r.error)
      console.log('')
    }
  } catch (err: any) {
    console.error('Test script failed:', err)
  }
}

runTests()

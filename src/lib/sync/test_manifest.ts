import { createClient } from '@supabase/supabase-js'
import { discoverDealPackage } from './discoverDealPackage'
import { buildSyncManifest } from './buildSyncManifest'
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
      const p1 = await discoverDealPackage({ dealIds: [simpleDealId] }, supabase)
      results['1_simple_deal'] = buildSyncManifest(p1)
    }

    const { data: sDeals } = await supabase.from('shipment_deals').select('deal_id').limit(1)
    if (sDeals?.[0]) {
      const p2 = await discoverDealPackage({ dealIds: [sDeals[0].deal_id] }, supabase)
      results['2_shipment_deal'] = buildSyncManifest(p2)
    }

    const { data: iDeals } = await supabase.from('invoice_line_items').select('deal_id').limit(1)
    if (iDeals?.[0]) {
      const p3 = await discoverDealPackage({ dealIds: [iDeals[0].deal_id] }, supabase)
      results['3_invoice_deal'] = buildSyncManifest(p3)
    }

    const { data: invDeals } = await supabase.from('inventory_items').select('deal_id').limit(1)
    if (invDeals?.[0]) {
      const p4 = await discoverDealPackage({ dealIds: [invDeals[0].deal_id] }, supabase)
      results['4_inventory_deal'] = buildSyncManifest(p4)
    }

    for (const [name, manifest] of Object.entries(results)) {
      const m = manifest as any
      console.log('--- TEST: ' + name)
      console.log('Status: ' + m.status)
      console.log('Blocking Issues: ' + m.counts.blocking_issues)
      console.log('Warnings: ' + m.counts.warnings)
      console.log('Required Deals: ' + m.required_related_deals.length)
      if (m.counts.blocking_issues > 0) {
        console.log('First issue: ' + m.issues[0].reason)
      }
      console.log('')
    }
  } catch (err: any) {
    console.error('Test script failed:', err)
  }
}

runTests()

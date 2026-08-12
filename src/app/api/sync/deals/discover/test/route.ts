import { NextResponse } from 'next/server'
import { discoverDealPackage } from '@/lib/sync/discoverDealPackage'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const results: any = {}

    // Find a simple deal
    const { data: deals } = await supabaseAdmin.from('deals').select('id').limit(10)
    const simpleDealId = deals?.[0]?.id

    // Scenario 1: One simple Deal
    if (simpleDealId) {
      results['1_simple_deal'] = await discoverDealPackage({ dealIds: [simpleDealId] }, supabaseAdmin)
    }

    // Scenario 2: Deal linked to a Shipment
    const { data: sDeals } = await supabaseAdmin.from('shipment_deals').select('deal_id').limit(1)
    const shipmentDealId = sDeals?.[0]?.deal_id
    if (shipmentDealId) {
      results['2_shipment_deal'] = await discoverDealPackage({ dealIds: [shipmentDealId] }, supabaseAdmin)
    }

    // Scenario 3: Deal linked to multiple Invoices
    const { data: iDeals } = await supabaseAdmin.from('invoice_line_items').select('deal_id').limit(1)
    const invoiceDealId = iDeals?.[0]?.deal_id
    if (invoiceDealId) {
      results['3_invoice_deal'] = await discoverDealPackage({ dealIds: [invoiceDealId] }, supabaseAdmin)
    }

    // Scenario 6: Deal with Online Inventory
    const { data: invDeals } = await supabaseAdmin.from('inventory_items').select('deal_id').limit(1)
    const inventoryDealId = invDeals?.[0]?.deal_id
    if (inventoryDealId) {
      results['6_inventory_deal'] = await discoverDealPackage({ dealIds: [inventoryDealId] }, supabaseAdmin)
    }

    // Scenario 9: Invalid Deal UUID
    results['9_invalid_uuid'] = await discoverDealPackage({ dealIds: ['not-a-uuid'] }, supabaseAdmin)

    // Scenario 10: Missing Deal
    results['10_missing_deal'] = await discoverDealPackage({ dealIds: ['00000000-0000-0000-0000-000000000000'] }, supabaseAdmin)

    // Scenario 11: Unauthorized user (hit the actual API without cookies)
    try {
      const res = await fetch('http://localhost:3000/api/sync/deals/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealIds: [simpleDealId] })
      })
      results['11_unauthorized'] = { status: res.status, ok: res.ok, data: await res.json() }
    } catch (e: any) {
      results['11_unauthorized'] = { error: e.message }
    }

    return NextResponse.json({ success: true, tests: results })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

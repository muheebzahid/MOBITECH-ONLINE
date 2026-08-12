import { NextResponse } from 'next/server'
import { discoverDealPackage } from '@/lib/sync/discoverDealPackage'
import { buildSyncManifest } from '@/lib/sync/buildSyncManifest'
import { preflightSyncManifest } from '@/lib/sync/preflightSyncManifest'
import { getUserRole } from '@/lib/admin/actions'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const role = await getUserRole()
    if (role !== 'SUPER_ADMIN') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { dealIds } = body

    if (!Array.isArray(dealIds) || dealIds.length === 0) {
      return NextResponse.json({ success: false, error: 'Invalid or missing dealIds' }, { status: 400 })
    }

    const localSupabase = await createClient()
    const discoveryResult = await discoverDealPackage({ dealIds }, localSupabase)

    if (!discoveryResult.success) {
      if (discoveryResult.error === 'Deals not found') {
        return NextResponse.json(discoveryResult, { status: 404 })
      }
      return NextResponse.json(discoveryResult, { status: 400 })
    }

    const manifest = buildSyncManifest(discoveryResult)

    const preflight = await preflightSyncManifest(manifest, discoveryResult.package!, localSupabase)

    if (!preflight.success) {
       return NextResponse.json(preflight, { status: 400 })
    }

    return NextResponse.json(preflight, { status: 200 })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { executeSyncJob } from '@/lib/sync/executeSyncJob'
import { getUserRole } from '@/lib/admin/actions'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const role = await getUserRole()
    if (role !== 'SUPER_ADMIN') {
      return NextResponse.json({ success: false, error: 'Unauthorized: Only SUPER_ADMIN can execute live sync' }, { status: 401 })
    }

    const body = await req.json()
    const { dealIds } = body

    if (!Array.isArray(dealIds) || dealIds.length === 0) {
      return NextResponse.json({ success: false, error: 'Invalid or missing dealIds' }, { status: 400 })
    }

    const localSupabase = await createClient()
    const result = await executeSyncJob({ dealIds, userRole: role, localSupabase })

    if (!result.success) {
      return NextResponse.json(result, { status: 400 })
    }

    return NextResponse.json(result, { status: 200 })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 })
  }
}

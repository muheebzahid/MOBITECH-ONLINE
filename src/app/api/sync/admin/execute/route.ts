import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createOnlineClient } from '@/lib/supabase/online-server'
import { getUserRole } from '@/lib/admin/actions'
import { executeFullMirrorSync } from '@/lib/sync/executeFullSync'

export const dynamic = 'force-dynamic'

/**
 * POST /api/sync/admin/execute
 *
 * Executes a full mirror sync from Local (Master) ERP → Online Cloud ERP.
 * - Upserts ALL local records to online across every business table
 * - Deletes orphan records from online that don't exist locally
 * - NEVER modifies the local/master ERP
 *
 * Requires SUPER_ADMIN role.
 */
export async function POST() {
  try {
    const role = await getUserRole()
    if (role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Super Admin access required' },
        { status: 401 }
      )
    }

    const localSupabase = await createClient()
    const onlineSupabase = createOnlineClient()

    const result = await executeFullMirrorSync(localSupabase, onlineSupabase)

    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[FullSync Execute] Fatal error:', err)
    return NextResponse.json(
      { success: false, error: err.message || 'Internal sync execution error' },
      { status: 500 }
    )
  }
}

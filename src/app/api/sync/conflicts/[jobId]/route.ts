import { NextResponse } from 'next/server'
import { getUserRole } from '@/lib/admin/actions'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const role = await getUserRole()
    if (role !== 'SUPER_ADMIN') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { jobId } = await params
    const localSupabase = await createClient()

    const { data: conflicts, error } = await localSupabase
      .from('sync_conflicts')
      .select('*')
      .eq('sync_job_id', jobId)

    return NextResponse.json({ success: true, conflicts: conflicts || [] }, { status: 200 })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 })
  }
}

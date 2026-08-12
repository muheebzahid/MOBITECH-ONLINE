import { NextResponse } from 'next/server'
import { getUserRole } from '@/lib/admin/actions'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const role = await getUserRole()
    if (role !== 'SUPER_ADMIN') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const localSupabase = await createClient()

    const { data: job, error } = await localSupabase
      .from('sync_jobs')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !job) {
      return NextResponse.json({ success: false, error: 'Sync job not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, job }, { status: 200 })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 })
  }
}

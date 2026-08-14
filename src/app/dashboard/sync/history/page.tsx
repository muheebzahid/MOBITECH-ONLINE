import { getUserRole } from '@/lib/admin/actions'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

import SyncHistoryClient from './SyncHistoryClient'

export const dynamic = 'force-dynamic'

export default async function SyncHistoryPage() {
  const role = await getUserRole()
  if (role !== 'SUPER_ADMIN') {
    redirect('/dashboard')
  }

  const supabase = await createClient()
  const { data: jobs } = await supabase
    .from('sync_jobs')
    .select('*')
    .order('executed_at', { ascending: false })
    .limit(50)

  return <SyncHistoryClient initialJobs={jobs || []} />
}

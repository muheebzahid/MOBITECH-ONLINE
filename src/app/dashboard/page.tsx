import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardHomeClient from './DashboardHomeClient'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return <DashboardHomeClient />
}

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardShell from '@/components/DashboardShell'
import { RoleProvider } from '@/components/RoleProvider'
import { getUserRole } from '@/lib/admin/actions'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const role = await getUserRole()
  if (!role) redirect('/login')

  return (
    <RoleProvider role={role}>
      <DashboardShell user={user}>
        {children}
      </DashboardShell>
    </RoleProvider>
  )
}

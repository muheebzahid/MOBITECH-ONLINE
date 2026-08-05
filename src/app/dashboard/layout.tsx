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
  
  if (role !== 'SUPER_ADMIN') {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <div className="p-8 bg-white rounded shadow-md text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
          <p className="text-gray-700">Online ERP is currently in testing mode.</p>
          <p className="text-gray-700">Only authorized SUPER_ADMIN accounts are allowed.</p>
          <form action="/auth/signout" method="post" className="mt-6">
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Sign Out</button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <RoleProvider role={role}>
      <DashboardShell user={user}>
        {children}
      </DashboardShell>
    </RoleProvider>
  )
}

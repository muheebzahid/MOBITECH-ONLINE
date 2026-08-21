import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardShell from '@/components/DashboardShell'
import { RoleProvider } from '@/components/RoleProvider'
import { getUserRole } from '@/lib/admin/actions'
import Providers from '@/components/Providers'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const role = await getUserRole()
  if (role === 'DENIED' || !role) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <div className="p-8 bg-white rounded shadow-md text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
          <p className="text-gray-700">Your account does not have an active role assigned.</p>
          <p className="text-gray-700">Please contact your administrator.</p>
          <form action="/auth/signout" method="post" className="mt-6">
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Sign Out</button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <Providers>
      <RoleProvider role={role}>
        <DashboardShell user={user}>
          {children}
        </DashboardShell>
      </RoleProvider>
    </Providers>
  )
}

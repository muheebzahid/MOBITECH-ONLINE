import { getAllUsers, getUserRole } from '@/lib/admin/actions'
import { getPendingInvoices } from '@/lib/sales/actions'
import { redirect } from 'next/navigation'
import AdminClient from './AdminClient'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const role = await getUserRole()
  if (role !== 'SUPER_ADMIN' && role !== 'VIEW_ONLY') {
    redirect('/dashboard')
  }

  const users = await getAllUsers()
  
  return <AdminClient users={users || []} />
}

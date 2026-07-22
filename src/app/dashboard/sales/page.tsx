import { getInvoices, getPendingInvoices } from '@/lib/sales/actions'
import { getClients } from '@/lib/clients/actions'
import { getUserRole } from '@/lib/admin/actions'
import { redirect } from 'next/navigation'
import SalesClient from './SalesClient'

export const dynamic = 'force-dynamic'

export default async function SalesPage() {
  const role = await getUserRole()
  if (role === 'LOGISTICS') redirect('/dashboard')
  const invoices = await getInvoices()
  const pendingInvoices = await getPendingInvoices()
  const clients = await getClients()
  return <SalesClient invoices={invoices} pendingInvoices={pendingInvoices || []} clients={clients} />
}

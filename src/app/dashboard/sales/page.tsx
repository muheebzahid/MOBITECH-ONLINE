import { getInvoices, getPendingInvoices } from '@/lib/sales/actions'
import { getClients } from '@/lib/clients/actions'
import { getUserRole } from '@/lib/admin/actions'
import { redirect } from 'next/navigation'
import SalesClient from './SalesClient'

export const dynamic = 'force-dynamic'

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const role = await getUserRole()
  if (role === 'LOGISTICS') redirect('/dashboard')
  const resolvedParams = await searchParams
  const month = resolvedParams?.month || ''

  const [invoicesRes, pendingInvoices, clients] = await Promise.all([
    getInvoices(month),
    getPendingInvoices(),
    getClients()
  ])

  return <SalesClient invoices={invoicesRes.data} invoicesTotal={invoicesRes.total} currentMonth={month} pendingInvoices={pendingInvoices || []} clients={clients} />
}

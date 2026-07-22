import { getClients } from '@/lib/clients/actions'
import { getUserRole } from '@/lib/admin/actions'
import { redirect } from 'next/navigation'
import ClientsClient from './ClientsClient'

export const dynamic = 'force-dynamic'

export default async function ClientsPage() {
  const role = await getUserRole()
  if (role === 'LOGISTICS') redirect('/dashboard')

  const clients = await getClients()
  return <ClientsClient clients={clients} />
}

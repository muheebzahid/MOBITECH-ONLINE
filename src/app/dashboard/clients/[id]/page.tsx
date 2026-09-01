import { getClientById } from '@/lib/clients/actions'
import { getUserRole } from '@/lib/admin/actions'
import { redirect, notFound } from 'next/navigation'
import ClientDetailClient from './ClientDetailClient'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ClientDetailPage({ params }: Props) {
  const role = await getUserRole()
  if (role === 'LOGISTICS' || role === 'SALES') redirect('/dashboard/sales')

  const { id } = await params
  const client = await getClientById(id)
  if (!client) notFound()

  return <ClientDetailClient client={client} />
}

import { getShipments } from '@/lib/logistics/actions'
import { getUnshippedDeals } from '@/lib/logistics/actions'
import { getUserRole } from '@/lib/admin/actions'
import { redirect } from 'next/navigation'
import LogisticsClient from './LogisticsClient'

export const dynamic = 'force-dynamic'

export default async function LogisticsPage() {
  const role = await getUserRole()
  if (role === 'SALES') redirect('/dashboard')
  const [shipments, unshippedDeals] = await Promise.all([
    getShipments(),
    getUnshippedDeals(),
  ])
  return <LogisticsClient shipments={shipments} unshippedDeals={unshippedDeals} />
}

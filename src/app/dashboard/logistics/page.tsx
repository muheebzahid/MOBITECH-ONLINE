import { getShipments } from '@/lib/logistics/actions'
import { getUnshippedDeals } from '@/lib/logistics/actions'
import { getUserRole } from '@/lib/admin/actions'
import { redirect } from 'next/navigation'
import LogisticsClient from './LogisticsClient'

export const dynamic = 'force-dynamic'

export default async function LogisticsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const role = await getUserRole()
  if (role === 'SALES') redirect('/dashboard')
  const resolvedParams = await searchParams
  const page = Math.max(0, parseInt(resolvedParams?.page || '0') || 0)
  const [{ data: shipments, total }, unshippedDeals] = await Promise.all([
    getShipments(page),
    getUnshippedDeals(),
  ])
  return <LogisticsClient shipments={shipments} shipmentsTotal={total} shipmentsPage={page} unshippedDeals={unshippedDeals} />
}

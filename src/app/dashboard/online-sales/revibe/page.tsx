import { getOnlineOrders, getReadyItems } from '@/lib/online-sales/actions'
import OnlineSalesClient from '../OnlineSalesClient'

export const dynamic = 'force-dynamic'

export default async function RevibeSalesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const resolvedParams = await searchParams
  const page = Math.max(0, parseInt(resolvedParams?.page || '0') || 0)
  const [
    { data: orders, total },
    readyItems
  ] = await Promise.all([
    getOnlineOrders('REVIBE', page),
    getReadyItems()
  ])
  
  return <OnlineSalesClient platform="REVIBE" initialOrders={orders} ordersTotal={total} ordersPage={page} readyItems={readyItems} />
}

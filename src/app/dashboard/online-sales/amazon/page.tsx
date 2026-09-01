import { getOnlineOrders, getReadyItems } from '@/lib/online-sales/actions'
import OnlineSalesClient from '../OnlineSalesClient'

export const dynamic = 'force-dynamic'

export default async function AmazonSalesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const resolvedParams = await searchParams
  const page = Math.max(0, parseInt(resolvedParams?.page || '0') || 0)
  const [
    { data: orders, total },
    readyItems
  ] = await Promise.all([
    getOnlineOrders('AMAZON', page),
    getReadyItems()
  ])
  
  return <OnlineSalesClient platform="AMAZON" initialOrders={orders} ordersTotal={total} ordersPage={page} readyItems={readyItems} />
}

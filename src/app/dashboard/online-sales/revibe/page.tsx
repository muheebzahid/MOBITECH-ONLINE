import { getOnlineOrders } from '@/lib/online-sales/actions'
import OnlineSalesClient from '../OnlineSalesClient'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function RevibeSalesPage({ searchParams }: { searchParams: { page?: string } }) {
  const supabase = await createClient()
  const page = Math.max(0, parseInt(searchParams?.page || '0') || 0)
  const { data: orders, total } = await getOnlineOrders('REVIBE', page)
  const { data: readyItems } = await supabase.from('inventory_items').select('*').eq('refurb_stage', 'READY_TO_SELL')
  
  return <OnlineSalesClient platform="REVIBE" initialOrders={orders} ordersTotal={total} ordersPage={page} readyItems={readyItems || []} />
}

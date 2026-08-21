import { getOnlineOrders } from '@/lib/online-sales/actions'
import OnlineSalesClient from '../OnlineSalesClient'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function RevibeSalesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const supabase = await createClient()
  const resolvedParams = await searchParams
  const page = Math.max(0, parseInt(resolvedParams?.page || '0') || 0)
  const [
    { data: orders, total },
    { data: readyItems }
  ] = await Promise.all([
    getOnlineOrders('REVIBE', page),
    supabase.from('inventory_items').select('id, imei, serial_number, model, storage, grade').eq('refurb_stage', 'READY_TO_SELL')
  ])
  
  return <OnlineSalesClient platform="REVIBE" initialOrders={orders} ordersTotal={total} ordersPage={page} readyItems={readyItems || []} />
}

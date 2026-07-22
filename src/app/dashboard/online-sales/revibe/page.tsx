import { getOnlineOrders } from '@/lib/online-sales/actions'
import OnlineSalesClient from '../OnlineSalesClient'
import { createClient } from '@/lib/supabase/server'

export default async function RevibeSalesPage() {
  const supabase = await createClient()
  const orders = await getOnlineOrders('REVIBE')
  const { data: readyItems } = await supabase.from('inventory_items').select('*').eq('refurb_stage', 'READY_TO_SELL')
  
  return <OnlineSalesClient platform="REVIBE" initialOrders={orders} readyItems={readyItems || []} />
}

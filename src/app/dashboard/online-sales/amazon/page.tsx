import { getOnlineOrders } from '@/lib/online-sales/actions'
import OnlineSalesClient from '../OnlineSalesClient'
import { createClient } from '@/lib/supabase/server'

export default async function AmazonSalesPage() {
  const supabase = await createClient()
  const orders = await getOnlineOrders('AMAZON')
  const { data: readyItems } = await supabase.from('inventory_items').select('*').eq('refurb_stage', 'READY_TO_SELL')
  
  return <OnlineSalesClient platform="AMAZON" initialOrders={orders} readyItems={readyItems || []} />
}

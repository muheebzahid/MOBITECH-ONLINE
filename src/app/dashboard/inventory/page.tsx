import { getAllInventory } from '@/lib/inventory/actions'
import { getUserRole } from '@/lib/admin/actions'
import { getDeals } from '@/lib/deals/actions'
import { redirect } from 'next/navigation'
import InventoryClient from './InventoryClient'

export const dynamic = 'force-dynamic'

export default async function InventoryPage() {
  const role = await getUserRole()
  if (role === 'LOGISTICS') redirect('/dashboard')
  const inventory = await getAllInventory()
  const deals = await getDeals()
  return <InventoryClient inventory={inventory} activeDeals={deals} />
}

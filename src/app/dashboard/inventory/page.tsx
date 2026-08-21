import { getAllInventory } from '@/lib/inventory/actions'
import { getUserRole } from '@/lib/admin/actions'
import { getDeals } from '@/lib/deals/actions'
import { redirect } from 'next/navigation'
import InventoryClient from './InventoryClient'

export const dynamic = 'force-dynamic'

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const role = await getUserRole()
  if (role === 'LOGISTICS') redirect('/dashboard')
  const resolvedParams = await searchParams
  const page = Math.max(0, parseInt(resolvedParams?.page || '0') || 0)

  const [inventoryRes, dealsRes] = await Promise.all([
    getAllInventory(page),
    getDeals(0)
  ])

  return <InventoryClient inventory={inventoryRes.data} inventoryTotal={inventoryRes.total} inventoryPage={page} activeDeals={dealsRes.data} />
}

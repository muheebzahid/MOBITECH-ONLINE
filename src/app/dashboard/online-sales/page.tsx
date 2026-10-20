import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function OnlineSalesPage() {
  redirect('/dashboard/sales')
}

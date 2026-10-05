import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function FinancePage() {
  redirect('/dashboard/accounting')
}

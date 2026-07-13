import { getDealById } from '@/lib/deals/actions'
import { notFound } from 'next/navigation'
import DealDetailClient from './DealDetailClient'

interface Props {
  params: Promise<{ id: string }>
}

export default async function DealDetailPage({ params }: Props) {
  const { id } = await params
  const deal = await getDealById(id)
  if (!deal) notFound()
  return <DealDetailClient deal={deal} />
}

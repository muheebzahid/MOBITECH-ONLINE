import { getOnlineOrderById } from '@/lib/online-sales/actions'
import { notFound } from 'next/navigation'
import OnlineOrderDetailClient from '../../OnlineOrderDetailClient'

interface Props {
  params: Promise<{ id: string }>
}

export default async function AmazonOrderDetailPage({ params }: Props) {
  const { id } = await params
  const order = await getOnlineOrderById(id)
  if (!order) notFound()
  return <OnlineOrderDetailClient order={order} />
}

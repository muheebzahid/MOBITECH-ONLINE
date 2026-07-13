import { getShipmentById, getUnshippedDeals } from '@/lib/logistics/actions'
import { notFound } from 'next/navigation'
import ShipmentDetailClient from './ShipmentDetailClient'

interface Props { params: Promise<{ id: string }> }

export default async function ShipmentDetailPage({ params }: Props) {
  const { id } = await params
  const [shipment, unshippedDeals] = await Promise.all([
    getShipmentById(id),
    getUnshippedDeals()
  ])
  if (!shipment) notFound()
  return <ShipmentDetailClient shipment={shipment} unshippedDeals={unshippedDeals} />
}

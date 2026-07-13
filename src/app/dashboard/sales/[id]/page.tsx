import { getInvoiceById, getAvailableDeals } from '@/lib/sales/actions'
import { notFound } from 'next/navigation'
import InvoiceDetailClient from './InvoiceDetailClient'

interface Props { params: Promise<{ id: string }> }

export default async function InvoiceDetailPage({ params }: Props) {
  const { id } = await params
  const [invoice, deals] = await Promise.all([
    getInvoiceById(id),
    getAvailableDeals()
  ])
  
  if (!invoice) notFound()
  return <InvoiceDetailClient invoice={invoice} deals={deals} />
}

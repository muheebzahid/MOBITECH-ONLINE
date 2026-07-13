export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PARTIAL' | 'PAID' | 'CANCELLED'
export type PaymentMethod = 'WIRE_TRANSFER' | 'CASH' | 'CREDIT_CARD' | 'OTHER'

export const INVOICE_STATUSES: Record<InvoiceStatus, { label: string; color: string }> = {
  DRAFT:     { label: 'Draft', color: 'badge-neutral' },
  ISSUED:    { label: 'Issued', color: 'badge-blue' },
  PARTIAL:   { label: 'Partial', color: 'badge-orange' },
  PAID:      { label: 'Paid', color: 'badge-green' },
  CANCELLED: { label: 'Cancelled', color: 'badge-red' },
}

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'WIRE_TRANSFER', label: 'Wire Transfer' },
  { value: 'CASH', label: 'Cash' },
  { value: 'CREDIT_CARD', label: 'Credit Card' },
  { value: 'OTHER', label: 'Other' },
]

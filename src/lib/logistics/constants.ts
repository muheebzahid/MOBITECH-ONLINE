export type ShipmentStatus =
  | 'PENDING'
  | 'AT_SB_TECHNOLOGY'
  | 'SHIPPED_FROM_USA'
  | 'IN_TRANSIT'
  | 'ARRIVED_DUBAI'
  | 'CUSTOMS_CLEARED'
  | 'AT_TURBO_LOGISTICS'
  | 'DELIVERED_TO_MOBITECH'

export interface ShipmentStatusMeta {
  label: string
  color: string
  leg: number
  description: string
}

export const SHIPMENT_STATUSES: Record<ShipmentStatus, ShipmentStatusMeta> = {
  PENDING: {
    label: 'Pending',
    color: 'badge-neutral',
    leg: 0,
    description: 'Shipment created, awaiting pickup',
  },
  AT_SB_TECHNOLOGY: {
    label: 'At SB Technology',
    color: 'badge-blue',
    leg: 1,
    description: 'Goods picked up, at SB Technology Miami',
  },
  SHIPPED_FROM_USA: {
    label: 'Shipped from USA',
    color: 'badge-indigo',
    leg: 2,
    description: 'Departed USA, AWB issued',
  },
  IN_TRANSIT: {
    label: 'In Transit',
    color: 'badge-purple',
    leg: 3,
    description: 'In the air / on the way to Dubai',
  },
  ARRIVED_DUBAI: {
    label: 'Arrived Dubai',
    color: 'badge-amber',
    leg: 4,
    description: 'Arrived at Dubai airport, pending customs',
  },
  CUSTOMS_CLEARED: {
    label: 'Customs Cleared',
    color: 'badge-amber',
    leg: 5,
    description: 'Customs cleared, duty paid',
  },
  AT_TURBO_LOGISTICS: {
    label: 'At Turbo Logistics',
    color: 'badge-orange',
    leg: 6,
    description: 'In Turbo Logistics warehouse, awaiting delivery',
  },
  DELIVERED_TO_MOBITECH: {
    label: 'Delivered to Mobitech',
    color: 'badge-green',
    leg: 7,
    description: 'Received and checked in at Mobitech warehouse',
  },
}

export const SHIPMENT_STATUS_ORDER: ShipmentStatus[] = [
  'PENDING',
  'AT_SB_TECHNOLOGY',
  'SHIPPED_FROM_USA',
  'IN_TRANSIT',
  'ARRIVED_DUBAI',
  'CUSTOMS_CLEARED',
  'AT_TURBO_LOGISTICS',
  'DELIVERED_TO_MOBITECH',
]

export const CARRIERS = [
  { value: 'DHL',     label: 'DHL Express' },
  { value: 'FEDEX',   label: 'FedEx' },
  { value: 'UPS',     label: 'UPS' },
  { value: 'EMIRATES',label: 'Emirates SkyCargo' },
  { value: 'ETIHAD',  label: 'Etihad Cargo' },
  { value: 'OTHER',   label: 'Other' },
]

export interface Shipment {
  id: string
  shipment_number: string
  status: ShipmentStatus
  carrier: string | null
  awb_number: string | null
  sb_invoice_number: string | null
  sb_fee: number
  freight_cost: number
  duty_amount: number
  turbo_fee: number
  total_logistics_cost: number
  pickup_date: string | null
  pickup_ref: string | null
  shipped_usa_date: string | null
  arrived_dubai_date: string | null
  customs_ref: string | null
  customs_cleared_date: string | null
  turbo_received_date: string | null
  turbo_invoice_number: string | null
  delivered_mobitech_date: string | null
  condition_notes: string | null
  notes: string | null
  created_at: string
  updated_at: string
  shipment_deals?: { deal_id: string; deals?: any }[]
}

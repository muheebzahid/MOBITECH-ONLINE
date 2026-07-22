// Deal status definitions with labels, colors and descriptions
export const DEAL_STATUSES = {
  AUCTION_WON:           { label: 'Auction Won',           color: 'status-won',       step: 1  },
  AWAITING_PAYMENT_LINK: { label: 'Awaiting Payment Link', color: 'status-waiting',   step: 2  },
  PAYMENT_REQUIRED:      { label: 'Payment Required',      color: 'status-urgent',    step: 3  },
  PAID:                  { label: 'Paid',                  color: 'status-paid',      step: 4  },
  READY_FOR_PICKUP:      { label: 'Ready for Pickup',      color: 'status-ready',     step: 5  },
  IN_TRANSIT_USA:        { label: 'In Transit (USA)',       color: 'status-transit',   step: 6  },
  AT_SB_TECHNOLOGY:      { label: 'At SB Technology',      color: 'status-transit',   step: 7  },
  IN_TRANSIT_DUBAI:      { label: 'In Transit (Dubai)',     color: 'status-transit',   step: 8  },
  AT_TURBO_LOGISTICS:    { label: 'At Turbo Logistics',    color: 'status-received',  step: 9  },
  RECEIVED_BY_MOBITECH:  { label: 'Received by Mobitech',  color: 'status-received',  step: 10 },
  PARTIALLY_SOLD:        { label: 'Partially Sold',        color: 'status-selling',   step: 11 },
  SOLD:                  { label: 'Fully Sold',            color: 'status-sold',      step: 12 },
  DEAL_CLOSED:           { label: 'Deal Closed',           color: 'status-closed',    step: 13 },
} as const

export type DealStatus = keyof typeof DEAL_STATUSES

export const SUPPLIERS = [
  { value: 'ATT',    label: 'AT&T' },
  { value: 'ECOATM', label: 'EcoATM' },
  { value: 'VERIZON',label: 'Verizon' },
  { value: 'TMOBILE',label: 'T-Mobile' },
  { value: 'OTHER',  label: 'Other' },
]

export const PLATFORMS = [
  { value: 'BSTOCK', label: 'B-Stock' },
  { value: 'ECOATM', label: 'EcoATM Platform' },
  { value: 'DIRECT', label: 'Direct Purchase' },
]

export const FUNDING_SOURCES = [
  { value: 'AMEX',       label: 'American Express' },
  { value: 'TURBO_CASH', label: 'Turbo Cash Pool (7% p.a.)' },
  { value: 'SB_CASH',    label: 'SB Cash Pool (7% p.a.)' },
  { value: 'MIXED',      label: 'Mixed' },
]

export const IPHONE_MODELS = [
  'iPhone 11', 'iPhone 11 Pro', 'iPhone 11 Pro Max',
  'iPhone 12', 'iPhone 12 Mini', 'iPhone 12 Pro', 'iPhone 12 Pro Max',
  'iPhone 13', 'iPhone 13 Mini', 'iPhone 13 Pro', 'iPhone 13 Pro Max',
  'iPhone 14', 'iPhone 14 Plus', 'iPhone 14 Pro', 'iPhone 14 Pro Max',
  'iPhone 15', 'iPhone 15 Plus', 'iPhone 15 Pro', 'iPhone 15 Pro Max',
  'iPhone 16', 'iPhone 16 Plus', 'iPhone 16 Pro', 'iPhone 16 Pro Max',
  'Samsung Galaxy S22', 'Samsung Galaxy S23', 'Samsung Galaxy S24',
  'Other',
]

export const STORAGE_OPTIONS = ['64GB', '128GB', '256GB', '512GB', '1TB']

export const GRADES = [
  { value: 'CT',  label: 'CT (Certified)' },
  { value: 'A',   label: 'Grade A' },
  { value: 'B',   label: 'Grade B' },
  { value: 'C',   label: 'Grade C' },
  { value: 'SALVAGE', label: 'Salvage' },
]

export const ATT_GRADES = [
  { value: 'AT',  label: 'AT' },
  { value: 'BT',  label: 'BT' },
  { value: 'CT',  label: 'CT' },
  { value: 'RR',  label: 'RR' },
  { value: 'B+',  label: 'B+' },
  { value: 'A+',  label: 'A+' },
  { value: 'AA+', label: 'AA+' },
  { value: 'A',   label: 'A' },
  { value: 'B',   label: 'B' },
]

export const ECOATM_GRADES = [
  { value: 'A_YYY', label: 'A_YYY' },
  { value: 'B_NYY', label: 'B_NYY' },
  { value: 'C_YNY', label: 'C_YNY' },
  { value: 'E_YYN', label: 'E_YYN' },
  { value: 'F_NYN', label: 'F_NYN' },
  { value: 'G_YNN', label: 'G_YNN' },
  { value: 'H_NNN', label: 'H_NNN' },
]


export const CARRIERS = ['AT&T', 'Verizon', 'T-Mobile', 'Unlocked', 'Unknown']

export interface DealItem {
  id?: string
  deal_id?: string
  model: string
  storage?: string
  grade?: string
  carrier?: string
  color?: string
  quantity: number
  unit_cost: number
}

export interface Deal {
  [key: string]: any
  id: string
  deal_number: string
  supplier: string
  auction_platform: string
  // Legacy scalar fields (for backward compatibility / quick mixed lots without deal_items)
  model: string
  storage?: string
  grade?: string
  color?: string
  carrier?: string
  quantity: number
  unit_cost: number
  // The new 1:N relationship
  items?: DealItem[]
  
  total_cost: number
  auction_fee: number
  other_fees: number
  total_commitment: number
  funding_source: string
  amex_amount: number
  cash_amount: number
  amex_statement_date?: string
  amex_payment_date?: string
  cashback_eligible: boolean
  cashback_amount: number
  cashback_received: boolean
  cash_finance_rate: number
  cash_days_deployed: number
  cash_finance_cost: number
  status: DealStatus
  auction_won_date: string
  total_revenue: number
  gross_profit: number
  notes?: string
  created_at: string
}

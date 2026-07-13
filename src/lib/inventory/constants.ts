export type InventoryLocation = 'MIAMI' | 'IN_TRANSIT' | 'DUBAI_WAREHOUSE' | 'AMAZON_FBA' | 'REVIBE' | 'SOLD' | 'RMA'
export type InventoryStatus = 'AVAILABLE' | 'RESERVED' | 'SOLD' | 'RETURNED'

export const INVENTORY_LOCATIONS: Record<InventoryLocation, { label: string; color: string }> = {
  MIAMI:           { label: 'Miami HQ', color: 'badge-neutral' },
  IN_TRANSIT:      { label: 'In Transit', color: 'badge-orange' },
  DUBAI_WAREHOUSE: { label: 'Dubai Warehouse', color: 'badge-blue' },
  AMAZON_FBA:      { label: 'Amazon FBA', color: 'badge-indigo' },
  REVIBE:          { label: 'Revibe', color: 'badge-indigo' },
  SOLD:            { label: 'Sold', color: 'badge-green' },
  RMA:             { label: 'RMA / Repair', color: 'badge-red' },
}

export const INVENTORY_STATUSES: Record<InventoryStatus, { label: string; color: string }> = {
  AVAILABLE: { label: 'Available', color: 'badge-blue' },
  RESERVED:  { label: 'Reserved', color: 'badge-orange' },
  SOLD:      { label: 'Sold', color: 'badge-green' },
  RETURNED:  { label: 'Returned', color: 'badge-neutral' },
}

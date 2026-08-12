export const FIELD_TYPES: Record<string, Record<string, 'numeric' | 'integer' | 'timestamptz' | 'date' | 'timestamp' | 'text' | 'json'>> = {
  deals: {
    quantity: 'integer',
    unit_cost: 'numeric',
    total_cost: 'numeric',
    auction_fee: 'numeric',
    other_fees: 'numeric',
    total_commitment: 'numeric',
    amex_amount: 'numeric',
    cash_amount: 'numeric',
    cashback_amount: 'numeric',
    cash_finance_rate: 'numeric',
    cash_days_deployed: 'integer',
    cash_finance_cost: 'numeric',
    auction_won_date: 'timestamptz',
    payment_link_date: 'timestamptz',
    payment_date: 'timestamptz',
    pickup_ready_date: 'timestamptz',
    shipped_usa_date: 'timestamptz',
    arrived_miami_date: 'timestamptz',
    shipped_dubai_date: 'timestamptz',
    arrived_dubai_date: 'timestamptz',
    received_mobitech_date: 'timestamptz',
    deal_closed_date: 'timestamptz',
    created_at: 'timestamptz',
    updated_at: 'timestamptz',
  },
  deal_items: {
    quantity: 'integer',
    unit_cost: 'numeric',
    created_at: 'timestamptz',
  },
  deal_status_history: {
    changed_at: 'timestamptz',
  },
  deal_edit_history: {
    edited_at: 'timestamptz',
  },
  shipments: {
    created_at: 'timestamptz',
    updated_at: 'timestamptz',
    shipped_date: 'timestamptz',
    estimated_arrival_date: 'timestamptz',
    actual_arrival_date: 'timestamptz',
  },
  shipment_deals: {
    created_at: 'timestamptz',
  },
  shipment_documents: {
    uploaded_at: 'timestamptz',
  },
  invoices: {
    issue_date: 'date',
    subtotal: 'numeric',
    discount: 'numeric',
    total_amount: 'numeric',
    amount_paid: 'numeric',
    balance_due: 'numeric',
    created_at: 'timestamptz',
    updated_at: 'timestamptz',
  },
  invoice_line_items: {
    quantity: 'integer',
    unit_price: 'numeric',
    total_price: 'numeric',
    created_at: 'timestamptz',
  },
  clients: {
    created_at: 'timestamptz',
    updated_at: 'timestamptz',
  },
  payments: {
    amount: 'numeric',
    payment_date: 'timestamptz',
    created_at: 'timestamptz',
    updated_at: 'timestamptz',
  },
  inventory_items: {
    unit_cost: 'numeric',
    logistics_cost: 'numeric',
    repair_cost: 'numeric',
    total_cost: 'numeric',
    target_price: 'numeric',
    created_at: 'timestamptz',
    updated_at: 'timestamptz',
  },
  inventory_history: {
    changed_at: 'timestamptz',
  },
  online_orders: {
    sale_date: 'timestamptz',
    total_amount: 'numeric',
    created_at: 'timestamptz',
    updated_at: 'timestamptz',
  },
  online_order_items: {
    quantity: 'integer',
    unit_price: 'numeric',
    created_at: 'timestamptz',
  }
}

function normalizeDecimalString(val: any): string {
  if (val === null || val === undefined) return '';
  let str = typeof val === 'number' ? val.toString() : val.trim();
  if (str === '') return '';
  
  if (str.match(/^-0\.?0*$/)) return '0';
  
  if (str.includes('.')) {
    str = str.replace(/0+$/, '');
    str = str.replace(/\.$/, '');
  }
  str = str.replace(/^(-?)0+(?=\d)/, '');
  if (str === '-0') return '0';
  return str;
}

export function normalizeRecordForChecksum(tableName: string, record: any): string {
  if (!record || typeof record !== 'object') {
    return ''
  }

  const normalized: any = {}
  const keys = Object.keys(record).sort()
  const tableSchema = FIELD_TYPES[tableName] || {}

  for (const key of keys) {
    if (key === 'updated_at') continue

    let val = record[key]

    if (val === null || val === undefined) {
      val = '' 
    } else {
      const type = tableSchema[key]

      if (type === 'numeric' || type === 'integer') {
        val = normalizeDecimalString(val)
      } else if (type === 'timestamptz') {
        const d = new Date(val)
        if (isNaN(d.getTime())) {
          throw new Error('BLOCKED: Invalid timestamptz ' + val)
        }
        val = d.toISOString()
      } else if (type === 'date') {
        // Must stay exactly YYYY-MM-DD
        let s = typeof val === 'string' ? val.trim() : val.toISOString()
        if (s.length >= 10) {
          val = s.substring(0, 10)
        } else {
          throw new Error('BLOCKED: Invalid date ' + val)
        }
      } else if (type === 'timestamp') {
        // timestamp without time zone (normalize without inventing timezone)
        let s = typeof val === 'string' ? val.trim() : val.toISOString()
        if (s.endsWith('Z')) s = s.slice(0, -1)
        val = s
      } else if (typeof val === 'object') {
        val = JSON.stringify(val, Object.keys(val).sort())
      } else if (typeof val === 'boolean') {
        val = val.toString()
      } else {
        // text or unknown: do not mutate identifier precision, just trim
        val = val.toString().trim()
      }
    }

    normalized[key] = val
  }

  return JSON.stringify(normalized)
}

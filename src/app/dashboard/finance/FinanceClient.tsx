'use client'

import { useState, useTransition } from 'react'
import { updateTreasurySettings, logWireTransfer, logRepayment, updateWireTransfer, deleteWireTransfer, updateRepayment, deleteRepayment } from '@/lib/finance/actions'

interface Props {
  settings: any
  wires: any[]
  repayments: any[]
  deals: any[]
  invoices: any[]
  userRole?: string
}

function fmt(n: number) {
  const parts = Number(n || 0).toString().split('.')
  const integerPart = parts[0]
  let decimalPart = parts[1] || ''
  
  if (decimalPart.length < 3) {
    decimalPart = decimalPart.padEnd(3, '0')
  } else {
    decimalPart = decimalPart.substring(0, 3)
  }
  
  const formattedInteger = new Intl.NumberFormat('en-US').format(parseFloat(integerPart))
  return `$${formattedInteger}.${decimalPart}`
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatInputNumber(value: string) {
  let val = value.replace(/[^0-9.]/g, '')
  const parts = val.split('.')
  if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('')
  
  if (val) {
    const p = val.split('.')
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return p.join('.')
  }
  return ''
}

function parseInputNumber(value: string) {
  return Number(value.replace(/,/g, ''))
}

export default function FinanceClient({ settings, wires, repayments, deals, invoices, userRole }: Props) {
  const [isPending, startTransition] = useTransition()
  
  // Modals
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showWireModal, setShowWireModal] = useState(false)
  const [showRepayModal, setShowRepayModal] = useState(false)
  const [expandedLedger, setExpandedLedger] = useState<'AMEX' | 'TURBO' | 'SB' | 'MOBITECH' | null>(null)
  
  // Editing state
  const [editingWireId, setEditingWireId] = useState<string | null>(null)
  const [editingRepayId, setEditingRepayId] = useState<string | null>(null)
  
  // Form states
  const [amexLimit, setAmexLimit] = useState(formatInputNumber(settings.amex_limit.toString()))
  const [turboLimit, setTurboLimit] = useState(formatInputNumber(settings.turbo_cash_limit.toString()))
  const [sbLimit, setSbLimit] = useState(formatInputNumber(settings.sb_cash_limit.toString()))
  
  const [wireDeal, setWireDeal] = useState('')
  const [wireAmount, setWireAmount] = useState('')
  const [wireDest, setWireDest] = useState('B-Stock')
  const [wireNotes, setWireNotes] = useState('')
  
  const [repayAmount, setRepayAmount] = useState('')
  const [transferFrom, setTransferFrom] = useState('EXTERNAL')
  const [transferTo, setTransferTo] = useState('AMEX')
  const [repayNotes, setRepayNotes] = useState('')

  // ---------------------------------------------
  // Cash Flow Calculations
  // ---------------------------------------------
  
  const amexLimitVal = settings.amex_limit ?? 500000
  const turboLimitVal = settings.turbo_cash_limit ?? 150000
  const sbLimitVal = settings.sb_cash_limit ?? 150000

  // 1. Calculate COGS per deal
  const dealCosts: Record<string, { averageBaseCost: number, dealFeePerUnit: number, shippingCostPerUnit: number }> = {}
  deals.forEach((deal: any) => {
    const dealQty = deal.quantity || 0
    const averageBaseCost = dealQty > 0 ? (deal.total_commitment || 0) / dealQty : 0
    const dealFeePerUnit = dealQty > 0 ? ((Number(deal.auction_fee || 0) + Number(deal.other_fees || 0)) / dealQty) : 0
    
    const shipment = deal.shipment_deals?.[0]?.shipments
    let shippingCostPerUnit = 0
    if (shipment) {
      const totalShipmentUnits = shipment.shipment_deals?.reduce((sum: number, sd: any) => sum + (sd.deals?.quantity || 0), 0) || 0
      shippingCostPerUnit = totalShipmentUnits > 0 ? (shipment.total_logistics_cost || 0) / totalShipmentUnits : 0
    }
    dealCosts[deal.id] = { averageBaseCost, dealFeePerUnit, shippingCostPerUnit }
  })

  // 2. Calculate Principal Inflows and Sales Profit Inflows from Paid Invoices
  let principalInflow = 0
  let salesProfitInflow = 0
  invoices.forEach(inv => {
    let invCOGS = 0
    inv.invoice_line_items?.forEach((li: any) => {
      if (li.deal_id && dealCosts[li.deal_id]) {
        const costs = dealCosts[li.deal_id]
        const itemUnitCost = li.deal_items?.unit_cost !== undefined ? Number(li.deal_items.unit_cost) : (costs.averageBaseCost - costs.dealFeePerUnit)
        const stockPlusFeeCost = itemUnitCost + costs.dealFeePerUnit
        invCOGS += li.quantity * (stockPlusFeeCost + costs.shippingCostPerUnit)
      }
    })
    principalInflow += invCOGS
    salesProfitInflow += (Number(inv.total_amount) - invCOGS)
  })

  // 3. Mobitech Pool (Profits)
  const amexCashbackLocked = deals.filter(d => d.cashback_received).reduce((s, d) => s + Number(d.cashback_amount || 0), 0)
  const mobitechProfit = salesProfitInflow + amexCashbackLocked

  // 4. Deal Outflows (All non-cancelled deals)
  const amexOutflow = deals
    .filter(d => d.status !== 'CANCELLED' && (d.funding_source === 'AMEX' || d.funding_source === 'MIXED'))
    .reduce((s, d) => s + (Number(d.amex_amount) || (d.funding_source === 'MIXED' ? Number(d.total_commitment) / 2 : Number(d.total_commitment))), 0)
    
  const turboOutflow = deals
    .filter(d => d.status !== 'CANCELLED' && (d.funding_source === 'TURBO_CASH' || d.funding_source === 'MIXED'))
    .reduce((s, d) => s + (Number(d.cash_amount) || (d.funding_source === 'MIXED' ? Number(d.total_commitment) / 2 : Number(d.total_commitment))), 0)

  const sbOutflow = deals
    .filter(d => d.status !== 'CANCELLED' && d.funding_source === 'SB_CASH')
    .reduce((s, d) => s + (Number(d.cash_amount) || Number(d.total_commitment)), 0)

  // 5. Repayments (Manual Outflows/Inflows)
  const amexPayoffs = repayments.filter(r => r.source === 'AMEX_PAYOFF_SB' || r.source === 'AMEX').reduce((s, r) => s + Number(r.amount), 0)
  const sbToAmexPayoffs = repayments.filter(r => r.source === 'AMEX_PAYOFF_SB').reduce((s, r) => s + Number(r.amount), 0)
  const sbReplenishments = repayments.filter(r => r.source === 'SB_CASH').reduce((s, r) => s + Number(r.amount), 0)
  const turboReplenishments = repayments.filter(r => r.source === 'TURBO_CASH').reduce((s, r) => s + Number(r.amount), 0)
  const turboToSbTransfers = repayments.filter(r => r.source === 'TURBO_TO_SB').reduce((s, r) => s + Number(r.amount), 0)
  const sbToTurboTransfers = repayments.filter(r => r.source === 'SB_TO_TURBO').reduce((s, r) => s + Number(r.amount), 0)

  const turboToAmexPayoffs = repayments.filter(r => r.source === 'TURBO_TO_AMEX').reduce((s, r) => s + Number(r.amount), 0)

  // 6. Final Available Balances
  const amexAvailable = amexLimitVal - amexOutflow + amexPayoffs
  const turboAvailable = turboLimitVal - turboOutflow + principalInflow + turboReplenishments - turboToSbTransfers + sbToTurboTransfers - turboToAmexPayoffs
  const sbAvailable = sbLimitVal - sbOutflow - sbToAmexPayoffs + sbReplenishments + turboToSbTransfers - sbToTurboTransfers
  
  const totalAvailable = amexAvailable + turboAvailable + sbAvailable

  // 7. Amex Alert Logic
  const amexDue = deals
    .filter(d => d.status !== 'CANCELLED' && !d.cashback_received && (d.funding_source === 'AMEX' || d.funding_source === 'MIXED'))
    .reduce((s, d) => s + (Number(d.amex_amount) || (d.funding_source === 'MIXED' ? Number(d.total_commitment) / 2 : Number(d.total_commitment))), 0)


  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    startTransition(async () => {
      await updateTreasurySettings(
        parseInputNumber(amexLimit),
        parseInputNumber(turboLimit),
        parseInputNumber(sbLimit)
      )
      setShowSettingsModal(false)
    })
  }

  const openWireModal = (wire?: any) => {
    if (wire) {
      setEditingWireId(wire.id)
      setWireAmount(formatInputNumber(wire.amount.toString()))
      setWireDest(wire.destination)
      setWireNotes(wire.notes || '')
      setWireDeal(wire.deal_id || '')
    } else {
      setEditingWireId(null)
      setWireAmount('')
      setWireDest('B-Stock')
      setWireNotes('')
      setWireDeal('')
    }
    setShowWireModal(true)
  }

  const openRepayModal = (repay?: any) => {
    if (repay) {
      setEditingRepayId(repay.id)
      setRepayAmount(formatInputNumber(repay.amount.toString()))
      if (repay.source === 'AMEX') { setTransferFrom('EXTERNAL'); setTransferTo('AMEX') }
      else if (repay.source === 'TURBO_CASH') { setTransferFrom('EXTERNAL'); setTransferTo('TURBO_CASH') }
      else if (repay.source === 'SB_CASH') { setTransferFrom('EXTERNAL'); setTransferTo('SB_CASH') }
      else if (repay.source === 'AMEX_PAYOFF_SB') { setTransferFrom('SB_CASH'); setTransferTo('AMEX') }
      else if (repay.source === 'SB_TO_TURBO') { setTransferFrom('SB_CASH'); setTransferTo('TURBO_CASH') }
      else if (repay.source === 'TURBO_TO_SB') { setTransferFrom('TURBO_CASH'); setTransferTo('SB_CASH') }
      else if (repay.source === 'TURBO_TO_AMEX') { setTransferFrom('TURBO_CASH'); setTransferTo('AMEX') }
      setRepayNotes(repay.notes || '')
    } else {
      setEditingRepayId(null)
      setRepayAmount('')
      setTransferFrom('EXTERNAL')
      setTransferTo('AMEX')
      setRepayNotes('')
    }
    setShowRepayModal(true)
  }

  const handleWire = async (e: React.FormEvent) => {
    e.preventDefault()
    startTransition(async () => {
      const amt = parseInputNumber(wireAmount)
      if (editingWireId) {
        await updateWireTransfer(editingWireId, amt, wireDest, wireNotes, wireDeal || null)
      } else {
        await logWireTransfer(wireDeal || null, amt, wireDest, wireNotes)
      }
      setShowWireModal(false)
    })
  }
  
  const handleDeleteWire = async () => {
    if (!editingWireId || !confirm('Are you sure you want to delete this wire transfer?')) return
    startTransition(async () => {
      await deleteWireTransfer(editingWireId)
      setShowWireModal(false)
    })
  }

  const handleRepay = async (e: React.FormEvent) => {
    e.preventDefault()

    let derivedSource = 'AMEX'
    if (transferFrom === 'EXTERNAL') {
      if (transferTo === 'AMEX') derivedSource = 'AMEX'
      if (transferTo === 'SB_CASH') derivedSource = 'SB_CASH'
      if (transferTo === 'TURBO_CASH') derivedSource = 'TURBO_CASH'
    } else if (transferFrom === 'SB_CASH') {
      if (transferTo === 'AMEX') derivedSource = 'AMEX_PAYOFF_SB'
      if (transferTo === 'TURBO_CASH') derivedSource = 'SB_TO_TURBO'
    } else if (transferFrom === 'TURBO_CASH') {
      if (transferTo === 'AMEX') derivedSource = 'TURBO_TO_AMEX'
      if (transferTo === 'SB_CASH') derivedSource = 'TURBO_TO_SB'
    }

    startTransition(async () => {
      const amt = parseInputNumber(repayAmount)
      if (editingRepayId) {
        await updateRepayment(editingRepayId, amt, derivedSource as any, repayNotes)
      } else {
        await logRepayment(amt, derivedSource as any, repayNotes)
      }
      setShowRepayModal(false)
    })
  }
  
  const handleDeleteRepay = async () => {
    if (!editingRepayId || !confirm('Are you sure you want to delete this repayment?')) return
    startTransition(async () => {
      await deleteRepayment(editingRepayId)
      setShowRepayModal(false)
    })
  }

  return (
    <div className="page-root">
      <div className="page-header" style={{ marginBottom: '32px' }}>
        <div>
          <h1 className="page-title">Treasury Control</h1>
          <p className="page-sub">Manage global limits, wire transfers, capital repayments, and inter-pool transfers.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn-ghost" style={{ border: '1px solid var(--border)' }} onClick={() => setShowSettingsModal(true)}>
            ⚙️ Edit Limits
          </button>
          <button className="btn-primary" style={{ background: 'var(--accent-purple)' }} onClick={() => openWireModal()}>
            💸 Log Outbound Wire
          </button>
          <button className="btn-primary" style={{ background: 'var(--accent-green)', color: '#000' }} onClick={() => openRepayModal()}>
            🏦 Log Transfer & Repayment
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', background: 'var(--card-bg)', padding: '16px 24px', borderRadius: '8px', border: '1px solid var(--border)' }}>
        <div>
          <h2 style={{ fontSize: '14px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Available Capital</h2>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-main)', marginTop: '4px' }}>
            {fmt(totalAvailable)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '24px' }}>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Amex</div>
            <div style={{ fontWeight: 600, color: 'var(--accent-purple)' }}>{fmt(amexAvailable)}</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Turbo Cash</div>
            <div style={{ fontWeight: 600, color: 'var(--accent-amber)' }}>{fmt(turboAvailable)}</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>SB Tech Cash</div>
            <div style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>{fmt(sbAvailable)}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        
        {/* MOBITECH POOL */}
        <div className="log-sum-card" style={{ borderLeft: '4px solid var(--accent-green)', cursor: 'pointer' }} onClick={() => setExpandedLedger(expandedLedger === 'MOBITECH' ? null : 'MOBITECH')}>
          <h3 style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px', textTransform: 'uppercase' }}>Mobitech Profit Pool</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Sales Profit</span>
            <span style={{ fontWeight: 600 }}>{fmt(salesProfitInflow)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Locked Amex Cashback</span>
            <span style={{ fontWeight: 600, color: 'var(--accent-green)' }}>{fmt(amexCashbackLocked)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>Total Realized Profit</span>
            <span style={{ fontWeight: 700, color: 'var(--accent-green)' }}>{fmt(mobitechProfit)}</span>
          </div>
        </div>

        {/* AMEX */}
        <div className="log-sum-card" style={{ borderLeft: '4px solid var(--accent-blue)', cursor: 'pointer' }} onClick={() => setExpandedLedger(expandedLedger === 'AMEX' ? null : 'AMEX')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h3 style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px', textTransform: 'uppercase' }}>Amex Facility</h3>
            {amexDue > 0 && (
              <div style={{ fontSize: '11px', background: 'rgba(239,68,68,0.1)', color: 'var(--accent-red)', padding: '4px 8px', borderRadius: '4px', fontWeight: 600 }}>
                ⚠️ Due by 12th: {fmt(amexDue)}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Credit Limit (Initial)</span>
            <span style={{ fontWeight: 600 }}>{fmt(amexLimitVal)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Deal Outflows</span>
            <span style={{ fontWeight: 600, color: 'var(--accent-red)' }}>-{fmt(amexOutflow)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Repayments In</span>
            <span style={{ fontWeight: 600, color: 'var(--accent-green)' }}>+{fmt(amexPayoffs)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>Available Credit</span>
            <span style={{ fontWeight: 700, color: 'var(--accent-blue)' }}>{fmt(amexAvailable)}</span>
          </div>
        </div>

        {/* TURBO CASH */}
        <div className="log-sum-card" style={{ borderLeft: '4px solid var(--accent-amber)', cursor: 'pointer' }} onClick={() => setExpandedLedger(expandedLedger === 'TURBO' ? null : 'TURBO')}>
          <h3 style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px', textTransform: 'uppercase' }}>Turbo Cash Pool</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Initial Deposit</span>
            <span style={{ fontWeight: 600 }}>{fmt(turboLimitVal)}</span>
          </div>
          {sbToTurboTransfers > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Transferred from SB</span>
              <span style={{ fontWeight: 600, color: 'var(--accent-green)' }}>+{fmt(sbToTurboTransfers)}</span>
            </div>
          )}
          {turboToSbTransfers > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Transferred to SB</span>
              <span style={{ fontWeight: 600, color: 'var(--accent-red)' }}>-{fmt(turboToSbTransfers)}</span>
            </div>
          )}
          {turboToAmexPayoffs > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Transferred to Amex</span>
              <span style={{ fontWeight: 600, color: 'var(--accent-red)' }}>-{fmt(turboToAmexPayoffs)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Deal Outflows</span>
            <span style={{ fontWeight: 600, color: 'var(--accent-red)' }}>-{fmt(turboOutflow)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Principal Recovered</span>
            <span style={{ fontWeight: 600, color: 'var(--accent-green)' }}>+{fmt(principalInflow)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>Available</span>
            <span style={{ fontWeight: 700, color: 'var(--accent-amber)' }}>{fmt(turboAvailable)}</span>
          </div>
        </div>

        {/* SB TECH CASH */}
        <div className="log-sum-card" style={{ borderLeft: '4px solid var(--accent-purple)', cursor: 'pointer' }} onClick={() => setExpandedLedger(expandedLedger === 'SB' ? null : 'SB')}>
          <h3 style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px', textTransform: 'uppercase' }}>SB Tech Cash Pool</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Initial Deposit</span>
            <span style={{ fontWeight: 600 }}>{fmt(sbLimitVal)}</span>
          </div>
          {turboToSbTransfers > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Transferred from Turbo</span>
              <span style={{ fontWeight: 600, color: 'var(--accent-green)' }}>+{fmt(turboToSbTransfers)}</span>
            </div>
          )}
          {sbToTurboTransfers > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Transferred to Turbo</span>
              <span style={{ fontWeight: 600, color: 'var(--accent-red)' }}>-{fmt(sbToTurboTransfers)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Deal Outflows</span>
            <span style={{ fontWeight: 600, color: 'var(--accent-red)' }}>-{fmt(sbOutflow)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Transfers to Amex</span>
            <span style={{ fontWeight: 600, color: 'var(--accent-red)' }}>-{fmt(sbToAmexPayoffs)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>Available</span>
            <span style={{ fontWeight: 700, color: 'var(--accent-purple)' }}>{fmt(sbAvailable)}</span>
          </div>
        </div>
      </div>

      {expandedLedger && (
        <div className="panel" style={{ padding: '24px', marginBottom: '32px', animation: 'fadeIn 0.2s ease-out' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600 }}>
              {expandedLedger === 'AMEX' ? 'Amex Ledger' :
               expandedLedger === 'TURBO' ? 'Turbo Cash Ledger' :
               expandedLedger === 'SB' ? 'SB Tech Cash Ledger' : 'Mobitech Profit Ledger'}
            </h2>
            <button className="btn-ghost" onClick={() => setExpandedLedger(null)}>Close</button>
          </div>
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {expandedLedger === 'MOBITECH' ? (
                  <>
                    <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>Date Paid</th>
                    <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>Client</th>
                    <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>Invoice</th>
                    <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>Deals</th>
                    <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontWeight: 500, textAlign: 'right' }}>Qty</th>
                    <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontWeight: 500, textAlign: 'right' }}>Sales Profit</th>
                    <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontWeight: 500, textAlign: 'right' }}>Amex Profit</th>
                    <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontWeight: 500, textAlign: 'right' }}>Total Profit</th>
                    <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontWeight: 500, textAlign: 'right' }}>ROI</th>
                  </>
                ) : (
                  <>
                    <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>Date</th>
                    <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>Description</th>
                    <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontWeight: 500, textAlign: 'right' }}>Amount</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {expandedLedger === 'MOBITECH' ? (
                (() => {
                  let grandTotalQty = 0
                  let grandTotalSalesProfit = 0
                  let grandTotalAmexProfit = 0
                  let grandTotalCOGS = 0

                  const rows = invoices.map(inv => {
                    let invCOGS = 0
                    let invAmexCashback = 0
                    let totalQuantity = 0
                    const relatedDealsMap = new Map<string, string>()

                    inv.invoice_line_items?.forEach((li: any) => {
                      const deal = deals.find(d => d.id === li.deal_id)
                      if (deal) {
                        relatedDealsMap.set(deal.id, deal.deal_number)
                        if (dealCosts[deal.id]) {
                          const costs = dealCosts[deal.id]
                          const itemUnitCost = li.deal_items?.unit_cost !== undefined ? Number(li.deal_items.unit_cost) : (costs.averageBaseCost - costs.dealFeePerUnit)
                          const stockPlusFeeCost = itemUnitCost + costs.dealFeePerUnit
                          invCOGS += li.quantity * (stockPlusFeeCost + costs.shippingCostPerUnit)
                          totalQuantity += li.quantity
                          if (deal.quantity > 0 && (deal.funding_source === 'AMEX' || deal.funding_source === 'MIXED')) {
                            const dealAmex = Number(deal.amex_amount) || (deal.funding_source === 'MIXED' ? Number(deal.total_commitment) / 2 : Number(deal.total_commitment))
                            const amexProfitForDeal = dealAmex * 0.02
                            invAmexCashback += li.quantity * (amexProfitForDeal / deal.quantity)
                          }
                        }
                      }
                    })
                    const salesProfit = Number(inv.total_amount) - invCOGS
                    const totalProfit = salesProfit + invAmexCashback
                    const roi = invCOGS > 0 ? (totalProfit / invCOGS) * 100 : 0

                    grandTotalQty += totalQuantity
                    grandTotalSalesProfit += salesProfit
                    grandTotalAmexProfit += invAmexCashback
                    grandTotalCOGS += invCOGS

                    return (
                      <tr key={inv.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px 8px' }}>{fmtDate(inv.issue_date || inv.created_at || new Date().toISOString())}</td>
                        <td style={{ padding: '12px 8px' }}>{inv.clients?.name || 'Unknown Client'}</td>
                        <td style={{ padding: '12px 8px', color: 'var(--text-primary)', fontWeight: 500 }}>
                          <a href={`/dashboard/sales/${inv.id}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-blue)', textDecoration: 'none' }}>
                            {inv.invoice_number}
                          </a>
                        </td>
                        <td style={{ padding: '12px 8px' }}>
                          {Array.from(relatedDealsMap.entries()).map(([dealId, dealNumber], i) => (
                            <span key={dealId}>
                              <a href={`/dashboard/deals/${dealId}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-purple)', textDecoration: 'none' }}>{dealNumber}</a>
                              {i < relatedDealsMap.size - 1 ? ', ' : ''}
                            </span>
                          ))}
                        </td>
                        <td style={{ padding: '12px 8px', textAlign: 'right' }}>{totalQuantity}</td>
                        <td style={{ padding: '12px 8px', textAlign: 'right', color: salesProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{fmt(salesProfit)}</td>
                        <td style={{ padding: '12px 8px', textAlign: 'right', color: 'var(--accent-green)' }}>{fmt(invAmexCashback)}</td>
                        <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 600, color: totalProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{fmt(totalProfit)}</td>
                        <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 600 }}>{roi.toFixed(2)}%</td>
                      </tr>
                    )
                  })

                  const grandTotalOverallProfit = grandTotalSalesProfit + grandTotalAmexProfit
                  const grandTotalROI = grandTotalCOGS > 0 ? (grandTotalOverallProfit / grandTotalCOGS) * 100 : 0

                  return (
                    <>
                      {rows}
                      {invoices.length > 0 && (
                        <tr style={{ backgroundColor: 'var(--bg-secondary)', fontWeight: 'bold', borderTop: '2px solid var(--border)' }}>
                          <td colSpan={4} style={{ padding: '12px 8px', textAlign: 'right', color: 'var(--text-primary)' }}>TOTALS</td>
                          <td style={{ padding: '12px 8px', textAlign: 'right', color: 'var(--text-primary)' }}>{grandTotalQty}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'right', color: grandTotalSalesProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{fmt(grandTotalSalesProfit)}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'right', color: 'var(--accent-green)' }}>{fmt(grandTotalAmexProfit)}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'right', color: grandTotalOverallProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{fmt(grandTotalOverallProfit)}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'right', color: 'var(--text-primary)' }}>{grandTotalROI.toFixed(2)}%</td>
                        </tr>
                      )}
                    </>
                  )
                })()
              ) : (
                <tr>
                  <td colSpan={3} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Ledger transactions will be listed here in chronological order.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '32px' }}>
        
        {/* Wire Transfers Ledger */}
        <div className="panel" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Outbound Wires</h2>
          <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
            {wires.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No wire transfers logged.</p> : null}
            {wires.map(w => (
              <div key={w.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ cursor: 'pointer' }} onClick={() => openWireModal(w)}>
                  <div style={{ fontWeight: 500, display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {w.destination}
                    <span style={{ fontSize: '10px', background: 'var(--bg-hover)', padding: '2px 6px', borderRadius: '4px' }}>Edit</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {fmtDate(w.created_at)} {w.deals?.deal_number ? `• Deal ${w.deals.deal_number}` : ''}
                  </div>
                </div>
                <div style={{ fontWeight: 600, color: 'var(--accent-purple)' }}>
                  {fmt(w.amount)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Repayments Ledger */}
        <div className="panel" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Capital Repayments & Transfers</h2>
          <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
            {repayments.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No repayments logged.</p> : null}
            {repayments.map(r => (
              <div key={r.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ cursor: 'pointer' }} onClick={() => openRepayModal(r)}>
                  <div style={{ fontWeight: 500, display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {r.source === 'AMEX' ? 'External -> Amex Bill Payment' : r.source === 'TURBO_CASH' ? 'External -> Turbo Cash Replenishment' : r.source === 'SB_CASH' ? 'External -> SB Cash Replenishment' : r.source === 'AMEX_PAYOFF_SB' ? 'SB Cash to Amex Payoff' : r.source === 'TURBO_TO_SB' ? 'Turbo Cash to SB Cash' : r.source === 'SB_TO_TURBO' ? 'SB Cash to Turbo Cash' : r.source === 'TURBO_TO_AMEX' ? 'Turbo Cash to Amex Payoff' : 'Repayment'}
                    <span style={{ fontSize: '10px', background: 'var(--bg-hover)', padding: '2px 6px', borderRadius: '4px' }}>Edit</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {fmtDate(r.created_at)}
                  </div>
                </div>
                <div style={{ fontWeight: 600, color: 'var(--accent-green)' }}>
                  {fmt(r.amount)}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Edit Treasury Initial Deposits</h2>
            <form onSubmit={handleUpdateSettings}>
              <div className="form-group">
                <label>Amex Credit Limit</label>
                <input type="text" required className="form-input" value={amexLimit} onChange={e => setAmexLimit(formatInputNumber(e.target.value))} />
              </div>
              <div className="form-group">
                <label>Turbo Cash Initial Deposit</label>
                <input type="text" required className="form-input" value={turboLimit} onChange={e => setTurboLimit(formatInputNumber(e.target.value))} />
              </div>
              <div className="form-group">
                <label>SB Cash Initial Deposit</label>
                <input type="text" required className="form-input" value={sbLimit} onChange={e => setSbLimit(formatInputNumber(e.target.value))} />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn-ghost" onClick={() => setShowSettingsModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={isPending}>{isPending ? 'Saving...' : 'Save Limits'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Wire Modal */}
      {showWireModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>{editingWireId ? 'Edit Wire Transfer' : 'Log Outbound Wire'}</h2>
            <form onSubmit={handleWire}>
              <div className="form-group">
                <label>Destination</label>
                <input type="text" required className="form-input" value={wireDest} onChange={e => setWireDest(e.target.value)} placeholder="e.g. B-Stock, EcoATM, Shipping Co" />
              </div>
              <div className="form-group">
                <label>Amount (USD)</label>
                <input type="text" required className="form-input" value={wireAmount} onChange={e => setWireAmount(formatInputNumber(e.target.value))} />
              </div>
              <div className="form-group">
                <label>Associated Deal (Optional)</label>
                <select className="form-input" value={wireDeal} onChange={e => setWireDeal(e.target.value)}>
                  <option value="">-- None --</option>
                  {deals.filter(d => d.status !== 'DEAL_CLOSED' || d.id === wireDeal).map(d => (
                    <option key={d.id} value={d.id}>{d.deal_number} ({d.model})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Notes</label>
                <input type="text" className="form-input" value={wireNotes} onChange={e => setWireNotes(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'space-between' }}>
                {editingWireId && userRole === 'SUPER_ADMIN' ? (
                  <button type="button" className="btn-ghost" style={{ color: 'var(--accent-red)' }} onClick={handleDeleteWire} disabled={isPending}>Delete</button>
                ) : <div />}
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button type="button" className="btn-ghost" onClick={() => setShowWireModal(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" style={{ background: 'var(--accent-purple)' }} disabled={isPending}>{isPending ? 'Saving...' : 'Save'}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Repay Modal */}
      {showRepayModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>{editingRepayId ? 'Edit Transaction' : 'Log Transfer / Repayment'}</h2>
            <form onSubmit={handleRepay}>
              <div className="form-group">
                <label>Source Account</label>
                <select className="form-input" value={transferFrom} onChange={e => setTransferFrom(e.target.value)}>
                  <option value="EXTERNAL">External Bank Account</option>
                  <option value="SB_CASH">SB Tech Cash Pool</option>
                  <option value="TURBO_CASH">Turbo Cash Pool</option>
                </select>
              </div>
              <div className="form-group">
                <label>Send To</label>
                <select className="form-input" value={transferTo} onChange={e => setTransferTo(e.target.value)}>
                  {(transferFrom === 'EXTERNAL' || transferFrom === 'SB_CASH' || transferFrom === 'TURBO_CASH') && <option value="AMEX">Amex Facility</option>}
                  {(transferFrom === 'EXTERNAL' || transferFrom === 'TURBO_CASH') && <option value="SB_CASH">SB Tech Cash Pool</option>}
                  {(transferFrom === 'EXTERNAL' || transferFrom === 'SB_CASH') && <option value="TURBO_CASH">Turbo Cash Pool</option>}
                </select>
              </div>
              <div className="form-group">
                <label>Amount (USD)</label>
                <input type="text" required className="form-input" value={repayAmount} onChange={e => setRepayAmount(formatInputNumber(e.target.value))} />
              </div>
              <div className="form-group">
                <label>Notes</label>
                <input type="text" className="form-input" value={repayNotes} onChange={e => setRepayNotes(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'space-between' }}>
                {editingRepayId && userRole === 'SUPER_ADMIN' ? (
                  <button type="button" className="btn-ghost" style={{ color: 'var(--accent-red)' }} onClick={handleDeleteRepay} disabled={isPending}>Delete</button>
                ) : <div />}
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button type="button" className="btn-ghost" onClick={() => setShowRepayModal(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" style={{ background: 'var(--accent-green)', color: '#000' }} disabled={isPending}>{isPending ? 'Saving...' : 'Save'}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}

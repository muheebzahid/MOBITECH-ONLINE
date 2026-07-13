'use client'

import { useState, useEffect, Suspense, useTransition, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { DEAL_STATUSES, type Deal } from '@/lib/deals/constants'
import { useRole } from '@/components/RoleProvider'
import { bulkCreateDeals, updateDealStatus } from '@/lib/deals/actions'
import NewDealModal from './NewDealModal'
import EditDealModal from './EditDealModal'
import Papa from 'papaparse'

interface Props { 
  deals: Deal[]
  settings: any
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(n)
}

function fmtUnit(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(n)
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' })
}

function pct(used: number, total: number) {
  return Math.min(100, Math.round((used / total) * 100))
}

const SHIPMENT_COLORS = [
  'rgba(59, 130, 246, 0.08)',  // Blue
  'rgba(16, 185, 129, 0.08)',  // Green
  'rgba(139, 92, 246, 0.08)',  // Purple
  'rgba(245, 158, 11, 0.08)',  // Amber
  'rgba(236, 72, 153, 0.08)',  // Pink
]

function getShipmentColor(shipmentId: string) {
  let hash = 0;
  for (let i = 0; i < shipmentId.length; i++) {
    hash = shipmentId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return SHIPMENT_COLORS[Math.abs(hash) % SHIPMENT_COLORS.length];
}

function DealsClientInner({ deals, settings }: Props) {
  const [showModal, setShowModal] = useState(false)
  const [editDeal, setEditDeal]   = useState<Deal | null>(null)
  const [showAmexDetails, setShowAmexDetails] = useState(false)
  const [showCashDetails, setShowCashDetails] = useState(false)
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const role = useRole()
  
  const searchParams = useSearchParams()
  const highlightParam = searchParams.get('highlight')
  const [isHighlighting, setIsHighlighting] = useState(false)
  const [showDates, setShowDates] = useState(false)
  const [showFunding, setShowFunding] = useState(false)
  const [showStatus, setShowStatus] = useState(false)

  const [isPending, startTransition] = useTransition()
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [selectedDealIds, setSelectedDealIds] = useState<string[]>([])
  const [showBulkAdvance, setShowBulkAdvance] = useState(false)
  const [bulkStatus, setBulkStatus] = useState<string>('')
  const [bulkDate, setBulkDate] = useState(() => new Date().toISOString().split('T')[0])
  const [bulkInvoice, setBulkInvoice] = useState('')
  const [bulkError, setBulkError] = useState('')

  const handleBulkSubmit = () => {
    if (!bulkStatus) return
    setBulkError('')
    startTransition(async () => {
      const needsDate = bulkStatus === 'PAID' || bulkStatus === 'PAYMENT_REQUIRED' || bulkStatus === 'AT_SB_TECHNOLOGY' || bulkStatus === 'AT_TURBO_LOGISTICS' || bulkStatus === 'RECEIVED_BY_MOBITECH'
      for (const id of selectedDealIds) {
        await updateDealStatus(id, bulkStatus, 'Bulk updated', needsDate ? bulkDate : undefined, [], bulkInvoice)
      }
      setShowBulkAdvance(false)
      setSelectedDealIds([])
      setBulkStatus('')
      setBulkInvoice('')
    })
  }

  useEffect(() => {
    if (highlightParam === 'unsold') {
      setIsHighlighting(true)
      const timer = setTimeout(() => setIsHighlighting(false), 15000)
      return () => clearTimeout(timer)
    }
  }, [highlightParam])

  const handleDownloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8,date,vendor,grade,model,storage,condition,unit cost,quantity\n";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "mobitech_deals_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const data = results.data as any[]
        const mapped = data.map(row => {
          return {
            date: row.date || row.Date || '',
            vendor: row.vendor || row.Vendor || '',
            grade: row.grade || row.Grade || '',
            model: row.model || row.Model || '',
            storage: row.storage || row.Storage || '',
            condition: row.condition || row.Condition || '',
            unit_cost: row['unit cost'] || row['Unit Cost'] || row.unit_cost || '0',
            quantity: row.quantity || row.Quantity || '1',
          }
        }).filter(r => r.model && parseFloat(r.unit_cost) > 0)

        if (mapped.length === 0) {
          alert('No valid deals found. Ensure the template headers match and rows have models and costs.')
          setIsUploading(false)
          return
        }

        startTransition(async () => {
          const res = await bulkCreateDeals(mapped)
          setIsUploading(false)
          if (fileInputRef.current) fileInputRef.current.value = ''
          if (res.error) alert(res.error)
          else alert(`Successfully uploaded ${res.count} deals!`)
        })
      }
    })
  }

  const filtered = deals.filter(d => {
    const matchSearch = search === '' ||
      d.deal_number.toLowerCase().includes(search.toLowerCase()) ||
      d.model.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'ALL' || d.status === statusFilter
    return matchSearch && matchStatus
  })

  // Deal counts
  const now30 = Date.now()
  const closedDeals       = deals.filter(d => d.status === 'DEAL_CLOSED').length
  const unclosedFresh     = deals.filter(d => d.status !== 'DEAL_CLOSED' && (!d.payment_date || (now30 - new Date(d.payment_date).getTime()) < 30 * 86400_000)).length
  const unclosedOverdue   = deals.filter(d => d.status !== 'DEAL_CLOSED' && d.payment_date && (now30 - new Date(d.payment_date).getTime()) >= 30 * 86400_000).length
  const totalRevenue      = deals.reduce((s, d) => s + (d.total_revenue || 0), 0)
  
  const totalRemainingUnits = deals.reduce((sum, deal) => {
    if (deal.status === 'DEAL_CLOSED') return sum
    const invoicedQty = deal.invoice_line_items ? deal.invoice_line_items.filter((i:any) => i.invoices?.status !== 'CANCELLED' && i.invoices?.status !== 'VOIDED').reduce((sq:number, i:any) => sq + (i.quantity || 0), 0) : 0
    const rem = deal.quantity - invoicedQty
    return sum + (rem > 0 ? rem : 0)
  }, 0)

  // Amex: sum of amex_amount on all UNCLOSED deals funded by Amex or Mixed
  const amexStuck = deals
    .filter(d => d.status !== 'DEAL_CLOSED' && (d.funding_source === 'AMEX' || d.funding_source === 'MIXED'))
    .reduce((s, d) => s + (d.amex_amount || d.total_commitment), 0)
  const amexAvailable = settings.amex_limit - amexStuck

  // Cash: sum of cash_amount on all UNCLOSED deals funded by Cash or Mixed
  const cashStuck = deals
    .filter(d => d.status !== 'DEAL_CLOSED' && (d.funding_source === 'CASH_POOL' || d.funding_source === 'MIXED'))
    .reduce((s, d) => s + (d.cash_amount || d.total_commitment), 0)
  const cashAvailable = settings.cash_limit - cashStuck

  const amexPct = pct(amexStuck, settings.amex_limit)
  const cashPct = pct(cashStuck, settings.cash_limit)

  // Amex cutoff date = 12th of current month (or next month if already past)
  const now = new Date()
  let cutoff = new Date(now.getFullYear(), now.getMonth(), 12)
  if (now >= cutoff) cutoff = new Date(now.getFullYear(), now.getMonth() + 1, 12)
  const daysLeft = Math.ceil((cutoff.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  const cutoffStr = cutoff.toLocaleDateString('en-AE', { day: '2-digit', month: 'long', year: 'numeric' })
  const cutoffUrgency = daysLeft <= 3 ? 'cutoff-danger' : daysLeft <= 7 ? 'cutoff-warn' : 'cutoff-ok'

  let tQty = 0, tInvQty = 0, tInvVal = 0, tRem = 0, tCommitted = 0, tShipCost = 0, tStuck = 0, tProfit = 0
  filtered.forEach(deal => {
    const invoicedQty = deal.invoice_line_items ? deal.invoice_line_items.filter((i:any) => i.invoices?.status !== 'CANCELLED' && i.invoices?.status !== 'VOIDED').reduce((sum:number, i:any) => sum + (i.quantity || 0), 0) : 0
    const validLineItems = deal.invoice_line_items ? deal.invoice_line_items.filter((i:any) => i.invoices && i.invoices.status !== 'CANCELLED' && i.invoices.status !== 'VOIDED') : []
    const invoicedValue = validLineItems.reduce((sum: number, i: any) => sum + ((i.quantity || 0) * (i.unit_price || 0)), 0)
    let dealShipmentCost = 0
    const shipmentData = deal.shipment_deals?.[0]?.shipments
    if (shipmentData) {
      const totalShipmentCost = Number(shipmentData.total_logistics_cost) || 0
      const totalShipmentUnits = shipmentData.shipment_deals?.reduce((sum: number, sd: any) => sum + (Number(sd.deals?.quantity) || 0), 0) || 0
      if (totalShipmentUnits > 0) {
        dealShipmentCost = (totalShipmentCost / totalShipmentUnits) * deal.quantity
      }
    }
    tQty += deal.quantity
    tInvQty += invoicedQty
    tInvVal += invoicedValue
    tRem += (deal.quantity - invoicedQty)
    tCommitted += deal.total_commitment
    tShipCost += dealShipmentCost
    tStuck += (deal.total_commitment - invoicedValue)
    tProfit += (invoicedValue - deal.total_commitment - dealShipmentCost)
  })

  return (
    <div className="page-root">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Deals</h1>
          <p className="page-sub">Track every auction purchase from win to settlement</p>
        </div>
        {role !== 'FINANCE' && (
          <div style={{ display: 'flex', gap: '12px' }}>
            <input 
              type="file" 
              accept=".csv" 
              style={{ display: 'none' }} 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
            />
            <button className="btn-ghost" onClick={handleDownloadTemplate} style={{ border: '1px solid var(--border)' }}>
              Download Template
            </button>
            <button className="btn-ghost" onClick={() => fileInputRef.current?.click()} style={{ border: '1px solid var(--accent-amber)', color: 'var(--accent-amber)' }} disabled={isUploading || isPending}>
              {isUploading || isPending ? 'Uploading...' : 'Upload Bulk Deals'}
            </button>
            <button id="new-deal-modal-btn" className="btn-primary" onClick={() => setShowModal(true)}>
              + New Deal
            </button>
          </div>
        )}
      </div>

      {/* ── Row 1: Deal Counts ── */}
      <div className="deal-summary-row" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <div className="deal-summary-card">
          <span className="ds-label">Total Deals</span>
          <span className="ds-value">{deals.length}</span>
        </div>
        <div className="deal-summary-card ds-card-purple">
          <span className="ds-label">Active · Under 30 Days</span>
          <span className="ds-value ds-purple">{unclosedFresh}</span>
          <span className="ds-tag ds-tag-purple">Within target</span>
        </div>
        <div className="deal-summary-card ds-card-red">
          <span className="ds-label">Overdue · Over 30 Days</span>
          <span className="ds-value ds-red">{unclosedOverdue}</span>
          <span className="ds-tag ds-tag-red">{unclosedOverdue > 0 ? 'Needs attention' : 'All clear'}</span>
        </div>
        <div className="deal-summary-card ds-card-amber">
          <span className="ds-label">Remaining Units</span>
          <span className="ds-value" style={{ color: 'var(--accent-amber)' }}>{totalRemainingUnits}</span>
          <span className="ds-tag" style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--accent-amber)' }}>In stock / Transit</span>
        </div>
        <div className="deal-summary-card ds-card-green">
          <span className="ds-label">Closed Deals</span>
          <span className="ds-value ds-green">{closedDeals}</span>
          <span className="ds-tag ds-tag-green">Settled</span>
        </div>
      </div>

      {/* ── Row 2: Amex + Cash Treasury Cards ── */}
      <div className="deal-summary-row deal-summary-row-2">

        {/* AMEX CARD */}
        <div className="treasury-card treasury-card-amex">
          <div className="tc-header" onClick={() => setShowAmexDetails(!showAmexDetails)} style={{ cursor: 'pointer' }}>
            <div className="tc-icon">💳</div>
            <div style={{ flex: 1 }}>
              <div className="tc-title">American Express</div>
              <div className="tc-limit">Limit: {fmt(settings.amex_limit)}</div>
            </div>
            <div className={`tc-pct ${amexPct > 85 ? 'tc-pct-danger' : amexPct > 60 ? 'tc-pct-warn' : 'tc-pct-ok'}`}>
              {amexPct}% used
            </div>
            <div style={{ marginLeft: '12px', opacity: 0.5 }}>{showAmexDetails ? '▲' : '▼'}</div>
          </div>

          {/* Progress Bar */}
          <div className="tc-bar-bg" style={{ marginTop: '16px' }}>
            <div
              className={`tc-bar-fill ${amexPct > 85 ? 'bar-danger' : amexPct > 60 ? 'bar-warn' : 'bar-ok'}`}
              style={{ width: `${amexPct}%` }}
            />
          </div>

          {/* Details (Collapsible) */}
          {showAmexDetails && (
            <div style={{ marginTop: '20px' }}>
              {/* Cutoff Date Banner */}
              <div className={`amex-cutoff-banner ${cutoffUrgency}`}>
                <div className="acb-left">
                  <span className="acb-icon">{daysLeft <= 3 ? '🔴' : daysLeft <= 7 ? '🟡' : '🟢'}</span>
                  <div>
                    <div className="acb-label">Statement Cutoff Date</div>
                    <div className="acb-date">{cutoffStr}</div>
                  </div>
                </div>
                <div className="acb-right">
                  <span className="acb-days">{daysLeft}</span>
                  <span className="acb-days-label">day{daysLeft !== 1 ? 's' : ''} left</span>
                </div>
              </div>

              {/* Two sub-boxes */}
              <div className="tc-sub-row">
                <div className="tc-sub-box tc-sub-stuck">
                  <span className="tc-sub-label">Stuck in Deals</span>
                  <span className="tc-sub-value tc-val-red">{fmt(amexStuck)}</span>
                  <span className="tc-sub-note">Across {deals.filter(d => d.status !== 'DEAL_CLOSED' && (d.funding_source === 'AMEX' || d.funding_source === 'MIXED')).length} unclosed deal{deals.filter(d => d.status !== 'DEAL_CLOSED' && (d.funding_source === 'AMEX' || d.funding_source === 'MIXED')).length !== 1 ? 's' : ''}</span>
                </div>
                <div className="tc-sub-box tc-sub-avail">
                  <span className="tc-sub-label">Available to Invest</span>
                  <span className="tc-sub-value tc-val-green">{fmt(Math.max(0, amexAvailable))}</span>
                  <span className="tc-sub-note">{amexAvailable <= 0 ? '⚠ Limit reached' : 'Ready to deploy'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* CASH CARD */}
        <div className="treasury-card treasury-card-cash">
          <div className="tc-header" onClick={() => setShowCashDetails(!showCashDetails)} style={{ cursor: 'pointer' }}>
            <div className="tc-icon">💵</div>
            <div style={{ flex: 1 }}>
              <div className="tc-title">Cash Pool</div>
              <div className="tc-limit">Pool: {fmt(settings.cash_limit)} · Cost: 7% p.a.</div>
            </div>
            <div className={`tc-pct ${cashPct > 85 ? 'tc-pct-danger' : cashPct > 60 ? 'tc-pct-warn' : 'tc-pct-ok'}`}>
              {cashPct}% used
            </div>
            <div style={{ marginLeft: '12px', opacity: 0.5 }}>{showCashDetails ? '▲' : '▼'}</div>
          </div>

          {/* Progress Bar */}
          <div className="tc-bar-bg" style={{ marginTop: '16px' }}>
            <div
              className={`tc-bar-fill ${cashPct > 85 ? 'bar-danger' : cashPct > 60 ? 'bar-warn' : 'bar-ok'}`}
              style={{ width: `${cashPct}%` }}
            />
          </div>

          {/* Details (Collapsible) */}
          {showCashDetails && (
            <div style={{ marginTop: '20px' }}>
              {/* Two sub-boxes */}
              <div className="tc-sub-row">
                <div className="tc-sub-box tc-sub-stuck">
                  <span className="tc-sub-label">Stuck in Deals</span>
                  <span className="tc-sub-value tc-val-red">{fmt(cashStuck)}</span>
                  <span className="tc-sub-note">Across {deals.filter(d => d.status !== 'DEAL_CLOSED' && (d.funding_source === 'CASH_POOL' || d.funding_source === 'MIXED')).length} unclosed deal{deals.filter(d => d.status !== 'DEAL_CLOSED' && (d.funding_source === 'CASH_POOL' || d.funding_source === 'MIXED')).length !== 1 ? 's' : ''}</span>
                </div>
                <div className="tc-sub-box tc-sub-avail">
                  <span className="tc-sub-label">Available to Invest</span>
                  <span className="tc-sub-value tc-val-green">{fmt(Math.max(0, cashAvailable))}</span>
                  <span className="tc-sub-note">{cashAvailable <= 0 ? '⚠ Pool exhausted' : 'Ready to deploy'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Filters */}
      <div className="deal-filters">
        <input
          id="deal-search" type="text"
          placeholder="Search by deal number or model..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="deal-search"
        />
        <select id="deal-status-filter" value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)} className="deal-filter-select">
          <option value="ALL">All Statuses</option>
          {Object.entries(DEAL_STATUSES).map(([key, val]) => (
            <option key={key} value={key}>{val.label}</option>
          ))}
        </select>
      </div>

      {/* Deals Table */}
      {filtered.length === 0 ? (
        <div className="deals-empty">
          <div className="deals-empty-icon">◈</div>
          <h3>No deals yet</h3>
          <p>Click <strong>+ New Deal</strong> to log your first B-Stock or EcoATM auction win.</p>
        </div>
      ) : (
        <div className="deals-table-wrap">
          <table className="deals-table">
            <thead>
              <tr>
                <th style={{width: '40px'}}>
                  <input type="checkbox" checked={filtered.length > 0 && selectedDealIds.length === filtered.length} onChange={(e) => {
                    if (e.target.checked) setSelectedDealIds(filtered.map(d => d.id))
                    else setSelectedDealIds([])
                  }} />
                </th>
                <th>Deal #</th>
                <th>Model</th>
                <th>Qty</th>
                <th>Invoiced Qty Sold</th>
                <th>Invoiced Value</th>
                <th>Remaining Units</th>
                <th>Committed</th>
                <th>Shipment Cost</th>
                <th>Stuck Capital</th>
                {showFunding ? (
                  <th onClick={() => setShowFunding(false)} style={{cursor: 'pointer', color: 'var(--accent-blue)'}} title="Click to hide funding">Funding ◀</th>
                ) : (
                  <th onClick={() => setShowFunding(true)} style={{cursor: 'pointer', color: 'var(--accent-blue)', width: '30px', textAlign: 'center'}} title="Click to show funding">$ ▶</th>
                )}
                {showStatus ? (
                  <th onClick={() => setShowStatus(false)} style={{cursor: 'pointer', color: 'var(--accent-blue)'}} title="Click to hide status">Status ◀</th>
                ) : (
                  <th onClick={() => setShowStatus(true)} style={{cursor: 'pointer', color: 'var(--accent-blue)', width: '60px', textAlign: 'center'}} title="Click to show status">Status ▶</th>
                )}
                {showDates ? (
                  <>
                    <th onClick={() => setShowDates(false)} style={{cursor: 'pointer', color: 'var(--accent-blue)'}} title="Click to hide">Winning Date ◀</th>
                    <th onClick={() => setShowDates(false)} style={{cursor: 'pointer', color: 'var(--accent-blue)'}} title="Click to hide">Paid Date</th>
                    <th onClick={() => setShowDates(false)} style={{cursor: 'pointer', color: 'var(--accent-blue)'}} title="Click to hide">SB Tech Date</th>
                  </>
                ) : (
                  <th onClick={() => setShowDates(true)} style={{cursor: 'pointer', color: 'var(--accent-blue)', width: '40px', textAlign: 'center'}} title="Click to expand timeline">LT ▶</th>
                )}
                <th>Gross Profit</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(deal => {
                const st = DEAL_STATUSES[deal.status]
                const isDealUnclosed = deal.status !== 'DEAL_CLOSED'
                const shipmentId = deal.shipment_deals?.[0]?.shipments?.id
                const invoicedQty = deal.invoice_line_items ? deal.invoice_line_items.filter((i:any) => i.invoices?.status !== 'CANCELLED' && i.invoices?.status !== 'VOIDED').reduce((sum:number, i:any) => sum + (i.quantity || 0), 0) : 0
                const validLineItems = deal.invoice_line_items ? deal.invoice_line_items.filter((i:any) => i.invoices && i.invoices.status !== 'CANCELLED' && i.invoices.status !== 'VOIDED') : []
                const invoicedValue = validLineItems.reduce((sum: number, i: any) => sum + ((i.quantity || 0) * (i.unit_price || 0)), 0)
                const remainingQty = deal.quantity - invoicedQty
                const stuckCapital = deal.total_commitment - invoicedValue
                
                let shipmentUnitCost = 0
                let dealShipmentCost = 0
                const shipmentData = deal.shipment_deals?.[0]?.shipments
                if (shipmentData) {
                  const totalShipmentCost = Number(shipmentData.total_logistics_cost) || 0
                  const totalShipmentUnits = shipmentData.shipment_deals?.reduce((sum: number, sd: any) => sum + (Number(sd.deals?.quantity) || 0), 0) || 0
                  if (totalShipmentUnits > 0) {
                    shipmentUnitCost = totalShipmentCost / totalShipmentUnits
                    dealShipmentCost = shipmentUnitCost * deal.quantity
                  }
                }

                const liveGrossProfit = invoicedValue - deal.total_commitment - dealShipmentCost

                let bgStyle: any = {}
                if (isHighlighting && isDealUnclosed) {
                  bgStyle = { backgroundColor: 'rgba(255, 100, 100, 0.15)' }
                } else if (shipmentId) {
                  bgStyle = { backgroundColor: getShipmentColor(shipmentId) }
                }
                const highlightStyle = { ...bgStyle, transition: 'background-color 0.5s' }
                return (
                  <tr key={deal.id} className="deal-row" style={highlightStyle}>
                    <td>
                      <input type="checkbox" checked={selectedDealIds.includes(deal.id)} onChange={(e) => {
                        if (e.target.checked) setSelectedDealIds([...selectedDealIds, deal.id])
                        else setSelectedDealIds(selectedDealIds.filter(id => id !== deal.id))
                      }} />
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <a href={`/dashboard/deals/${deal.id}`} className="deal-number-link">
                          {deal.deal_number}
                        </a>
                        {deal.shipment_deals && deal.shipment_deals.map((sd: any) => sd.shipments && (
                          <a key={sd.shipments.id} href={`/dashboard/logistics/${sd.shipments.id}`} className="deal-number-link" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            📦 {sd.shipments.shipment_number}
                          </a>
                        ))}
                      </div>
                    </td>
                    <td>
                      {deal.items && deal.items.length > 1 ? (
                        <div className="mixed-lot-container">
                          <div className="deal-model">Mixed Lot</div>
                          <div className="deal-model-sub">{deal.items.length} items (Hover)</div>
                          <div className="mixed-lot-tooltip">
                            {deal.items.map((item, idx) => {
                              const modelStr = item.model.replace(/iPhone\s*/i, '').toUpperCase()
                              return (
                                <div key={item.id || idx} style={{ fontSize: '0.85rem', lineHeight: '1.2', fontWeight: 500, color: 'var(--text-primary)' }}>
                                  {modelStr} {item.storage} {item.grade} X {item.quantity} UNITS
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="deal-model">{deal.model}</div>
                          <div className="deal-model-sub">{[deal.storage, deal.grade, deal.carrier].filter(Boolean).join(' · ')}</div>
                        </>
                      )}
                    </td>
                    <td className="deal-qty">{deal.quantity} units</td>
                    <td className="deal-qty" style={{color: invoicedQty > 0 ? 'var(--accent-teal)' : 'inherit'}}>{invoicedQty} units</td>
                    <td className="deal-amount" style={{color: invoicedValue > 0 ? 'var(--accent-teal)' : 'inherit'}}>{fmt(invoicedValue)}</td>
                    <td className="deal-qty" style={{color: remainingQty === 0 ? 'var(--accent-teal)' : remainingQty < deal.quantity ? 'var(--accent-amber)' : 'inherit'}}>{remainingQty} units</td>
                    <td className="deal-amount">{fmt(deal.total_commitment)}</td>
                    <td className="deal-amount">
                      {dealShipmentCost > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ fontWeight: 600 }}>{fmt(dealShipmentCost)}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{fmtUnit(shipmentUnitCost)} / unit</div>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="deal-amount" style={{color: stuckCapital <= 0 ? 'var(--accent-green)' : 'var(--accent-amber)'}}>{fmt(stuckCapital)}</td>
                    {showFunding ? (
                      <td>
                        <span className={`funding-badge ${deal.funding_source === 'AMEX' ? 'badge-amex' : deal.funding_source === 'CASH_POOL' ? 'badge-cash' : 'badge-mixed'}`}>
                          {deal.funding_source === 'AMEX' ? '💳 Amex' : deal.funding_source === 'CASH_POOL' ? '💵 Cash' : '⚡ Mixed'}
                        </span>
                      </td>
                    ) : (
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>$</td>
                    )}
                    {showStatus ? (
                      <td>
                        <span className={`status-badge ${st.color}`}>{st.label}</span>
                      </td>
                    ) : (
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>—</td>
                    )}
                    {showDates ? (
                      <>
                        <td className="deal-date">{fmtDate(deal.auction_won_date)}</td>
                        <td className="deal-date">{deal.payment_date ? fmtDate(deal.payment_date) : '—'}</td>
                        <td className="deal-date">{deal.arrived_miami_date ? fmtDate(deal.arrived_miami_date) : '—'}</td>
                      </>
                    ) : (
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>—</td>
                    )}
                    <td className={`deal-profit ${liveGrossProfit > 0 ? 'profit-pos' : liveGrossProfit < 0 ? 'profit-neg' : 'profit-zero'}`}>
                      {liveGrossProfit !== 0 ? fmt(liveGrossProfit) : '—'}
                    </td>
                    <td>
                      {role !== 'FINANCE' && (
                        <button
                          id={`edit-deal-${deal.id}`}
                          className="btn-edit"
                          onClick={() => setEditDeal(deal)}
                          title="Edit deal"
                        >
                          ✏️ Edit
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--bg-elevated)', fontWeight: 600, borderTop: '2px solid var(--border)' }}>
                <td colSpan={3} style={{ textAlign: 'right', paddingRight: '16px', color: 'var(--text-primary)' }}>TOTALS</td>
                <td className="deal-qty" style={{color: 'var(--text-primary)'}}>{tQty} units</td>
                <td className="deal-qty" style={{color: 'var(--text-primary)'}}>{tInvQty} units</td>
                <td className="deal-amount" style={{color: 'var(--text-primary)'}}>{fmt(tInvVal)}</td>
                <td className="deal-qty" style={{color: 'var(--text-primary)'}}>{tRem} units</td>
                <td className="deal-amount" style={{color: 'var(--text-primary)'}}>{fmt(tCommitted)}</td>
                <td className="deal-amount" style={{color: 'var(--text-primary)'}}>{fmt(tShipCost)}</td>
                <td className="deal-amount" style={{color: tStuck <= 0 ? 'var(--accent-green)' : 'var(--accent-amber)'}}>{fmt(tStuck)}</td>
                {showFunding ? <td></td> : <td></td>}
                {showStatus ? <td></td> : <td></td>}
                {showDates ? <td colSpan={3}></td> : <td></td>}
                <td className={`deal-profit ${tProfit > 0 ? 'profit-pos' : tProfit < 0 ? 'profit-neg' : 'profit-zero'}`}>{fmt(tProfit)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {selectedDealIds.length > 0 && (
        <div style={{position:'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)', background:'var(--bg-card)', border:'1px solid var(--border)', padding:'12px 24px', borderRadius:'100px', display:'flex', alignItems:'center', gap:'16px', boxShadow:'0 10px 30px rgba(0,0,0,0.5)', zIndex:100}}>
          <span style={{fontWeight:500}}>{selectedDealIds.length} deals selected</span>
          <button className="btn-primary" onClick={() => setShowBulkAdvance(true)}>Change Status</button>
          <button className="btn-ghost" onClick={()=>setSelectedDealIds([])}>Cancel</button>
        </div>
      )}

      {showBulkAdvance && (
        <div className="modal-overlay" onClick={(e:any)=>{if(e.target===e.currentTarget)setShowBulkAdvance(false)}}>
          <div className="modal-box" style={{maxWidth:'400px'}}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Bulk Change Status</h2>
                <div className="modal-sub">Update multiple deals at once</div>
              </div>
              <button className="modal-close" onClick={()=>setShowBulkAdvance(false)}>×</button>
            </div>
            <div className="modal-form">
              <div className="form-group">
                <label className="form-label">New Status</label>
                <select className="form-input" value={bulkStatus} onChange={e=>setBulkStatus(e.target.value)}>
                   <option value="">Select status...</option>
                   {Object.entries(DEAL_STATUSES).map(([key, val]) => (
                     <option key={key} value={key}>{val.label}</option>
                   ))}
                </select>
              </div>
              {(bulkStatus === 'PAID' || bulkStatus === 'PAYMENT_REQUIRED' || bulkStatus === 'AT_SB_TECHNOLOGY' || bulkStatus === 'AT_TURBO_LOGISTICS' || bulkStatus === 'RECEIVED_BY_MOBITECH') && (
                 <div className="form-group">
                    <label className="form-label">
                      {bulkStatus === 'AT_SB_TECHNOLOGY' || bulkStatus === 'AT_TURBO_LOGISTICS' || bulkStatus === 'RECEIVED_BY_MOBITECH' ? 'Arrival Date' : 'Date'}
                    </label>
                    <input type="date" className="form-input" value={bulkDate} onChange={e=>setBulkDate(e.target.value)} />
                 </div>
              )}
              {bulkStatus === 'PAYMENT_REQUIRED' && (
                 <div className="form-group">
                    <label className="form-label">Invoice Number (optional)</label>
                    <input type="text" className="form-input" value={bulkInvoice} onChange={e=>setBulkInvoice(e.target.value)} placeholder="e.g. INV-1234" />
                 </div>
              )}
              {bulkError && <div className="login-error">&#9888; {bulkError}</div>}
              <div className="modal-actions">
                 <button className="btn-ghost" onClick={()=>setShowBulkAdvance(false)}>Cancel</button>
                 <button className="btn-primary" onClick={handleBulkSubmit} disabled={!bulkStatus || isPending}>{isPending ? 'Updating...' : 'Update Deals'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showModal && <NewDealModal onClose={() => setShowModal(false)} />}
      {editDeal  && <EditDealModal deal={editDeal} onClose={() => setEditDeal(null)} />}
    </div>
  )
}

export default function DealsClient({ deals, settings }: Props) {
  return (
    <Suspense fallback={<div style={{ padding: '40px' }}>Loading deals...</div>}>
      <DealsClientInner deals={deals} settings={settings} />
    </Suspense>
  )
}

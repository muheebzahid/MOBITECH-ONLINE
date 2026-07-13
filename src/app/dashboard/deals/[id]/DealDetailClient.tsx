'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { DEAL_STATUSES, type DealStatus, SUPPLIERS, PLATFORMS } from '@/lib/deals/constants'
import { updateDealStatus } from '@/lib/deals/actions'
import { addInventoryBulk } from '@/lib/inventory/actions'
import { useRole } from '@/components/RoleProvider'
import EditDealModal from '../EditDealModal'

const STATUS_ORDER: DealStatus[] = [
  'AUCTION_WON','AWAITING_PAYMENT_LINK','PAYMENT_REQUIRED','PAID',
  'READY_FOR_PICKUP','IN_TRANSIT_USA','AT_SB_TECHNOLOGY','IN_TRANSIT_DUBAI',
  'AT_TURBO_LOGISTICS','RECEIVED_BY_MOBITECH','PARTIALLY_SOLD','SOLD','DEAL_CLOSED',
]

function fmt(n: number) { return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits: 3, maximumFractionDigits: 3}).format(n||0) }
function fmtS(n: number) { return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n||0) }
function fmtDate(d: string|null|undefined) { if(!d) return '-'; return new Date(d).toLocaleDateString('en-AE',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) }
function fmtD(d: string|null|undefined) { if(!d) return '-'; return new Date(d).toLocaleDateString('en-AE',{day:'2-digit',month:'short',year:'numeric'}) }
function daysSince(d: string) { return Math.floor((Date.now()-new Date(d).getTime())/86400000) }

const st = (status: string) => DEAL_STATUSES[status as DealStatus]

interface Props { deal: any }

export default function DealDetailClient({ deal }: Props) {
  const router = useRouter()
  const [isPending,startTransition] = useTransition()
  const [showEdit,setShowEdit] = useState(false)
  const [showAdvance,setShowAdvance] = useState(false)
  const [advanceNote,setAdvanceNote] = useState('')
  const [advanceDate, setAdvanceDate] = useState(() => new Date().toISOString().split('T')[0])
  const [error,setError] = useState('')
  
  // Inventory State
  const [showInventoryModal, setShowInventoryModal] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError('')
    
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result
        const wb = XLSX.read(bstr, { type: 'binary' })
        const wsname = wb.SheetNames[0]
        const ws = wb.Sheets[wsname]
        const data = XLSX.utils.sheet_to_json(ws) as any[]
        
        if (data.length === 0) {
          setUploadError('File is empty.')
          return
        }

        startTransition(async () => {
          // Map excel data to our items schema. 
          // Assuming excel has headers like 'IMEI' or 'Serial Number'
          const items = data.map(row => ({
            imei: row['IMEI'] || row['imei'] || row['Imei'] || '',
            serial_number: row['Serial Number'] || row['serial_number'] || row['Serial'] || '',
            model: row['Model'] || row['model'] || '',
            storage: row['Storage'] || row['storage'] || '',
            color: row['Color'] || row['color'] || '',
            grade: row['Grade'] || row['grade'] || '',
          }))
          
          const result = await addInventoryBulk(deal.id, items)
          if (result.error) {
            setUploadError(result.error)
          } else {
            setShowInventoryModal(false)
          }
        })
      } catch (err: any) {
        setUploadError('Error parsing Excel file. Please ensure it is a valid .xlsx or .csv')
      }
    }
    reader.readAsBinaryString(file)
  }

  const role = useRole()
  const currentStep = STATUS_ORDER.indexOf(deal.status as DealStatus)
  const defaultNextStatus  = currentStep < STATUS_ORDER.length-1 ? STATUS_ORDER[currentStep+1] : null
  const [targetStatus, setTargetStatus] = useState<DealStatus | null>(null)
  
  const isClosed    = deal.status === 'DEAL_CLOSED'
  const hasPaid     = !!deal.payment_date
  const days        = hasPaid ? daysSince(deal.payment_date) : 0
  const overdue     = !isClosed && hasPaid && days >= 30

  const statusHistory = [...(deal.deal_status_history||[])].sort((a:any,b:any)=>new Date(b.changed_at).getTime()-new Date(a.changed_at).getTime())
  const editHistory   = [...(deal.deal_edit_history||[])].sort((a:any,b:any)=>new Date(b.edited_at).getTime()-new Date(a.edited_at).getTime())

  const siblingDeals = deal.shipment_deals?.[0]?.shipments?.shipment_deals?.map((sd: any) => sd.deals).filter((d: any) => d && d.id !== deal.id) || []
  const [selectedSiblingIds, setSelectedSiblingIds] = useState<string[]>([])
  const [attInvoiceNumber, setAttInvoiceNumber] = useState('')

  const handleAdvance = () => {
    if(!targetStatus) return
    setError('')
    startTransition(async () => {
      const result = await updateDealStatus(deal.id, targetStatus, advanceNote||undefined, advanceDate, selectedSiblingIds, attInvoiceNumber)
      if(result.error) { setError(result.error) }
      else { setShowAdvance(false); setAdvanceNote(''); setAttInvoiceNumber(''); setTargetStatus(null); setSelectedSiblingIds([]); router.refresh() }
    })
  }

  const st = (s: string) => DEAL_STATUSES[s as DealStatus]

  const fundingIcon = deal.funding_source === 'AMEX' ? 'AMEX' : deal.funding_source === 'CASH_POOL' ? 'CASH' : 'MIXED'
  const fundingLabel = deal.funding_source === 'AMEX'
    ? `${fmtS(deal.amex_amount)} on card`
    : deal.funding_source === 'CASH_POOL'
    ? `${fmtS(deal.cash_amount)} from pool`
    : `Amex ${fmtS(deal.amex_amount)} / Cash ${fmtS(deal.cash_amount)}`

  const shipment = deal.shipment_deals?.[0]?.shipments

  return (
    <div className="page-root">

      {/* Header */}
      <div className="deal-detail-header">
        <div className="dh-left">
          <a href="/dashboard/deals" className="dh-back">Back to Deals</a>
          <div className="dh-title-row">
            <h1 className="dh-title">{deal.deal_number}</h1>
            <span className={`status-badge ${st(deal.status)?.color||''}`}>{st(deal.status)?.label}</span>
            {overdue && <span className="overdue-badge">{days}d overdue</span>}
          </div>
          <p className="dh-sub">{deal.model} &middot; {[deal.storage,deal.grade,deal.carrier,deal.color].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="dh-actions">
          <button className="btn-ghost" onClick={()=>setShowEdit(true)}>Edit Deal</button>
          {defaultNextStatus && !isClosed && (
            <button className="btn-advance" onClick={()=>{ setTargetStatus(defaultNextStatus); setShowAdvance(true); }}>
              Advance &rarr; {st(defaultNextStatus)?.label}
            </button>
          )}
        </div>
      </div>

      {/* Pipeline */}
      <div className="pipeline-wrap">
        <div className="pipeline-scroll">
          {STATUS_ORDER.map((status,idx) => {
            const isDone=idx<currentStep, isCur=idx===currentStep
            const meta=st(status)
            const canClick = role === 'SUPER_ADMIN' && status !== deal.status
            return (
              <div 
                key={status} 
                className={`pipeline-step ${isDone?'step-done':isCur?'step-current':'step-future'} ${canClick ? 'step-clickable' : ''}`}
                onClick={() => {
                  if (canClick) {
                    setTargetStatus(status)
                    setShowAdvance(true)
                  }
                }}
                style={{ cursor: canClick ? 'pointer' : 'default' }}
              >
                <div className="step-circle">{isDone?'✓':<span className="step-num">{idx+1}</span>}</div>
                <div className="step-label">{meta?.label}</div>
                {(() => {
                  const hardcoded: Partial<Record<DealStatus, string>> = {
                    'AUCTION_WON': deal.auction_won_date,
                    'PAYMENT_REQUIRED': deal.payment_link_date,
                    'PAID': deal.payment_date,
                    'READY_FOR_PICKUP': deal.pickup_ready_date,
                    'IN_TRANSIT_USA': deal.shipped_usa_date,
                    'AT_SB_TECHNOLOGY': deal.arrived_miami_date,
                    'IN_TRANSIT_DUBAI': deal.shipped_dubai_date,
                    'RECEIVED_BY_MOBITECH': deal.received_mobitech_date,
                    'DEAL_CLOSED': deal.deal_closed_date,
                  }
                  const shipmentDates: Partial<Record<DealStatus, string>> = shipment ? {
                    'AT_SB_TECHNOLOGY': shipment.pickup_date,
                    'IN_TRANSIT_DUBAI': shipment.shipped_usa_date,
                    'AT_TURBO_LOGISTICS': shipment.turbo_received_date || shipment.arrived_dubai_date,
                    'RECEIVED_BY_MOBITECH': shipment.delivered_mobitech_date,
                  } : {}

                  let sDate = shipmentDates[status] || hardcoded[status]
                  if (!sDate) {
                    const h = statusHistory.find((x: any) => x.new_status === status)
                    if (h) sDate = h.changed_at
                  }
                  if (sDate) {
                    return <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{fmtD(sDate)}</div>
                  }
                  return null
                })()}
                {idx<STATUS_ORDER.length-1 && <div className={`step-connector ${isDone?'connector-done':'connector-future'}`}/>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Financial Cards */}
      <div className="deal-fin-grid">
        <div className="fin-card">
          <span className="fin-label">Winning Bid</span>
          <span className="fin-value">{fmt(deal.unit_cost)} <span className="fin-per">/ unit</span></span>
          <span className="fin-sub">{deal.quantity} units total</span>
        </div>
        <div className="fin-card">
          <span className="fin-label">Bid Total</span>
          <span className="fin-value">{fmtS(deal.total_cost)}</span>
          <span className="fin-sub">Before fees</span>
        </div>
        <div className="fin-card fin-card-amber">
          <span className="fin-label">Auction Fee</span>
          <span className="fin-value fin-amber">{fmt(deal.auction_fee)}</span>
          <span className="fin-sub">{deal.total_cost>0?((deal.auction_fee/deal.total_cost)*100).toFixed(1):0}% of bid</span>
        </div>
        <div className="fin-card fin-card-highlight">
          <span className="fin-label">Total Commitment</span>
          <span className="fin-value fin-white">{fmtS(deal.total_commitment)}</span>
          <span className="fin-sub">Bid + all fees</span>
        </div>
        <div className="fin-card fin-card-blue">
          <span className="fin-label">Funding Source</span>
          <span className="fin-value fin-blue">{fundingIcon}</span>
          <span className="fin-sub">{fundingLabel}</span>
        </div>
        <div className={`fin-card ${deal.cashback_eligible?'fin-card-green':''}`}>
          <span className="fin-label">Amex Cashback (2%)</span>
          <span className={`fin-value ${deal.cashback_eligible?'fin-green':'fin-muted'}`}>
            {deal.cashback_eligible ? `+ ${fmt(deal.total_commitment*0.02)}` : 'Not eligible'}
          </span>
          <span className="fin-sub">{deal.amex_statement_date?`Statement: ${fmtD(deal.amex_statement_date)}`:'No statement date'}</span>
        </div>
      </div>

      {/* Body Grid */}
      <div className="deal-body-grid">

        {/* Left: Deal Info */}
        <div className="deal-info-panel">
          <div className="panel-title">Deal Information</div>

          <div className="info-group">
            <div className="info-section-label">Product</div>
            <div className="info-row"><span>Model</span><strong>{deal.model}</strong></div>
            <div className="info-row"><span>Storage</span><strong>{deal.storage||'-'}</strong></div>
            <div className="info-row"><span>Grade</span><strong>{deal.grade||'-'}</strong></div>
            <div className="info-row"><span>Carrier</span><strong>{deal.carrier||'-'}</strong></div>
            <div className="info-row"><span>Color</span><strong>{deal.color||'-'}</strong></div>
            <div className="info-row"><span>Quantity</span><strong>{deal.quantity} units</strong></div>
          </div>

          <div className="info-group">
            <div className="info-section-label">Supplier</div>
            <div className="info-row"><span>Supplier</span><strong>{SUPPLIERS.find((s:any)=>s.value===deal.supplier)?.label||deal.supplier}</strong></div>
            <div className="info-row"><span>Platform</span><strong>{PLATFORMS.find((p:any)=>p.value===deal.auction_platform)?.label||deal.auction_platform}</strong></div>
          </div>

          <div className="info-group">
            <div className="info-section-label">Key Dates</div>
            <div className="info-row"><span>Auction Won</span><strong>{fmtD(deal.auction_won_date)}</strong></div>
            <div className="info-row"><span>Payment Date</span><strong>{fmtD(deal.payment_date)}</strong></div>
            <div className="info-row"><span>Shipped USA</span><strong>{fmtD(shipment?.shipped_usa_date || deal.shipped_usa_date)}</strong></div>
            <div className="info-row"><span>Arrived Dubai</span><strong>{fmtD(shipment?.arrived_dubai_date || deal.arrived_dubai_date)}</strong></div>
            <div className="info-row"><span>Received (Mobitech)</span><strong>{fmtD(shipment?.delivered_mobitech_date || deal.received_mobitech_date)}</strong></div>
            <div className="info-row"><span>Deal Closed</span><strong>{fmtD(deal.deal_closed_date)}</strong></div>
          </div>

          {deal.notes && (
            <div className="info-group">
              <div className="info-section-label">Notes</div>
              <p className="info-notes">{deal.notes}</p>
            </div>
          )}

          <div className="info-group">
            <div className="info-section-label">Profit (Deal Level)</div>
            <div className="info-row"><span>Total Revenue</span><strong className="fin-green">{fmtS(deal.total_revenue)}</strong></div>
            <div className="info-row"><span>COGS</span><strong>{fmtS(deal.total_cogs)}</strong></div>
            <div className="info-row">
              <span>Gross Profit</span>
              <strong className={deal.gross_profit>0?'fin-green':deal.gross_profit<0?'fin-red':''}>
                {fmtS(deal.gross_profit)}
              </strong>
            </div>
          </div>
        </div>

        {/* Left Bottom: Inventory */}
        <div className="deal-info-panel" style={{ marginTop: '24px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
            <div className="panel-title" style={{marginBottom:0}}>Inventory Units</div>
            <button className="btn-ghost" style={{fontSize:'12px', color:'var(--accent-indigo)'}} onClick={()=>setShowInventoryModal(true)}>
              + Receive via Excel
            </button>
          </div>
          
          {deal.items && deal.items.length > 0 && (
            <div className="deals-table-wrap" style={{ marginBottom: '24px' }}>
              <div className="panel-title" style={{ padding: '0 16px 12px 16px', margin: 0 }}>Deal SKUs</div>
              <table className="deals-table" style={{border:'none', marginTop: 0}}>
                <thead style={{borderBottom:'1px solid var(--border-subtle)'}}>
                  <tr>
                    <th style={{paddingLeft:16}}>Model</th>
                    <th>Storage</th>
                    <th>Grade</th>
                    <th style={{textAlign:'right'}}>Target Price</th>
                    <th style={{textAlign:'right'}}>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {deal.items.map((item: any) => {
                    const paidQty = (deal.invoice_line_items || [])
                      .filter((li: any) => li.deal_item_id === item.id && li.invoices?.status === 'PAID')
                      .reduce((sum: number, li: any) => sum + (li.quantity || 0), 0)
                    const availQty = Math.max(0, (item.quantity || 0) - paidQty)

                    return (
                      <tr key={item.id}>
                        <td style={{paddingLeft:16, fontWeight:600}}>{item.model}</td>
                        <td>{item.storage || '-'}</td>
                        <td>{item.grade || '-'}</td>
                        <td style={{textAlign:'right', fontWeight:600}}>{fmt(item.target_price)}</td>
                        <td style={{textAlign:'right'}}>{availQty}</td>
                      </tr>
                    )
                  })}
                  <tr>
                    <td colSpan={4} style={{paddingLeft:16, textAlign:'right', fontWeight:700, color:'var(--text-muted)', fontSize:'12px'}}>TOTAL QTY:</td>
                    <td style={{textAlign:'right', fontWeight:700, fontSize:'14px'}}>
                      {deal.items.reduce((total: number, item: any) => {
                        const paidQty = (deal.invoice_line_items || [])
                          .filter((li: any) => li.deal_item_id === item.id && li.invoices?.status === 'PAID')
                          .reduce((sum: number, li: any) => sum + (li.quantity || 0), 0)
                        return total + Math.max(0, (item.quantity || 0) - paidQty)
                      }, 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          
          <div className="panel-title" style={{ padding: '0 16px 12px 16px', margin: 0 }}>Scanned IMEIs</div>
          {(!deal.inventory_items || deal.inventory_items.length === 0) ? (
            <p className="history-empty">No inventory units logged.</p>
          ) : (
            <div className="deals-table-wrap">
              <table className="deals-table" style={{border:'none', marginTop: 0}}>
                <thead style={{borderBottom:'1px solid var(--border-subtle)'}}>
                  <tr>
                    <th style={{paddingLeft:16}}>IMEI/Serial</th>
                    <th>Model</th>
                    <th>Loc</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {deal.inventory_items.map((item: any) => (
                    <tr key={item.id}>
                      <td style={{paddingLeft:16, fontWeight:600}}>{item.imei || item.serial_number || '-'}</td>
                      <td>{item.model}</td>
                      <td><span style={{fontSize:'10px', color:'var(--text-muted)'}}>{item.location}</span></td>
                      <td><span style={{fontSize:'10px', color:'var(--text-muted)'}}>{item.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: Histories & Sales */}
        <div className="deal-history-panel">

          <div className="panel-title">Sales & Invoices</div>
          {(!deal.invoice_line_items || deal.invoice_line_items.length === 0) ? (
            <p className="history-empty">No invoices linked to this deal.</p>
          ) : (
            <div className="status-history-list" style={{ marginBottom: '24px' }}>
              {deal.invoice_line_items.map((line: any) => {
                const inv = line.invoices
                if (!inv) return null
                return (
                  <div key={line.id} style={{ border:'1px solid var(--border-subtle)', borderRadius:'var(--radius-sm)', padding:'12px', background:'var(--bg-elevated)', marginBottom: '8px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'4px' }}>
                      <a href={`/dashboard/sales/${inv.id}`} className="deal-number-link" style={{fontSize: '13px'}}>{inv.invoice_number}</a>
                      <span style={{fontSize:'10px', fontWeight:700, color:'var(--text-muted)'}}>{inv.status}</span>
                    </div>
                    <div style={{ fontSize:'12px', color:'var(--text-secondary)' }}>
                      Sold <strong>{line.quantity} units</strong> @ {fmtS(line.unit_price)}
                    </div>
                    <div style={{ fontSize:'11px', color:'var(--text-muted)', marginTop:'4px' }}>
                      Invoice Total: {fmtS(inv.total_amount)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="panel-title">Status History</div>
          {statusHistory.length===0 ? (
            <p className="history-empty">No status changes yet.</p>
          ) : (
            <div className="status-history-list">
              {statusHistory.map((h:any)=>(
                <div key={h.id} className="sh-item">
                  <div className="sh-dot"/>
                  <div className="sh-body">
                    <div className="sh-top">
                      {h.old_status && (
                        <>
                          <span className={`status-badge ${st(h.old_status)?.color||''}`} style={{fontSize:'10px'}}>
                            {st(h.old_status)?.label}
                          </span>
                          <span className="sh-arrow">&rarr;</span>
                        </>
                      )}
                      <span className={`status-badge ${st(h.new_status)?.color||''}`} style={{fontSize:'10px'}}>
                        {st(h.new_status)?.label}
                      </span>
                    </div>
                    {h.notes && <p className="sh-note">&ldquo;{h.notes}&rdquo;</p>}
                    <span className="sh-when">{fmtDate(h.changed_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="panel-title" style={{marginTop:'24px'}}>Edit History</div>
          {editHistory.length===0 ? (
            <p className="history-empty">No edits made yet.</p>
          ) : (
            <div className="edit-history">
              {editHistory.map((e:any)=>(
                <div key={e.id} className="edit-history-item">
                  <div className="edit-history-header">
                    <span className="edit-history-who">Edited</span>
                    <span className="edit-history-when">{fmtDate(e.edited_at)}</span>
                  </div>
                  {e.edit_note && <p className="edit-history-reason">&ldquo;{e.edit_note}&rdquo;</p>}
                  <div className="edit-field-changes">
                    {(e.field_changes as any[]).map((fc:any,i:number)=>(
                      <div key={i} className="edit-field-change">
                        <span className="efc-label">{fc.label}</span>
                        <span className="efc-old">{fc.old_value||'-'}</span>
                        <span className="efc-arrow">&rarr;</span>
                        <span className="efc-new">{fc.new_value||'-'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Advance Status Modal */}
      {showAdvance && targetStatus && (
        <div className="modal-overlay" onClick={(e:any)=>{if(e.target===e.currentTarget)setShowAdvance(false)}}>
          <div className="modal-box" style={{maxWidth:'480px'}}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Advance Deal Status</h2>
                <p className="modal-sub">{deal.deal_number}</p>
              </div>
              <button className="modal-close" onClick={()=>setShowAdvance(false)}>&#x2715;</button>
            </div>
            <div className="modal-form">
              <div className="advance-status-preview">
                <div className="asp-from">
                  <span className="asp-label">Current</span>
                  <span className={`status-badge ${st(deal.status)?.color||''}`}>{st(deal.status)?.label}</span>
                </div>
                <span className="asp-arrow">&rarr;</span>
                <div className="asp-to">
                  <span className="asp-label">New Status</span>
                  <span className={`status-badge ${st(targetStatus)?.color||''}`}>{st(targetStatus)?.label}</span>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Note <span className="form-hint-inline">(optional — saved to history)</span></label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Payment confirmed by SB team"
                  value={advanceNote}
                  onChange={(e:any)=>setAdvanceNote(e.target.value)}
                  onKeyDown={(e:any)=>{if(e.key==='Enter')handleAdvance()}}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">Date *</label>
                <input
                  type="date"
                  className="form-input"
                  value={advanceDate}
                  onChange={(e:any) => setAdvanceDate(e.target.value)}
                  required
                />
                <div style={{fontSize:'11px', color:'var(--text-muted)', marginTop:'6px'}}>
                  Accurate dates are important to track timeline metrics.
                </div>
              </div>
              {targetStatus === 'PAYMENT_REQUIRED' && deal.supplier === 'ATT' && (
                <div className="form-group" style={{marginTop: '12px'}}>
                  <label className="form-label">AT&T Invoice Number (optional)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. ATT-INV-9999"
                    value={attInvoiceNumber}
                    onChange={(e:any) => setAttInvoiceNumber(e.target.value)}
                  />
                </div>
              )}
              {targetStatus === 'PAYMENT_REQUIRED' && deal.supplier !== 'ATT' && (
                <div className="form-group" style={{marginTop: '12px'}}>
                  <label className="form-label">Invoice Number (optional)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. INV-9999"
                    value={attInvoiceNumber}
                    onChange={(e:any) => setAttInvoiceNumber(e.target.value)}
                  />
                </div>
              )}
              {['READY_FOR_PICKUP', 'IN_TRANSIT_USA', 'AT_SB_TECHNOLOGY', 'IN_TRANSIT_DUBAI', 'AT_TURBO_LOGISTICS', 'RECEIVED_BY_MOBITECH'].includes(targetStatus || '') && siblingDeals.length > 0 && (
                <div className="form-group" style={{marginTop:'16px'}}>
                  <label className="form-label" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span>Update other deals in shipment</span>
                    <button className="btn-ghost" style={{padding:'2px 8px',fontSize:'11px'}} onClick={(e)=>{
                      e.preventDefault()
                      if(selectedSiblingIds.length === siblingDeals.length) setSelectedSiblingIds([])
                      else setSelectedSiblingIds(siblingDeals.map((d:any)=>d.id))
                    }}>
                      {selectedSiblingIds.length === siblingDeals.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </label>
                  <div style={{border:'1px solid var(--border)', borderRadius:'var(--radius)', maxHeight:'120px', overflowY:'auto', padding:'8px', background:'var(--bg)'}}>
                    {siblingDeals.map((sd:any) => (
                      <label key={sd.id} style={{display:'flex', alignItems:'center', gap:'8px', padding:'4px 0', fontSize:'13px', cursor:'pointer'}}>
                        <input type="checkbox" 
                          checked={selectedSiblingIds.includes(sd.id)}
                          onChange={(e) => {
                            if(e.target.checked) setSelectedSiblingIds([...selectedSiblingIds, sd.id])
                            else setSelectedSiblingIds(selectedSiblingIds.filter(id => id !== sd.id))
                          }}
                        />
                        <span style={{fontWeight:500}}>{sd.deal_number}</span>
                        <span style={{color:'var(--text-muted)'}}>• Current: {st(sd.status)?.label}</span>
                      </label>
                    ))}
                  </div>
                  <div style={{fontSize:'11px', color:'var(--text-muted)', marginTop:'6px'}}>
                    Selected deals will also be advanced to {st(targetStatus!)?.label}.
                  </div>
                </div>
              )}
              {error && <div className="login-error">&#9888; {error}</div>}
              <div className="modal-actions">
                <button className="btn-ghost" onClick={()=>setShowAdvance(false)}>Cancel</button>
                <button className="btn-advance" disabled={isPending} onClick={handleAdvance} id="confirm-advance-btn">
                  {isPending ? 'Updating...' : `Confirm: ${st(targetStatus)?.label}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEdit && <EditDealModal deal={deal} onClose={()=>{setShowEdit(false);router.refresh()}}/>}

      {/* Inventory Upload Modal */}
      {showInventoryModal && (
        <div className="modal-overlay" onClick={(e:any)=>{if(e.target===e.currentTarget)setShowInventoryModal(false)}}>
          <div className="modal-box" style={{maxWidth:'500px'}}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Receive Inventory</h2>
                <p className="modal-sub">Upload an Excel (.xlsx) or CSV file with IMEIs</p>
              </div>
              <button className="modal-close" onClick={()=>setShowInventoryModal(false)}>&#x2715;</button>
            </div>
            <div className="modal-form">
              <div className="form-group">
                <label className="form-label">Upload File</label>
                <div style={{ border: '2px dashed var(--border)', borderRadius: 'var(--radius)', padding: '32px', textAlign: 'center', background: 'var(--bg-elevated)', cursor: 'pointer' }} onClick={() => fileInputRef.current?.click()}>
                  <p style={{ margin: 0, fontWeight: 600 }}>Click to select a file</p>
                  <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>Requires a column named "IMEI" or "Serial Number"</p>
                </div>
                <input 
                  type="file" 
                  accept=".xlsx,.xls,.csv" 
                  ref={fileInputRef} 
                  style={{ display: 'none' }} 
                  onChange={handleFileUpload} 
                />
              </div>
              {uploadError && <div className="login-error">&#9888; {uploadError}</div>}
              {isPending && <div style={{textAlign:'center', marginTop:'16px', fontSize:'13px', color:'var(--accent-indigo)', fontWeight:600}}>Processing file...</div>}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

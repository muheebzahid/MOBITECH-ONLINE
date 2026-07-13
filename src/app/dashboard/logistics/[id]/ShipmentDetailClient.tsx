'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SHIPMENT_STATUSES, SHIPMENT_STATUS_ORDER, CARRIERS, type ShipmentStatus } from '@/lib/logistics/constants'
import { updateShipmentStatus, updateShipment, addDealToShipment, removeDealFromShipment, deleteShipment } from '@/lib/logistics/actions'
import { useRole } from '@/components/RoleProvider'

function fmtS(n: number) { return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n||0) }
function fmt(n: number) { return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits: 3, maximumFractionDigits: 3}).format(n||0) }
function fmtD(d: string|null|undefined) { if(!d) return '-'; return new Date(d).toLocaleDateString('en-AE',{day:'2-digit',month:'short',year:'numeric'}) }

const LEGS = [
  { key: 'PENDING',              icon: '1', label: 'Created',           date_field: 'created_at' },
  { key: 'AT_SB_TECHNOLOGY',     icon: '2', label: 'At SB Technology',  date_field: 'pickup_date' },
  { key: 'SHIPPED_FROM_USA',     icon: '3', label: 'Shipped from USA',  date_field: 'shipped_usa_date' },
  { key: 'IN_TRANSIT',           icon: '4', label: 'In Transit',        date_field: null },
  { key: 'ARRIVED_DUBAI',        icon: '5', label: 'Arrived Dubai',     date_field: 'arrived_dubai_date' },
  { key: 'CUSTOMS_CLEARED',      icon: '6', label: 'Customs Cleared',   date_field: 'customs_cleared_date' },
  { key: 'AT_TURBO_LOGISTICS',   icon: '7', label: 'At Turbo Logistics',date_field: 'turbo_received_date' },
  { key: 'DELIVERED_TO_MOBITECH',icon: '8', label: 'Delivered',         date_field: 'delivered_mobitech_date' },
]

interface Props { shipment: any; unshippedDeals: any[] }

export default function ShipmentDetailClient({ shipment, unshippedDeals }: Props) {
  const router = useRouter()
  const role = useRole()
  const [isPending, startTransition] = useTransition()
  const [showAdvance, setShowAdvance] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [advanceNote, setAdvanceNote] = useState('')
  const [advanceDate, setAdvanceDate] = useState(() => new Date().toISOString().split('T')[0])
  const [editForm, setEditForm] = useState({
    carrier: shipment.carrier||'',
    awb_number: shipment.awb_number||'',
    sb_invoice_number: shipment.sb_invoice_number||'',
    sb_fee: shipment.sb_fee||'',
    usa_to_usa_cost: shipment.usa_to_usa_cost||'',
    usa_to_dxb_cost: shipment.usa_to_dxb_cost||'',
    duty_amount: shipment.duty_amount||'',
    turbo_fee: shipment.turbo_fee||'',
    turbo_invoice_number: shipment.turbo_invoice_number||'',
    pickup_date: shipment.pickup_date||'',
    pickup_ref: shipment.pickup_ref||'',
    shipped_usa_date: shipment.shipped_usa_date||'',
    arrived_dubai_date: shipment.arrived_dubai_date||'',
    customs_ref: shipment.customs_ref||'',
    customs_cleared_date: shipment.customs_cleared_date||'',
    turbo_received_date: shipment.turbo_received_date||'',
    delivered_mobitech_date: shipment.delivered_mobitech_date||'',
    condition_notes: shipment.condition_notes||'',
    notes: shipment.notes||'',
  })
  const [error, setError] = useState('')

  const currentStep = SHIPMENT_STATUS_ORDER.indexOf(shipment.status)
  const nextStatus  = currentStep < SHIPMENT_STATUS_ORDER.length - 1 ? SHIPMENT_STATUS_ORDER[currentStep + 1] : null
  const st = (s: string) => SHIPMENT_STATUSES[s as ShipmentStatus]
  const deals = (shipment.shipment_deals || []).map((sd: any) => sd.deals).filter(Boolean)

  const handleAdvance = () => {
    if (!nextStatus) return
    setError('')
    startTransition(async () => {
      const dateField = LEGS.find(l => l.key === nextStatus)?.date_field
      const extraFields = dateField && advanceDate ? { [dateField]: advanceDate } : {}
      const result = await updateShipmentStatus(shipment.id, nextStatus, extraFields)
      if (result.error) { setError(result.error); return }
      setShowAdvance(false)
      router.refresh()
    })
  }

  const handleJumpToStatus = (status: ShipmentStatus) => {
    if (status === shipment.status) return
    setError('')
    startTransition(async () => {
      const result = await updateShipmentStatus(shipment.id, status)
      if (result.error) { setError(result.error); return }
      router.refresh()
    })
  }

  const handleEdit = () => {
    setError('')
    startTransition(async () => {
      const fd = new FormData()
      Object.entries(editForm).forEach(([k,v]) => fd.append(k, String(v)))
      const result = await updateShipment(shipment.id, fd)
      if (result.error) { setError(result.error); return }
      setShowEdit(false)
      router.refresh()
    })
  }

  const [showManageDeals, setShowManageDeals] = useState(false)
  const [dealManageError, setDealManageError] = useState('')

  const handleAddDeal = (dealId: string) => {
    setDealManageError('')
    startTransition(async () => {
      const result = await addDealToShipment(shipment.id, dealId)
      if (result.error) setDealManageError(result.error)
      else router.refresh()
    })
  }

  const handleRemoveDeal = (dealId: string) => {
    setDealManageError('')
    startTransition(async () => {
      const result = await removeDealFromShipment(shipment.id, dealId)
      if (result.error) setDealManageError(result.error)
      else router.refresh()
    })
  }

  const handleDelete = () => {
    if (!window.confirm('Are you sure you want to delete this shipment? This will not delete the associated deals, but they will be removed from this shipment. This action cannot be undone.')) return
    
    startTransition(async () => {
      const result = await deleteShipment(shipment.id)
      if (result.error) { setError(result.error); return }
      router.push('/dashboard/logistics')
    })
  }

  return (
    <div className="page-root">

      {/* Header */}
      <div className="deal-detail-header">
        <div className="dh-left">
          <a href="/dashboard/logistics" className="dh-back">Back to Logistics</a>
          <div className="dh-title-row">
            <h1 className="dh-title">{shipment.shipment_number}</h1>
            <span className={`status-badge ${st(shipment.status)?.color||''}`}>{st(shipment.status)?.label}</span>
          </div>
          <p className="dh-sub">{deals.length} deal{deals.length !== 1 ? 's' : ''} &middot; {shipment.carrier||'No carrier set'} {shipment.awb_number ? '&middot; AWB: '+shipment.awb_number : ''}</p>
        </div>
        <div className="dh-actions">
          {role === 'SUPER_ADMIN' && (
            <button className="btn-ghost" style={{ color: 'var(--accent-red)', border: '1px solid var(--accent-red)' }} onClick={handleDelete} disabled={isPending}>
              🗑 Delete
            </button>
          )}
          <button className="btn-ghost" onClick={() => setShowEdit(true)}>Edit Details</button>
          {nextStatus && (
            <button className="btn-advance" onClick={() => setShowAdvance(true)}>
              Advance &rarr; {st(nextStatus)?.label}
            </button>
          )}
        </div>
      </div>

      {/* Journey Timeline */}
      <div className="shipment-journey">
        <div className="sj-title">Journey Timeline</div>
        <div className="sj-legs">
          {LEGS.map((leg, idx) => {
            const isCompleted = SHIPMENT_STATUS_ORDER.indexOf(shipment.status as ShipmentStatus) > idx
            const isCurrent   = shipment.status === leg.key
            const isFuture    = !isCompleted && !isCurrent
            const dateVal     = leg.date_field ? shipment[leg.date_field] : null

            return (
              <div key={leg.key} className={`sj-leg ${isCompleted ? 'leg-done' : isCurrent ? 'leg-current' : 'leg-future'}`}>
                <div className="sj-leg-left">
                  <div className="sj-icon" style={{ cursor: isPending ? 'wait' : 'pointer' }} onClick={() => !isPending && handleJumpToStatus(leg.key as ShipmentStatus)}>
                    {isCompleted ? String.fromCharCode(10003) : leg.icon}
                  </div>
                  {idx < LEGS.length - 1 && <div className={`sj-line ${isCompleted ? 'sj-line-done' : 'sj-line-future'}`}/>}
                </div>
                <div className="sj-leg-body">
                  <div className="sj-leg-label">{leg.label}</div>
                  <div className="sj-leg-date">{dateVal ? fmtD(dateVal) : isCurrent ? 'In progress...' : isFuture ? 'Pending' : '-'}</div>
                  {isCurrent && leg.key === 'SHIPPED_FROM_USA' && shipment.awb_number && (
                    <div className="sj-leg-detail">AWB: <strong>{shipment.awb_number}</strong></div>
                  )}
                  {isCurrent && leg.key === 'AT_SB_TECHNOLOGY' && shipment.pickup_ref && (
                    <div className="sj-leg-detail">Ref: <strong>{shipment.pickup_ref}</strong></div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Cost Summary + Deals Grid */}
      <div className="shipment-body-grid">

        {/* Costs */}
        <div className="deal-info-panel">
          <div className="panel-title">Logistics Costs</div>
          <div className="info-group">
            <div className="info-row"><span>SB Technology Fee</span><strong>{fmt(shipment.sb_fee)}</strong></div>
            <div className="info-row"><span>USA to USA Freight</span><strong>{fmt(shipment.usa_to_usa_cost)}</strong></div>
            <div className="info-row"><span>USA to DXB Freight</span><strong>{fmt(shipment.usa_to_dxb_cost)}</strong></div>
            <div className="info-row"><span>Duty &amp; Customs</span><strong>{fmt(shipment.duty_amount)}</strong></div>
            <div className="info-row"><span>Turbo Logistics Fee</span><strong>{fmt(shipment.turbo_fee)}</strong></div>
            <div className="info-row" style={{borderTop:'1px solid var(--border)',paddingTop:'8px',marginTop:'4px'}}>
              <span><strong>Total</strong></span>
              <strong style={{color:'#f87171'}}>{fmtS(shipment.total_logistics_cost)}</strong>
            </div>
          </div>
          <div className="panel-title" style={{marginTop:'16px'}}>References</div>
          <div className="info-group">
            <div className="info-row"><span>SB Invoice</span><strong>{shipment.sb_invoice_number||'-'}</strong></div>
            <div className="info-row"><span>Carrier</span><strong>{shipment.carrier||'-'}</strong></div>
            <div className="info-row"><span>AWB Number</span><strong>{shipment.awb_number||'-'}</strong></div>
            <div className="info-row"><span>Customs Ref</span><strong>{shipment.customs_ref||'-'}</strong></div>
            <div className="info-row"><span>Turbo Invoice</span><strong>{shipment.turbo_invoice_number||'-'}</strong></div>
          </div>
          {shipment.condition_notes && (
            <>
              <div className="panel-title" style={{marginTop:'16px'}}>Condition Notes</div>
              <p className="info-notes">{shipment.condition_notes}</p>
            </>
          )}
          {shipment.notes && (
            <>
              <div className="panel-title" style={{marginTop:'16px'}}>Notes</div>
              <p className="info-notes">{shipment.notes}</p>
            </>
          )}
        </div>

        {/* Deals in this shipment */}
        <div className="deal-history-panel">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
            <div className="panel-title" style={{marginBottom:0}}>
              Deals in this Shipment ({deals.length})
              <span style={{fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.9rem', marginLeft: '8px'}}>
                &middot; {deals.reduce((sum: number, d: any) => sum + (d.quantity || 0), 0).toLocaleString()} Total Units
              </span>
            </div>
            <button className="btn-ghost" onClick={() => setShowManageDeals(true)} style={{padding:'4px 12px',fontSize:'0.85rem'}}>Manage</button>
          </div>
          {deals.length === 0 ? (
            <p className="history-empty">No deals linked to this shipment.</p>
          ) : (
            <div className="shipment-deals-list">
              {deals.map((d: any) => (
                <div key={d.id} className="sd-item">
                  <div className="sd-top">
                    <a href={`/dashboard/deals/${d.id}`} className="deal-number-link">{d.deal_number}</a>
                    <span className="sd-model">{d.model} &middot; {[d.storage, d.grade, d.carrier].filter(Boolean).join(' ')}</span>
                  </div>
                  <div className="sd-bottom">
                    <span className="sd-qty">{d.quantity} units</span>
                    <span className="sd-amount">{fmtS(d.total_commitment)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Manage Deals Modal */}
      {showManageDeals && (
        <div className="modal-overlay" onClick={(e:any) => { if(e.target===e.currentTarget)setShowManageDeals(false) }}>
          <div className="modal-box" style={{maxWidth:'600px', maxHeight: '90vh', display: 'flex', flexDirection: 'column'}}>
            <div className="modal-header">
              <div><h2 className="modal-title">Manage Deals</h2><p className="modal-sub">Add or remove deals from this shipment</p></div>
              <button className="modal-close" onClick={() => setShowManageDeals(false)}>&#x2715;</button>
            </div>
            
            <div className="modal-form" style={{overflowY:'auto', flex: 1}}>
              {dealManageError && <div className="login-error" style={{marginBottom:'16px'}}>&#9888; {dealManageError}</div>}
              
              <h3 style={{fontSize:'0.9rem',fontWeight:600,color:'var(--text)',marginBottom:'12px',textTransform:'uppercase',letterSpacing:'0.05em'}}>Currently in Shipment ({deals.length})</h3>
              {deals.length === 0 ? (
                <p className="history-empty" style={{marginBottom:'24px'}}>No deals in this shipment.</p>
              ) : (
                <div className="shipment-deals-list" style={{marginBottom:'24px'}}>
                  {deals.map((d: any) => (
                    <div key={d.id} className="sd-item" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div>
                        <div className="sd-top">
                          <span className="deal-number-link">{d.deal_number}</span>
                          <span className="sd-model">{d.model} &middot; {d.quantity} units</span>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleRemoveDeal(d.id)}
                        disabled={isPending}
                        style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:'0.9rem',fontWeight:500,opacity:isPending?0.5:1}}
                      >Remove</button>
                    </div>
                  ))}
                </div>
              )}

              <h3 style={{fontSize:'0.9rem',fontWeight:600,color:'var(--text)',marginBottom:'12px',textTransform:'uppercase',letterSpacing:'0.05em'}}>Available Unshipped Deals ({unshippedDeals.length})</h3>
              {unshippedDeals.length === 0 ? (
                <p className="history-empty">No pending deals available.</p>
              ) : (
                <div className="shipment-deals-list">
                  {unshippedDeals.map((d: any) => (
                    <div key={d.id} className="sd-item" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div>
                        <div className="sd-top">
                          <span className="deal-number-link">{d.deal_number}</span>
                          <span className="sd-model">{d.model} &middot; {d.quantity} units</span>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleAddDeal(d.id)}
                        disabled={isPending}
                        style={{background:'none',border:'none',color:'var(--primary)',cursor:'pointer',fontSize:'0.9rem',fontWeight:500,opacity:isPending?0.5:1}}
                      >Add</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="modal-actions" style={{marginTop:'0',padding:'16px 24px',borderTop:'1px solid var(--border)',background:'var(--bg)'}}>
              <button className="btn-ghost" onClick={() => setShowManageDeals(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Advance Modal */}
      {showAdvance && nextStatus && (
        <div className="modal-overlay" onClick={(e:any) => { if(e.target===e.currentTarget)setShowAdvance(false) }}>
          <div className="modal-box" style={{maxWidth:'460px'}}>
            <div className="modal-header">
              <div><h2 className="modal-title">Advance Shipment</h2><p className="modal-sub">{shipment.shipment_number}</p></div>
              <button className="modal-close" onClick={() => setShowAdvance(false)}>&#x2715;</button>
            </div>
            <div className="modal-form">
              <div className="advance-status-preview">
                <div className="asp-from">
                  <span className="asp-label">Current</span>
                  <span className={`status-badge ${st(shipment.status)?.color||''}`}>{st(shipment.status)?.label}</span>
                </div>
                <span className="asp-arrow">&rarr;</span>
                <div className="asp-to">
                  <span className="asp-label">New Status</span>
                  <span className={`status-badge ${st(nextStatus)?.color||''}`}>{st(nextStatus)?.label}</span>
                </div>
              </div>
              
              {LEGS.find(l => l.key === nextStatus)?.date_field && (
                <div className="form-group" style={{ marginTop: '16px' }}>
                  <label className="form-label">Date of {st(nextStatus)?.label}</label>
                  <input 
                    type="date" 
                    className="form-input" 
                    value={advanceDate} 
                    onChange={e => setAdvanceDate(e.target.value)} 
                    required 
                  />
                </div>
              )}

              {nextStatus === 'DELIVERED_TO_MOBITECH' && (
                <div className="advance-note-box">
                  Advancing to Delivered will automatically mark all {deals.length} linked deal(s) as <strong>Received by Mobitech</strong>.
                </div>
              )}
              {error && <div className="login-error">&#9888; {error}</div>}
              <div className="modal-actions">
                <button className="btn-ghost" onClick={() => setShowAdvance(false)}>Cancel</button>
                <button className="btn-advance" disabled={isPending} onClick={handleAdvance} id="confirm-advance-shipment">
                  {isPending ? 'Updating...' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEdit && (
        <div className="modal-overlay" onClick={(e:any) => { if(e.target===e.currentTarget)setShowEdit(false) }}>
          <div className="modal-box" style={{maxWidth:'680px'}}>
            <div className="modal-header">
              <div><h2 className="modal-title">Edit Shipment</h2><p className="modal-sub">{shipment.shipment_number}</p></div>
              <button className="modal-close" onClick={() => setShowEdit(false)}>&#x2715;</button>
            </div>
            <div className="modal-form">
              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Carrier</label>
                  <select className="form-input" value={editForm.carrier} onChange={e => setEditForm(f=>({...f,carrier:e.target.value}))}>
                    <option value="">Select...</option>
                    {CARRIERS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">AWB Number</label>
                  <input type="text" className="form-input" value={editForm.awb_number} onChange={e=>setEditForm(f=>({...f,awb_number:e.target.value}))} />
                </div>
              </div>
              <div className="form-row-2">
                <div className="form-group"><label className="form-label">SB Invoice #</label><input type="text" className="form-input" value={editForm.sb_invoice_number} onChange={e=>setEditForm(f=>({...f,sb_invoice_number:e.target.value}))}/></div>
                <div className="form-group"><label className="form-label">SB Fee ($)</label><input type="number" className="form-input" value={editForm.sb_fee} onChange={e=>setEditForm(f=>({...f,sb_fee:e.target.value}))}/></div>
              </div>
              <div className="form-row-2">
                <div className="form-group"><label className="form-label">USA to USA Freight ($)</label><input type="number" className="form-input" value={editForm.usa_to_usa_cost} onChange={e=>setEditForm(f=>({...f,usa_to_usa_cost:e.target.value}))}/></div>
                <div className="form-group"><label className="form-label">USA to DXB Freight ($)</label><input type="number" className="form-input" value={editForm.usa_to_dxb_cost} onChange={e=>setEditForm(f=>({...f,usa_to_dxb_cost:e.target.value}))}/></div>
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Total Freight: {fmtS((parseFloat(editForm.usa_to_usa_cost as string)||0) + (parseFloat(editForm.usa_to_dxb_cost as string)||0))}</div>
                </div>
                <div className="form-group"><label className="form-label">Duty Amount ($)</label><input type="number" className="form-input" value={editForm.duty_amount} onChange={e=>setEditForm(f=>({...f,duty_amount:e.target.value}))}/></div>
              </div>
              <div className="form-row-2">
                <div className="form-group"><label className="form-label">Turbo Fee ($)</label><input type="number" className="form-input" value={editForm.turbo_fee} onChange={e=>setEditForm(f=>({...f,turbo_fee:e.target.value}))}/></div>
                <div className="form-group"><label className="form-label">Turbo Invoice #</label><input type="text" className="form-input" value={editForm.turbo_invoice_number} onChange={e=>setEditForm(f=>({...f,turbo_invoice_number:e.target.value}))}/></div>
              </div>
              <div className="form-row-2">
                <div className="form-group"><label className="form-label">Pickup Date</label><input type="date" className="form-input" value={editForm.pickup_date} onChange={e=>setEditForm(f=>({...f,pickup_date:e.target.value}))}/></div>
                <div className="form-group"><label className="form-label">Shipped from USA</label><input type="date" className="form-input" value={editForm.shipped_usa_date} onChange={e=>setEditForm(f=>({...f,shipped_usa_date:e.target.value}))}/></div>
              </div>
              <div className="form-row-2">
                <div className="form-group"><label className="form-label">Arrived Dubai</label><input type="date" className="form-input" value={editForm.arrived_dubai_date} onChange={e=>setEditForm(f=>({...f,arrived_dubai_date:e.target.value}))}/></div>
                <div className="form-group"><label className="form-label">Customs Cleared</label><input type="date" className="form-input" value={editForm.customs_cleared_date} onChange={e=>setEditForm(f=>({...f,customs_cleared_date:e.target.value}))}/></div>
              </div>
              <div className="form-row-2">
                <div className="form-group"><label className="form-label">Customs Ref</label><input type="text" className="form-input" value={editForm.customs_ref} onChange={e=>setEditForm(f=>({...f,customs_ref:e.target.value}))}/></div>
                <div className="form-group"><label className="form-label">Turbo Received</label><input type="date" className="form-input" value={editForm.turbo_received_date} onChange={e=>setEditForm(f=>({...f,turbo_received_date:e.target.value}))}/></div>
              </div>
              <div className="form-group"><label className="form-label">Delivered to Mobitech</label><input type="date" className="form-input" value={editForm.delivered_mobitech_date} onChange={e=>setEditForm(f=>({...f,delivered_mobitech_date:e.target.value}))}/></div>
              <div className="form-group"><label className="form-label">Condition Notes</label><textarea className="form-input" rows={2} value={editForm.condition_notes} onChange={e=>setEditForm(f=>({...f,condition_notes:e.target.value}))}/></div>
              <div className="form-group"><label className="form-label">Notes</label><textarea className="form-input" rows={2} value={editForm.notes} onChange={e=>setEditForm(f=>({...f,notes:e.target.value}))}/></div>
              {error && <div className="login-error">&#9888; {error}</div>}
              <div className="modal-actions">
                <button className="btn-ghost" onClick={() => setShowEdit(false)}>Cancel</button>
                <button className="btn-primary" disabled={isPending} onClick={handleEdit}>{isPending?'Saving...':'Save Changes'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

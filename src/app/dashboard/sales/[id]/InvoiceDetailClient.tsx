'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { INVOICE_STATUSES, PAYMENT_METHODS, type InvoiceStatus } from '@/lib/sales/constants'
import { addLineItem, removeLineItem, recordPayment, issueInvoice, deleteInvoice, uploadInvoiceDocument, removeInvoiceDocument, updateLineItemDeal, updateInvoiceStatus } from '@/lib/sales/actions'
import { useRole } from '@/components/RoleProvider'

function fmt(n: number) { return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits: 3, maximumFractionDigits: 3}).format(n||0) }
function fmtD(d: string|null|undefined) { if(!d) return '-'; return new Date(d).toLocaleDateString('en-AE',{day:'2-digit',month:'short',year:'numeric'}) }

interface Props {
  invoice: any
  deals: any[]
}

export default function InvoiceDetailClient({ invoice, deals }: Props) {
  const router = useRouter()
  const role = useRole()
  const [isPending, startTransition] = useTransition()
  const [showLineItem, setShowLineItem] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [error, setError] = useState('')
  const [isUploadingPdf, setIsUploadingPdf] = useState(false)
  const [editingLineItem, setEditingLineItem] = useState<string | null>(null)
  const [editDealId, setEditDealId] = useState<string>('')
  const [isEditingStatus, setIsEditingStatus] = useState(false)
  const [editStatusValue, setEditStatusValue] = useState<string>('')

  const [liForm, setLiForm] = useState({ deal_id: '', deal_item_id: '', description: '', quantity: '1', unit_price: '' })
  const [payForm, setPayForm] = useState({ amount: invoice.balance_due.toString(), payment_date: new Date().toISOString().split('T')[0], payment_method: 'WIRE_TRANSFER', reference_number: '', notes: '' })

  const st = INVOICE_STATUSES[invoice.status as InvoiceStatus]

  const handleDeleteInvoice = () => {
    if (!window.confirm('Are you sure you want to permanently delete this invoice? This will remove all associated line items and payments. This action cannot be undone.')) return
    
    startTransition(async () => {
      const res = await deleteInvoice(invoice.id)
      if (res.error) {
        setError(res.error)
        alert('Failed to delete invoice: ' + res.error)
      } else {
        router.push('/dashboard/sales')
      }
    })
  }

  const handleIssue = () => {
    if (invoice.status !== 'DRAFT') return
    startTransition(async () => {
      await issueInvoice(invoice.id)
    })
  }

  const handleAddLineItem = () => {
    if (!liForm.description || !liForm.quantity || !liForm.unit_price) { setError('Please fill all required fields'); return }
    setError('')
    startTransition(async () => {
      const fd = new FormData()
      Object.entries(liForm).forEach(([k,v]) => fd.append(k, v))
      const result = await addLineItem(invoice.id, fd)
      if (result.error) { setError(result.error); return }
      setShowLineItem(false)
      setLiForm({ deal_id: '', description: '', quantity: '1', unit_price: '' })
    })
  }

  const handleRemoveLineItem = (id: string) => {
    if(!confirm('Remove this item?')) return
    startTransition(async () => { await removeLineItem(invoice.id, id) })
  }

  const handleAddPayment = () => {
    if (!payForm.amount) { setError('Amount is required'); return }
    setError('')
    startTransition(async () => {
      const fd = new FormData()
      Object.entries(payForm).forEach(([k,v]) => fd.append(k, String(v)))
      const result = await recordPayment(invoice.id, fd)
      if (result.error) { setError(result.error); return }
      setShowPayment(false)
      setPayForm(f => ({ ...f, reference_number: '', notes: '' })) // keep method/date
    })
  }

  const handleUploadPdf = async (e: any) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploadingPdf(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await uploadInvoiceDocument(invoice.id, fd)
      if (res.error) alert(res.error)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setIsUploadingPdf(false)
    }
  }

  const handleRemovePdf = async () => {
    if (!invoice.pdf_url) return
    if (!window.confirm('Remove attached PDF?')) return
    startTransition(async () => {
      const res = await removeInvoiceDocument(invoice.id, invoice.pdf_url)
      if (res.error) alert(res.error)
    })
  }

  const handleUpdateLineItemDeal = async (lineItemId: string, dId?: string, dItemId?: string) => {
    startTransition(async () => {
      const res = await updateLineItemDeal(invoice.id, lineItemId, dId || editDealId, dItemId || null)
      if (res.error) alert(res.error)
      else setEditingLineItem(null)
    })
  }

  const handleUpdateStatus = () => {
    startTransition(async () => {
      const res = await updateInvoiceStatus(invoice.id, editStatusValue)
      if (res.error) alert(res.error)
      else setIsEditingStatus(false)
    })
  }

  return (
    <div className="page-root">
      
      {/* Header */}
      <div className="deal-detail-header">
        <div className="dh-left">
          <a href="/dashboard/sales" className="dh-back">Back to Invoices</a>
          <div className="dh-title-row">
            <h1 className="dh-title">{invoice.invoice_number}</h1>
            {isEditingStatus ? (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select className="form-input" style={{ padding: '2px 8px', fontSize: '11px', height: 'auto', width: '120px' }} value={editStatusValue} onChange={e=>setEditStatusValue(e.target.value)}>
                  {Object.entries(INVOICE_STATUSES).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
                <button className="btn-primary" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={handleUpdateStatus}>Save</button>
                <button className="btn-ghost" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={() => setIsEditingStatus(false)}>Cancel</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span className={`status-badge ${st?.color||''}`}>{st?.label}</span>
                {role === 'SUPER_ADMIN' && (
                  <button className="btn-ghost" style={{ padding: 0, fontSize: '11px', color: 'var(--accent-indigo)' }} onClick={() => { setIsEditingStatus(true); setEditStatusValue(invoice.status); }}>Edit</button>
                )}
              </div>
            )}
          </div>
          <p className="dh-sub">{invoice.customer_name} &middot; Issued: {fmtD(invoice.issue_date)}</p>
        </div>
        <div className="dh-actions">
          {role === 'SUPER_ADMIN' && (
            <button className="btn-ghost" style={{ color: 'var(--accent-red)', border: '1px solid var(--accent-red)' }} onClick={handleDeleteInvoice} disabled={isPending}>
              🗑 Delete
            </button>
          )}
          {invoice.status === 'DRAFT' && (
            <button className="btn-primary" onClick={handleIssue} disabled={isPending}>Issue Invoice</button>
          )}
          {['ISSUED', 'PARTIAL'].includes(invoice.status) && (
            <button className="btn-primary" onClick={() => {
              setPayForm(f => ({ ...f, amount: invoice.balance_due.toString() }))
              setShowPayment(true)
            }}>Record Payment</button>
          )}
        </div>
      </div>

      <div className="shipment-body-grid" style={{ gridTemplateColumns: '1fr 320px', gap: '24px' }}>
        
        {/* Invoice View */}
        <div className="invoice-paper" style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'32px' }}>
          
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'32px' }}>
            <div>
              <div style={{ fontSize:'24px', fontWeight:800, letterSpacing:'-0.5px' }}>INVOICE</div>
              <div style={{ fontSize:'13px', color:'var(--text-muted)' }}>{invoice.invoice_number}</div>
            </div>
            <div style={{ textAlign:'right', fontSize:'13px' }}>
              <div style={{ color:'var(--text-muted)' }}>Issue Date</div>
              <div style={{ fontWeight:600 }}>{fmtD(invoice.issue_date)}</div>
              <div style={{ color:'var(--text-muted)', marginTop:'8px' }}>Due Date</div>
              <div style={{ fontWeight:600 }}>{fmtD(invoice.due_date)}</div>
            </div>
          </div>

          <div style={{ marginBottom:'32px', fontSize:'13px' }}>
            <div style={{ color:'var(--text-muted)', marginBottom:'4px' }}>Billed To:</div>
            <div style={{ fontSize:'15px', fontWeight:700 }}>{invoice.customer_name}</div>
            {invoice.customer_address && <div style={{ whiteSpace:'pre-wrap' }}>{invoice.customer_address}</div>}
            {invoice.customer_email && <div>{invoice.customer_email}</div>}
            {invoice.customer_phone && <div>{invoice.customer_phone}</div>}
          </div>

          <div className="deals-table-wrap">
            <table className="deals-table" style={{ border:'none' }}>
              <thead style={{ borderBottom:'2px solid var(--border)' }}>
                <tr>
                  <th style={{paddingLeft:0}}>Description</th>
                  <th style={{textAlign:'right'}}>Qty</th>
                  <th style={{textAlign:'right'}}>Unit Price</th>
                  <th style={{textAlign:'right', paddingRight:0}}>Amount</th>
                  {['DRAFT', 'ISSUED', 'PARTIAL'].includes(invoice.status) && <th></th>}
                </tr>
              </thead>
              <tbody>
                {(invoice.invoice_line_items || []).map((item: any) => (
                  <tr key={item.id}>
                    <td style={{paddingLeft:0}}>
                      <div style={{ fontWeight:600 }}>{item.description}</div>
                      {editingLineItem === item.id ? (
                        <div style={{ marginTop: '4px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <select className="form-input" style={{ padding: '2px 8px', fontSize: '11px', height: 'auto', width: '200px' }} value={editDealId} onChange={e=>setEditDealId(e.target.value)}>
                            <option value="">No link / Custom item</option>
                            {deals.map(d => {
                              if (d.items && d.items.length > 0) {
                                return (
                                  <optgroup key={d.id} label={`${d.deal_number} - ${d.model} (${d.remaining_quantity} avail)`}>
                                    {d.items.map((it: any) => (
                                      <option key={it.id} value={`${d.id}:${it.id}`}>
                                        {it.model} {it.storage} {it.grade || ''} ({it.remaining_quantity} avail)
                                      </option>
                                    ))}
                                  </optgroup>
                                )
                              }
                              return (
                                <option key={d.id} value={d.id}>{d.deal_number} - {d.model} {[d.storage, d.grade, d.carrier].filter(Boolean).join(' ')} ({d.remaining_quantity} avail)</option>
                              )
                            })}
                          </select>
                          <button className="btn-primary" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={() => {
                            const [dId, dItemId] = editDealId.split(':')
                            handleUpdateLineItemDeal(item.id, dId, dItemId)
                          }}>Save</button>
                          <button className="btn-ghost" style={{ padding: '2px 8px', fontSize: '11px' }} onClick={() => setEditingLineItem(null)}>Cancel</button>
                        </div>
                      ) : (
                        <div style={{ fontSize:'11px', color: item.deals ? '#22c55e' : '#f87171', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {item.deals ? `Deal Ref: ${item.deals.deal_number} (${item.deals.model})` : 'No deal linked'}
                          {role === 'SUPER_ADMIN' && (
                            <button className="btn-ghost" style={{ color: 'var(--accent-indigo)', padding: 0, fontSize: '11px' }} onClick={() => { setEditingLineItem(item.id); setEditDealId(item.deal_item_id ? `${item.deal_id}:${item.deal_item_id}` : (item.deal_id || '')); }}>Edit Source</button>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{textAlign:'right'}}>{item.quantity}</td>
                    <td style={{textAlign:'right'}}>{fmt(item.unit_price)}</td>
                    <td style={{textAlign:'right', paddingRight:0, fontWeight:600}}>{fmt(item.total_price)}</td>
                    {['DRAFT', 'ISSUED', 'PARTIAL'].includes(invoice.status) && (
                      <td style={{width:'30px'}}><button className="btn-ghost" style={{color:'#f87171', padding:'4px 8px'}} onClick={()=>handleRemoveLineItem(item.id)}>✕</button></td>
                    )}
                  </tr>
                ))}
                {['DRAFT', 'ISSUED', 'PARTIAL'].includes(invoice.status) && (
                  <tr>
                    <td colSpan={5} style={{paddingLeft:0}}>
                      <button className="btn-ghost" style={{fontSize:'12px', padding:'6px 12px', color:'var(--accent-indigo)'}} onClick={()=>setShowLineItem(true)}>+ Add Line Item</button>
                    </td>
                  </tr>
                )}
                <tr>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)', fontSize: '12px' }}>TOTAL QTY:</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, fontSize: '13px' }}>
                    {(invoice.invoice_line_items || []).reduce((sum: number, item: any) => sum + (Number(item.quantity) || 0), 0)}
                  </td>
                  <td colSpan={['DRAFT', 'ISSUED', 'PARTIAL'].includes(invoice.status) ? 3 : 2}></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ display:'flex', justifyContent:'flex-end', marginTop:'24px' }}>
            <div style={{ width:'250px', fontSize:'13px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border-subtle)' }}>
                <span style={{ color:'var(--text-muted)' }}>Subtotal</span>
                <strong>{fmt(invoice.subtotal)}</strong>
              </div>
              {invoice.discount > 0 && (
                <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border-subtle)' }}>
                  <span style={{ color:'var(--text-muted)' }}>Discount</span>
                  <strong>-{fmt(invoice.discount)}</strong>
                </div>
              )}
              <div style={{ display:'flex', justifyContent:'space-between', padding:'12px 0', fontSize:'16px', borderBottom:'2px solid var(--border)' }}>
                <span><strong>Total</strong></span>
                <strong>{fmt(invoice.total_amount)}</strong>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', color:'#22c55e' }}>
                <span>Paid</span>
                <strong>{fmt(invoice.amount_paid)}</strong>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'12px 0', fontSize:'18px', backgroundColor:'var(--bg-elevated)', borderRadius:'var(--radius-sm)', marginTop:'8px', paddingLeft:'8px', paddingRight:'8px' }}>
                <span><strong>Balance Due</strong></span>
                <strong style={{ color: invoice.balance_due > 0 ? '#fb923c' : 'inherit' }}>{fmt(invoice.balance_due)}</strong>
              </div>
            </div>
          </div>
          
          {invoice.notes && (
            <div style={{ marginTop:'32px', fontSize:'12px', color:'var(--text-muted)' }}>
              <strong>Notes:</strong><br/>{invoice.notes}
            </div>
          )}

          <div style={{ marginTop: '32px', padding: '16px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>Attachment</h3>
            {invoice.pdf_url ? (
               <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                 <a href={invoice.pdf_url} target="_blank" rel="noreferrer" className="btn-primary" style={{ padding: '8px 16px', fontSize: '12px' }}>View PDF</a>
                 {role === 'SUPER_ADMIN' && (
                   <button className="btn-ghost" style={{ color: 'var(--accent-red)', padding: '8px 16px', fontSize: '12px' }} onClick={handleRemovePdf}>Remove</button>
                 )}
               </div>
            ) : (
               <div>
                 <input type="file" accept="application/pdf" id="pdf-upload" style={{ display: 'none' }} onChange={handleUploadPdf} />
                 <label htmlFor="pdf-upload" className="btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '8px 16px', border: '1px dashed var(--border-subtle)' }}>
                   {isUploadingPdf ? 'Uploading...' : '📄 Upload PDF Invoice'}
                 </label>
               </div>
            )}
          </div>
        </div>

        {/* Right Sidebar: Payment History */}
        <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
          
          <div className="fin-card fin-card-highlight">
            <span style={{ fontSize:'11px', color:'var(--text-secondary)', textTransform:'uppercase', fontWeight:700 }}>A/R Status</span>
            <span style={{ fontSize:'24px', fontWeight:800, color: invoice.balance_due > 0 ? '#fb923c' : '#22c55e' }}>
              {invoice.balance_due > 0 ? `${fmt(invoice.balance_due)} Unpaid` : 'Fully Paid'}
            </span>
            <span style={{ fontSize:'12px', color:'var(--text-muted)' }}>Total Billed: {fmt(invoice.total_amount)}</span>
          </div>

          <div className="deal-info-panel">
            <div className="panel-title">Payment History</div>
            {(invoice.payments || []).length === 0 ? (
              <p className="history-empty">No payments recorded yet.</p>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                {(invoice.payments || []).map((pay: any) => (
                  <div key={pay.id} style={{ border:'1px solid var(--border-subtle)', borderRadius:'var(--radius-sm)', padding:'12px', background:'var(--bg-elevated)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'4px' }}>
                      <strong style={{ fontSize:'14px', color:'#22c55e' }}>+{fmt(pay.amount)}</strong>
                      <span style={{ fontSize:'11px', color:'var(--text-muted)' }}>{fmtD(pay.payment_date)}</span>
                    </div>
                    <div style={{ fontSize:'12px', color:'var(--text-secondary)' }}>
                      {PAYMENT_METHODS.find(m => m.value === pay.payment_method)?.label || pay.payment_method}
                    </div>
                    {pay.reference_number && (
                      <div style={{ fontSize:'11px', color:'var(--text-muted)', marginTop:'4px' }}>Ref: {pay.reference_number}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Add Line Item Modal */}
      {showLineItem && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowLineItem(false)}>
          <div className="modal-box" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <div><h2 className="modal-title">Add Line Item</h2></div>
              <button className="modal-close" onClick={()=>setShowLineItem(false)}>&#x2715;</button>
            </div>
            <div className="modal-form">
              <div className="form-group">
                <label className="form-label">Link to Inventory Deal (Optional)</label>
                <select className="form-input" value={`${liForm.deal_id}${liForm.deal_item_id ? `:${liForm.deal_item_id}` : ''}`} onChange={e => {
                  const [dId, dItemId] = e.target.value.split(':')
                  let desc = liForm.description
                  const deal = deals.find(d => d.id === dId)
                  if (deal) {
                    if (dItemId) {
                      const item = deal.items?.find((i: any) => i.id === dItemId)
                      if (item) desc = `${deal.deal_number} - ${item.model} ${item.storage} ${item.grade || ''}`
                    } else {
                      desc = `${deal.deal_number} - ${deal.model} ${deal.storage || ''} ${deal.grade || ''}`
                    }
                  }
                  setLiForm(f => ({ ...f, deal_id: dId || '', deal_item_id: dItemId || '', description: desc.trim() }))
                }}>
                  <option value="">No link / Custom item</option>
                  {deals.map(d => {
                    if (d.items && d.items.length > 0) {
                      return (
                        <optgroup key={d.id} label={`${d.deal_number} - ${d.model} (${d.remaining_quantity} avail)`}>
                          {d.items.map((it: any) => (
                            <option key={it.id} value={`${d.id}:${it.id}`}>
                              {it.model} {it.storage} {it.grade || ''} ({it.remaining_quantity} avail)
                            </option>
                          ))}
                        </optgroup>
                      )
                    }
                    return (
                      <option key={d.id} value={d.id}>{d.deal_number} - {d.model} {[d.storage, d.grade, d.carrier].filter(Boolean).join(' ')} ({d.remaining_quantity} avail)</option>
                    )
                  })}
                </select>
                <p style={{fontSize:'11px', color:'var(--text-muted)', marginTop:'4px'}}>Linking helps track which stock was sold.</p>
              </div>
              <div className="form-group">
                <label className="form-label">Description *</label>
                <input type="text" className="form-input" placeholder="e.g. iPhone 13 128GB Grade A" value={liForm.description} onChange={e=>setLiForm(f=>({...f,description:e.target.value}))} />
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Quantity *</label>
                  <input type="number" className="form-input" value={liForm.quantity} onChange={e=>setLiForm(f=>({...f,quantity:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Unit Price ($) *</label>
                  <input type="number" className="form-input" placeholder="0.00" value={liForm.unit_price} onChange={e=>setLiForm(f=>({...f,unit_price:e.target.value}))} />
                </div>
              </div>
              {error && <div className="login-error">&#9888; {error}</div>}
              <div className="modal-actions">
                <button className="btn-ghost" onClick={()=>setShowLineItem(false)}>Cancel</button>
                <button className="btn-primary" disabled={isPending} onClick={handleAddLineItem}>
                  {isPending ? 'Adding...' : 'Add Item'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {showPayment && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowPayment(false)}>
          <div className="modal-box" style={{ maxWidth: '460px' }}>
            <div className="modal-header">
              <div><h2 className="modal-title">Record Payment</h2><p className="modal-sub">Balance Due: {fmt(invoice.balance_due)}</p></div>
              <button className="modal-close" onClick={()=>setShowPayment(false)}>&#x2715;</button>
            </div>
            <div className="modal-form">
              <div className="form-group">
                <label className="form-label">Amount Paid ($) *</label>
                <input type="number" className="form-input" value={payForm.amount} onChange={e=>setPayForm(f=>({...f,amount:e.target.value}))} />
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Payment Date</label>
                  <input type="date" className="form-input" value={payForm.payment_date} onChange={e=>setPayForm(f=>({...f,payment_date:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Method</label>
                  <select className="form-input" value={payForm.payment_method} onChange={e=>setPayForm(f=>({...f,payment_method:e.target.value}))}>
                    {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Reference Number</label>
                <input type="text" className="form-input" placeholder="e.g. Wire confirmation #, Cheque #" value={payForm.reference_number} onChange={e=>setPayForm(f=>({...f,reference_number:e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="form-label">Internal Notes</label>
                <textarea className="form-input" rows={2} value={payForm.notes} onChange={e=>setPayForm(f=>({...f,notes:e.target.value}))} />
              </div>
              {error && <div className="login-error">&#9888; {error}</div>}
              <div className="modal-actions">
                <button className="btn-ghost" onClick={()=>setShowPayment(false)}>Cancel</button>
                <button className="btn-primary" disabled={isPending} style={{background:'#22c55e', borderColor:'#22c55e'}} onClick={handleAddPayment}>
                  {isPending ? 'Saving...' : 'Record Payment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

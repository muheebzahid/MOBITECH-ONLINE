'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { INVOICE_STATUSES, PAYMENT_METHODS, type InvoiceStatus } from '@/lib/sales/constants'
import { addLineItem, removeLineItem, recordPayment, deletePayment, issueInvoice, deleteInvoice, uploadInvoiceDocument, removeInvoiceDocument, updateLineItemDeal, updateInvoiceStatus, updateInvoiceBilledTo, updateInvoiceNumber } from '@/lib/sales/actions'
import { useRole } from '@/components/RoleProvider'
import UpdateLiveSyncModal from '@/components/sync/UpdateLiveSyncModal'

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

function fmtD(d: string|null|undefined) { if(!d) return '-'; return new Date(d).toLocaleDateString('en-AE',{day:'2-digit',month:'short',year:'numeric'}) }

interface Props {
  invoice: any
  deals: any[]
}

export default function InvoiceDetailClient({ invoice, deals }: Props) {
  const router = useRouter()
  const role = useRole()
  const [isPending, startTransition] = useTransition()
  const [showSyncModal, setShowSyncModal] = useState(false)
  const [syncDealIds, setSyncDealIds] = useState<string[]>([])
  const [showLineItem, setShowLineItem] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [error, setError] = useState('')
  const [isUploadingPdf, setIsUploadingPdf] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [editingLineItem, setEditingLineItem] = useState<string | null>(null)
  const [editDealId, setEditDealId] = useState<string>('')
  const [isEditingStatus, setIsEditingStatus] = useState(false)
  const [editStatusValue, setEditStatusValue] = useState<string>('')

  const [isEditingInvoiceNumber, setIsEditingInvoiceNumber] = useState(false)
  const [editInvoiceNumber, setEditInvoiceNumber] = useState(invoice.invoice_number || '')

  const [isEditingBilledTo, setIsEditingBilledTo] = useState(false)
  const [editCustomerName, setEditCustomerName] = useState(invoice.customer_name || '')
  const [editCustomerAddress, setEditCustomerAddress] = useState(invoice.customer_address || '')
  const [editCustomerEmail, setEditCustomerEmail] = useState(invoice.customer_email || '')
  const [editCustomerPhone, setEditCustomerPhone] = useState(invoice.customer_phone || '')

  const [dealSearchQuery, setDealSearchQuery] = useState('')
  const [showDealDropdown, setShowDealDropdown] = useState(false)

  const getSelectedDealLabel = () => {
    const dId = liForm.deal_id
    const dItemId = liForm.deal_item_id
    if (!dId) return 'No link / Custom item'

    const deal = deals.find(d => d.id === dId)
    if (!deal) return 'No link / Custom item'

    if (dItemId) {
      const item = deal.items?.find((i: any) => i.id === dItemId)
      if (item) {
        return `${deal.deal_number} - ${item.model} ${item.storage} ${item.grade || ''} (${item.remaining_quantity} avail)`
      }
    }
    return `${deal.deal_number} - ${deal.model} ${[deal.storage, deal.grade, deal.carrier].filter(Boolean).join(' ')} (${deal.remaining_quantity} avail)`
  }

  const filteredDeals = deals.filter(d => {
    if (!dealSearchQuery) return true
    const q = dealSearchQuery.toLowerCase()

    const matchDealNumber = d.deal_number?.toLowerCase().includes(q)
    const matchModel = d.model?.toLowerCase().includes(q)
    const matchQty = String(d.remaining_quantity || 0).includes(q)
    const matchSpecs = [d.storage, d.grade, d.carrier].filter(Boolean).join(' ').toLowerCase().includes(q)

    if (matchDealNumber || matchModel || matchQty || matchSpecs) return true

    if (d.items && d.items.length > 0) {
      return d.items.some((it: any) => {
        const matchItemModel = it.model?.toLowerCase().includes(q)
        const matchItemStorage = it.storage?.toLowerCase().includes(q)
        const matchItemGrade = (it.grade || '')?.toLowerCase().includes(q)
        const matchItemQty = String(it.remaining_quantity || 0).includes(q)
        return matchItemModel || matchItemStorage || matchItemGrade || matchItemQty
      })
    }

    return false
  })

  const getFilteredItems = (d: any) => {
    if (!dealSearchQuery) return d.items || []
    const q = dealSearchQuery.toLowerCase()
    
    const matchDealHeader = 
      d.deal_number?.toLowerCase().includes(q) ||
      d.model?.toLowerCase().includes(q) ||
      String(d.remaining_quantity || 0).includes(q) ||
      [d.storage, d.grade, d.carrier].filter(Boolean).join(' ').toLowerCase().includes(q)
      
    if (matchDealHeader) return d.items || []
    
    return (d.items || []).filter((it: any) => {
      const matchItemModel = it.model?.toLowerCase().includes(q)
      const matchItemStorage = it.storage?.toLowerCase().includes(q)
      const matchItemGrade = (it.grade || '')?.toLowerCase().includes(q)
      const matchItemQty = String(it.remaining_quantity || 0).includes(q)
      return matchItemModel || matchItemStorage || matchItemGrade || matchItemQty
    })
  }

  const [liForm, setLiForm] = useState({ deal_id: '', deal_item_id: '', description: '', quantity: '1', unit_price: '' })
  const [payForm, setPayForm] = useState({ amount: invoice.balance_due.toString(), payment_date: new Date().toISOString().split('T')[0], payment_method: 'WIRE_TRANSFER', reference_number: '', notes: '' })

  const st = INVOICE_STATUSES[invoice.status as InvoiceStatus]


  const handleDeletePayment = (paymentId: string) => {
    if (!window.confirm('Are you sure you want to delete this payment?')) return
    startTransition(async () => {
      const res = await deletePayment(invoice.id, paymentId)
      if (res.error) {
        setError(res.error)
        alert(res.error)
      }
    })
  }

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
      setLiForm({ deal_id: '', deal_item_id: '', description: '', quantity: '1', unit_price: '' })
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

  const uploadFile = async (file: File) => {
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

  const handleUploadPdf = async (e: any) => {
    const file = e.target.files?.[0]
    if (!file) return
    await uploadFile(file)
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf') {
      alert('Please drop a valid PDF document.')
      return
    }
    await uploadFile(file)
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

  const handleUpdateBilledTo = () => {
    if (!editCustomerName.trim()) {
      setError('Customer name is required')
      return
    }
    setError('')
    startTransition(async () => {
      try {
        await updateInvoiceBilledTo(
          invoice.id,
          editCustomerName,
          editCustomerAddress,
          editCustomerEmail,
          editCustomerPhone
        )
        setIsEditingBilledTo(false)
      } catch (err: any) {
        setError(err.message || 'Failed to update billed to')
      }
    })
  }

  const handleUpdateInvoiceNumber = () => {
    if (!editInvoiceNumber.trim()) {
      setError('Invoice number cannot be empty')
      return
    }
    setError('')
    startTransition(async () => {
      try {
        await updateInvoiceNumber(invoice.id, editInvoiceNumber)
        setIsEditingInvoiceNumber(false)
      } catch (err: any) {
        setError(err.message || 'Failed to update invoice number')
      }
    })
  }

  return (
    <div className="page-root">
      <style>{`
        @media print {
          @page { margin: 0; size: auto; }
          
          /* Override all layout wrappers to be white and auto-height */
          html, body, #__next, .erp-root, .erp-main, .page-root {
            background-color: white !important;
            background: white !important;
            color: black !important;
            height: auto !important;
            min-height: auto !important;
            overflow: visible !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          
          /* Hide Sidebar and Top Navigation */
          .sidebar, .erp-header, .deal-detail-header, .mobile-sidebar-toggle { 
            display: none !important; 
          }
          
          /* Restructure the layout grids */
          .shipment-body-grid { 
            display: block !important; 
            margin: 0 !important;
            padding: 0 !important;
            gap: 0 !important;
          }
          .shipment-body-grid > div:last-child { 
            display: none !important; 
          } /* Hide right sidebar (Payment history) */
          
          /* Invoice Paper Styling */
          .invoice-paper { 
            border: none !important; 
            padding: 15mm !important; /* Re-apply padding since @page margin is 0 */
            box-shadow: none !important; 
            background: white !important; 
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
          }
          
          /* Hide interactive elements */
          .no-print { display: none !important; }
          
          /* Table Styling - Option 1: Modern SaaS */
          .deals-table-wrap {
             border: 1px solid #e2e8f0 !important;
             border-radius: 12px !important;
             overflow: hidden !important;
             background: transparent !important;
          }
          .deals-table { border: none !important; width: 100% !important; border-collapse: collapse !important; }
          .deals-table th { 
            background-color: #f8fafc !important; 
            color: #475569 !important; 
            font-size: 11px !important;
            font-weight: 700 !important;
            text-transform: uppercase !important;
            letter-spacing: 0.05em !important;
            padding: 16px 20px !important;
            border-bottom: 1px solid #e2e8f0 !important; 
            border-top: none !important;
            border-left: none !important;
            border-right: none !important;
          }
          .deals-table td { 
            padding: 16px 20px !important;
            border-bottom: 1px solid #f1f5f9 !important; 
            border-top: none !important;
            border-left: none !important;
            border-right: none !important;
            background-color: white !important; 
            vertical-align: top !important;
          }
          .deals-table tr:last-child td { border-bottom: none !important; }
          
          /* Ensure text colors are dark for printing */
          .invoice-paper *, .invoice-paper div, .invoice-paper span, .invoice-paper td, .invoice-paper strong { 
            color: #0f172a !important; 
          }
          .text-muted, .invoice-paper .text-muted { color: #475569 !important; }
          .invoice-brand-name { color: #2563eb !important; }
          
          /* Force color adjust */
          * {
            -webkit-print-color-adjust: exact !important; 
            print-color-adjust: exact !important;
          }
        }
      `}</style>
      
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
          <button
            className="btn-primary"
            onClick={() => {
              const dIds = Array.from(new Set((invoice.invoice_line_items || []).map((i: any) => i.deal_id).filter(Boolean)))
              if (dIds.length === 0) {
                alert('This invoice has no linked deal package to sync. Please link a deal line item first.')
                return
              }
              setSyncDealIds(dIds as string[])
              setShowSyncModal(true)
            }}
            style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            ⚡ Update Live Cloud
          </button>
          {role === 'SUPER_ADMIN' && (
            <button className="btn-ghost" style={{ color: 'var(--accent-red)', border: '1px solid var(--accent-red)' }} onClick={handleDeleteInvoice} disabled={isPending}>
              🗑 Delete
            </button>
          )}
          {invoice.status === 'DRAFT' && (
            <button className="btn-primary" onClick={handleIssue} disabled={isPending}>Issue Invoice</button>
          )}
          {['ISSUED', 'PARTIAL', 'PAID'].includes(invoice.status) && (
            <button className="btn-ghost" onClick={() => {
              const oldTitle = document.title;
              const cleanCustomer = (invoice.customer_name || 'Unknown').replace(/[^a-zA-Z0-9 ]/g, '').trim();
              const dateStr = invoice.issue_date ? fmtD(invoice.issue_date) : '';
              document.title = `${invoice.invoice_number} - ${cleanCustomer} - ${dateStr}`;
              window.print();
              setTimeout(() => { document.title = oldTitle; }, 1000);
            }} style={{ border: '1px solid var(--border)' }}>Download PDF</button>
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
              <div className="invoice-brand-name" style={{ fontSize:'15px', fontWeight:800, color:'#2563eb', marginBottom:'4px' }}>TELE SIM FZCO</div>
              <div style={{ fontSize:'24px', fontWeight:800, letterSpacing:'-0.5px' }}>INVOICE</div>
              {isEditingInvoiceNumber ? (
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <input type="text" className="form-input" style={{ fontSize: '13px', padding: '4px 8px', width: '150px' }} value={editInvoiceNumber} onChange={e => setEditInvoiceNumber(e.target.value)} />
                  <button className="btn-primary" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={handleUpdateInvoiceNumber} disabled={isPending}>Save</button>
                  <button className="btn-ghost" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => {
                    setIsEditingInvoiceNumber(false);
                    setEditInvoiceNumber(invoice.invoice_number);
                  }}>Cancel</button>
                </div>
              ) : (
                <div style={{ fontSize:'13px', color:'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {invoice.invoice_number}
                  <button className="btn-ghost no-print" style={{ padding: 0, fontSize: '11px', color: 'var(--accent-indigo)' }} onClick={() => setIsEditingInvoiceNumber(true)}>Edit</button>
                </div>
              )}
            </div>
            <div style={{ textAlign:'right', fontSize:'13px' }}>
              <div style={{ color:'var(--text-muted)' }}>Issue Date</div>
              <div style={{ fontWeight:600 }}>{fmtD(invoice.issue_date)}</div>
              <div style={{ color:'var(--text-muted)', marginTop:'8px' }}>Due Date</div>
              <div style={{ fontWeight:600 }}>{fmtD(invoice.due_date)}</div>
            </div>
          </div>

          <div style={{ marginBottom:'32px', fontSize:'13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ color:'var(--text-muted)', fontWeight: 600 }}>Billed To:</span>
              {!isEditingBilledTo && (
                <button 
                  className="btn-ghost no-print" 
                  style={{ padding: 0, fontSize: '11px', color: 'var(--accent-indigo)' }}
                  onClick={() => setIsEditingBilledTo(true)}
                >
                  Edit
                </button>
              )}
            </div>

            {isEditingBilledTo ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--bg-elevated)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Customer Name *</label>
                  <input type="text" className="form-input" style={{ fontSize: '13px', padding: '6px 10px' }} value={editCustomerName} onChange={e => setEditCustomerName(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Address</label>
                  <textarea className="form-input" rows={2} style={{ fontSize: '13px', padding: '6px 10px', resize: 'vertical' }} value={editCustomerAddress} onChange={e => setEditCustomerAddress(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Email</label>
                  <input type="email" className="form-input" style={{ fontSize: '13px', padding: '6px 10px' }} value={editCustomerEmail} onChange={e => setEditCustomerEmail(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Phone</label>
                  <input type="text" className="form-input" style={{ fontSize: '13px', padding: '6px 10px' }} value={editCustomerPhone} onChange={e => setEditCustomerPhone(e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <button className="btn-primary" style={{ padding: '4px 12px', fontSize: '12px' }} onClick={handleUpdateBilledTo} disabled={isPending}>
                    {isPending ? 'Saving...' : 'Save'}
                  </button>
                  <button 
                    className="btn-ghost" 
                    style={{ padding: '4px 12px', fontSize: '12px', border: '1px solid var(--border)' }} 
                    type="button"
                    onClick={() => {
                      setIsEditingBilledTo(false)
                      setEditCustomerName(invoice.customer_name || '')
                      setEditCustomerAddress(invoice.customer_address || '')
                      setEditCustomerEmail(invoice.customer_email || '')
                      setEditCustomerPhone(invoice.customer_phone || '')
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize:'15px', fontWeight:700 }}>{invoice.customer_name}</div>
                {invoice.customer_address && <div style={{ whiteSpace:'pre-wrap' }}>{invoice.customer_address}</div>}
                {invoice.customer_email && <div>{invoice.customer_email}</div>}
                {invoice.customer_phone && <div>{invoice.customer_phone}</div>}
              </div>
            )}
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
                                    <option value={d.id}>
                                      [Whole Deal] {d.deal_number} - {d.model} ({d.remaining_quantity} avail)
                                    </option>
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
                        <div className="no-print" style={{ fontSize:'11px', color: item.deals ? '#22c55e' : '#f87171', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {item.deals ? `Deal Ref: ${item.deals.deal_number} (${item.deals.model})` : 'No deal linked'}
                          {role === 'SUPER_ADMIN' && (
                            <button className="btn-ghost no-print" style={{ color: 'var(--accent-indigo)', padding: 0, fontSize: '11px' }} onClick={() => { setEditingLineItem(item.id); setEditDealId(item.deal_item_id ? `${item.deal_id}:${item.deal_item_id}` : (item.deal_id || '')); }}>Edit Source</button>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{textAlign:'right'}}>{item.quantity}</td>
                    <td style={{textAlign:'right'}}>{fmt(item.unit_price)}</td>
                    <td style={{textAlign:'right', paddingRight:0, fontWeight:600}}>{fmt(item.total_price)}</td>
                    {['DRAFT', 'ISSUED', 'PARTIAL'].includes(invoice.status) && (
                      <td style={{width:'30px'}} className="no-print"><button className="btn-ghost" style={{color:'#f87171', padding:'4px 8px'}} onClick={()=>handleRemoveLineItem(item.id)}>✕</button></td>
                    )}
                  </tr>
                ))}
                {['DRAFT', 'ISSUED', 'PARTIAL'].includes(invoice.status) && (
                  <tr className="no-print">
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
              <div style={{ display:'flex', justifyContent:'space-between', padding:'12px 0', fontSize:'18px', marginTop:'8px' }}>
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

          <div className="no-print" style={{ marginTop: '32px', padding: '16px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>Attachment</h3>
            {invoice.pdf_url ? (
               <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                 <a href={invoice.pdf_url} target="_blank" rel="noreferrer" className="btn-primary" style={{ padding: '8px 16px', fontSize: '12px' }}>View PDF</a>
                 {role === 'SUPER_ADMIN' && (
                   <button className="btn-ghost" style={{ color: 'var(--accent-red)', padding: '8px 16px', fontSize: '12px' }} onClick={handleRemovePdf}>Remove</button>
                 )}
               </div>
            ) : (
               <div
                 onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                 onDragLeave={() => setIsDragging(false)}
                 onDrop={handleDrop}
                 style={{
                   border: isDragging ? '2px dashed var(--accent-indigo)' : '1px dashed var(--border-subtle)',
                   borderRadius: 'var(--radius-sm)',
                   padding: '24px 16px',
                   textAlign: 'center',
                   backgroundColor: isDragging ? 'rgba(99,102,241,0.06)' : 'transparent',
                   transition: 'all var(--transition)',
                   cursor: 'pointer'
                 }}
               >
                 <input type="file" accept="application/pdf" id="pdf-upload" style={{ display: 'none' }} onChange={handleUploadPdf} />
                 <label htmlFor="pdf-upload" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                   <span style={{ fontSize: '24px' }}>{isUploadingPdf ? '⏳' : '📥'}</span>
                   <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                     {isUploadingPdf ? 'Uploading...' : 'Drag & drop PDF here, or click to browse'}
                   </span>
                   <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                     Supports PDF format only
                   </span>
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize:'11px', color:'var(--text-muted)' }}>{fmtD(pay.payment_date)}</span>
                        {role === 'SUPER_ADMIN' && (
                          <button 
                            className="btn-ghost" 
                            style={{ color: '#ef4444', padding: '0 4px', fontSize: '12px' }}
                            onClick={() => handleDeletePayment(pay.id)}
                            disabled={isPending}
                            title="Delete Payment"
                          >
                            ✕
                          </button>
                        )}
                      </div>
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
          <div className="modal-box" style={{ maxWidth: '500px', overflow: 'visible' }}>
            <div className="modal-header">
              <div><h2 className="modal-title">Add Line Item</h2></div>
              <button className="modal-close" onClick={()=>setShowLineItem(false)}>&#x2715;</button>
            </div>
            <div className="modal-form">
              <div className="form-group" style={{ position: 'relative' }}>
                <label className="form-label">Link to Inventory Deal (Optional)</label>
                
                {/* Trigger Button */}
                <div 
                  className="form-input" 
                  onClick={() => setShowDealDropdown(!showDealDropdown)}
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    cursor: 'pointer',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    userSelect: 'none'
                  }}
                >
                  <span style={{ fontSize: '13px', color: liForm.deal_id ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    {getSelectedDealLabel()}
                  </span>
                  <span style={{ fontSize: '10px', opacity: 0.6 }}>{showDealDropdown ? '▲' : '▼'}</span>
                </div>

                {/* Click outside overlay */}
                {showDealDropdown && (
                  <div 
                    onClick={() => { setShowDealDropdown(false); setDealSearchQuery(''); }}
                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 90 }}
                  />
                )}

                {/* Dropdown Panel */}
                {showDealDropdown && (
                  <div 
                    style={{ 
                      position: 'absolute', 
                      top: '100%', 
                      left: 0, 
                      right: 0, 
                      zIndex: 100, 
                      background: 'var(--bg-surface)', 
                      border: '1px solid var(--border)', 
                      borderRadius: 'var(--radius-sm)', 
                      boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
                      marginTop: '4px',
                      display: 'flex',
                      flexDirection: 'column',
                      maxHeight: '300px',
                      overflow: 'hidden'
                    }}
                  >
                    {/* Search Input Bar */}
                    <div style={{ padding: '8px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
                      <input 
                        type="text" 
                        className="form-input"
                        placeholder="Search deal #, model, or quantity..."
                        value={dealSearchQuery}
                        onChange={e => setDealSearchQuery(e.target.value)}
                        style={{ fontSize: '12px', padding: '6px 10px', width: '100%', boxSizing: 'border-box' }}
                        autoFocus
                        onClick={e => e.stopPropagation()} // Prevent closing dropdown on input click
                      />
                    </div>

                    {/* Options List */}
                    <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
                      {/* No link option */}
                      <div 
                        onClick={() => {
                          setLiForm(f => ({ ...f, deal_id: '', deal_item_id: '', description: '' }));
                          setShowDealDropdown(false);
                          setDealSearchQuery('');
                        }}
                        style={{
                          padding: '8px 12px',
                          fontSize: '12px',
                          cursor: 'pointer',
                          backgroundColor: !liForm.deal_id ? 'var(--bg-hover)' : 'transparent',
                          color: 'var(--text-primary)',
                          fontWeight: !liForm.deal_id ? 600 : 400
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = !liForm.deal_id ? 'var(--bg-hover)' : 'transparent'}
                      >
                        No link / Custom item
                      </div>

                      {filteredDeals.length === 0 && (
                        <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                          No matching deals found
                        </div>
                      )}

                      {filteredDeals.map(d => {
                        const items = getFilteredItems(d)
                        const isSelectedDeal = liForm.deal_id === d.id && !liForm.deal_item_id
                        
                        if (items.length > 0) {
                          // Deal group header
                          return (
                            <div key={d.id}>
                              <div style={{ 
                                padding: '6px 12px 2px', 
                                fontSize: '11px', 
                                fontWeight: 700, 
                                color: 'var(--accent-indigo)', 
                                textTransform: 'uppercase', 
                                letterSpacing: '0.5px',
                                background: 'rgba(99,102,241,0.04)',
                                marginTop: '4px'
                              }}>
                                {d.deal_number} - {d.model} ({d.remaining_quantity} avail)
                              </div>
                              <div
                                onClick={() => {
                                  const desc = `${d.deal_number} - ${d.model} ${d.storage || ''} ${d.grade || ''}`.trim()
                                  setLiForm(f => ({ ...f, deal_id: d.id, deal_item_id: '', description: desc }));
                                  setShowDealDropdown(false);
                                  setDealSearchQuery('');
                                }}
                                style={{
                                  padding: '6px 12px 6px 20px',
                                  fontSize: '12px',
                                  cursor: 'pointer',
                                  backgroundColor: isSelectedDeal ? 'var(--bg-hover)' : 'transparent',
                                  color: 'var(--accent-indigo)',
                                  fontWeight: isSelectedDeal ? 600 : 400
                                }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = isSelectedDeal ? 'var(--bg-hover)' : 'transparent'}
                              >
                                🔗 [Whole Deal] {d.deal_number} - {d.model} ({d.remaining_quantity} avail)
                              </div>
                              {items.map((it: any) => {
                                const isSelectedOption = liForm.deal_id === d.id && liForm.deal_item_id === it.id
                                return (
                                  <div
                                    key={it.id}
                                    onClick={() => {
                                      const desc = `${d.deal_number} - ${it.model} ${it.storage} ${it.grade || ''}`.trim()
                                      setLiForm(f => ({ ...f, deal_id: d.id, deal_item_id: it.id, description: desc }));
                                      setShowDealDropdown(false);
                                      setDealSearchQuery('');
                                    }}
                                    style={{
                                      padding: '6px 12px 6px 20px',
                                      fontSize: '12px',
                                      cursor: 'pointer',
                                      backgroundColor: isSelectedOption ? 'var(--bg-hover)' : 'transparent',
                                      color: 'var(--text-primary)',
                                      fontWeight: isSelectedOption ? 600 : 400
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = isSelectedOption ? 'var(--bg-hover)' : 'transparent'}
                                  >
                                    {it.model} {it.storage} {it.grade || ''} ({it.remaining_quantity} avail)
                                  </div>
                                )
                              })}
                            </div>
                          )
                        }

                        // Single item deal option
                        return (
                          <div
                            key={d.id}
                            onClick={() => {
                              const desc = `${d.deal_number} - ${d.model} ${d.storage || ''} ${d.grade || ''}`.trim()
                              setLiForm(f => ({ ...f, deal_id: d.id, deal_item_id: '', description: desc }));
                              setShowDealDropdown(false);
                              setDealSearchQuery('');
                            }}
                            style={{
                              padding: '8px 12px',
                              fontSize: '12px',
                              cursor: 'pointer',
                              backgroundColor: isSelectedDeal ? 'var(--bg-hover)' : 'transparent',
                              color: 'var(--text-primary)',
                              fontWeight: isSelectedDeal ? 600 : 400
                            }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = isSelectedDeal ? 'var(--bg-hover)' : 'transparent'}
                          >
                            {d.deal_number} - {d.model} {[d.storage, d.grade, d.carrier].filter(Boolean).join(' ')} ({d.remaining_quantity} avail)
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                
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

      {/* Live Sync Modal */}
      {showSyncModal && syncDealIds.length > 0 && (
        <UpdateLiveSyncModal
          dealIds={syncDealIds}
          isOpen={showSyncModal}
          onClose={() => {
            setShowSyncModal(false)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { INVOICE_STATUSES, type InvoiceStatus } from '@/lib/sales/constants'
import { createInvoice, updateInvoiceApproval } from '@/lib/sales/actions'
import { useRole } from '@/components/RoleProvider'

function fmtS(n: number) {
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

export default function SalesClient({ invoices, pendingInvoices = [], clients = [], invoicesTotal = 0, currentMonth = 'all' }: { invoices: any[], pendingInvoices?: any[], clients?: any[], invoicesTotal?: number, currentMonth?: string }) {
  const router = useRouter()
  const role = useRole()
  const [isPending, startTransition] = useTransition()
  const [showNew, setShowNew] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null)
  
  const [form, setForm] = useState({
    customer_name: '', customer_email: '', customer_address: '', customer_phone: '',
    issue_date: new Date().toISOString().split('T')[0], due_date: '', notes: ''
  })
  const [error, setError] = useState('')

  const handleCreate = () => {
    if (!form.customer_name) { setError('Customer name is required'); return }
    setError('')
    startTransition(async () => {
      const fd = new FormData()
      Object.entries(form).forEach(([k,v]) => fd.append(k, String(v)))
      const result = await createInvoice(fd)
      if (result.error) { setError(result.error); return }
      setShowNew(false)
      if (result.invoice) {
        router.push(`/dashboard/sales/${result.invoice.id}`)
      } else {
        router.refresh()
      }
    })
  }

  // Summary Metrics
  const totalReceivables = invoices.reduce((sum, inv) => sum + (inv.status !== 'CANCELLED' ? inv.balance_due : 0), 0)
  const totalPaid = invoices.reduce((sum, inv) => sum + (inv.status !== 'CANCELLED' ? inv.amount_paid : 0), 0)
  const overdueInvoices = invoices.filter(inv => inv.status !== 'PAID' && inv.status !== 'CANCELLED' && inv.due_date && new Date(inv.due_date) < new Date()).length

  const handleInvoiceApproval = async (invoiceId: string, status: 'APPROVED' | 'REJECTED') => {
    startTransition(async () => {
      await updateInvoiceApproval(invoiceId, status)
    })
  }

  const filteredInvoices = invoices.filter(inv => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()

    if (inv.invoice_number?.toLowerCase().includes(q)) return true
    if (inv.customer_name?.toLowerCase().includes(q)) return true
    
    const statusLabel = INVOICE_STATUSES[inv.status as InvoiceStatus]?.label?.toLowerCase()
    if (statusLabel && statusLabel.includes(q)) return true

    if (inv.invoice_line_items && inv.invoice_line_items.length > 0) {
      return inv.invoice_line_items.some((item: any) => {
        const matchDealNo = item.deals?.deal_number?.toLowerCase().includes(q)
        const matchDealModel = item.deals?.model?.toLowerCase().includes(q)
        const matchLineDesc = item.description?.toLowerCase().includes(q)
        return matchDealNo || matchDealModel || matchLineDesc
      })
    }

    return false
  })

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const sortedInvoices = [...filteredInvoices].sort((a, b) => {
    if (!sortConfig) return 0
    const { key, direction } = sortConfig
    let valA = a[key]
    let valB = b[key]
    
    if (key === 'source_deals') {
      valA = a.invoice_line_items?.length || 0
      valB = b.invoice_line_items?.length || 0
    }
    
    if (valA < valB) return direction === 'asc' ? -1 : 1
    if (valA > valB) return direction === 'asc' ? 1 : -1
    return 0
  })

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (!sortConfig || sortConfig.key !== columnKey) return <span style={{ opacity: 0.3, marginLeft: '4px' }}>↕</span>
    return <span style={{ marginLeft: '4px', color: 'var(--accent-indigo)' }}>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <div className="page-root">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sales & Invoicing</h1>
          <p className="page-subtitle">Manage wholesale invoices and reconcile payments</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <select 
            className="form-input" 
            value={currentMonth || 'all'}
            onChange={e => {
              const m = e.target.value;
              if (m === 'all') {
                router.push('/dashboard/sales');
              } else {
                router.push(`/dashboard/sales?month=${m}`);
              }
            }}
            style={{ padding: '6px 12px', fontSize: '13px', width: 'auto' }}
          >
            <option value="all">All Time</option>
            {Array.from({ length: 24 }).map((_, i) => {
              const d = new Date();
              d.setMonth(d.getMonth() - i);
              const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
              const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
              return <option key={val} value={val}>{label}</option>
            })}
          </select>
          <button className="btn-primary" onClick={() => setShowNew(true)}>+ New Invoice</button>
        </div>
      </div>

      {/* Pending Invoices */}
      {pendingInvoices && pendingInvoices.length > 0 && (
        <div style={{ marginTop: '24px', padding: '24px', border: '2px solid var(--accent-amber)', borderRadius: '12px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            Pending Approvals
            <span style={{ background: 'var(--accent-amber)', color: '#000', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>
              {pendingInvoices.length} Action{pendingInvoices.length !== 1 ? 's' : ''} Required
            </span>
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
            {pendingInvoices.map(inv => (
              <div key={inv.id} style={{ padding: '16px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ fontWeight: 500 }}>{inv.customer_name}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>{fmtD(inv.created_at)}</div>
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  Awaiting Super Admin approval.
                </div>
                {role === 'SUPER_ADMIN' ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      className="btn-primary" 
                      style={{ background: 'var(--accent-green)', color: '#000', flex: 1 }} 
                      onClick={() => handleInvoiceApproval(inv.id, 'APPROVED')}
                      disabled={isPending}
                    >
                      Approve
                    </button>
                    <button 
                      className="btn-ghost" 
                      style={{ color: 'var(--accent-red)', flex: 1, border: '1px solid var(--border)' }} 
                      onClick={() => handleInvoiceApproval(inv.id, 'REJECTED')}
                      disabled={isPending}
                    >
                      Reject
                    </button>
                  </div>
                ) : (
                  <div style={{ padding: '8px', background: 'var(--bg-body)', borderRadius: '6px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
                    Waiting for approval...
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search Input Container */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '32px', marginBottom: '16px', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '400px', minWidth: '280px' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Search invoice #, customer, status, deal #, or model..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              paddingLeft: '36px',
              fontSize: '13px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              height: '38px',
              boxSizing: 'border-box',
              width: '100%'
            }}
          />
          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4, fontSize: '14px' }}>
            🔍
          </span>
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px' }}
            >
              ✕
            </button>
          )}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          Showing {filteredInvoices.length} of {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Invoices List */}
      {(() => {
        const subtotalQty = filteredInvoices.reduce((sum, inv) => {
          const invQty = inv.invoice_line_items ? inv.invoice_line_items.reduce((s: number, i: any) => s + (i.quantity || 0), 0) : 0
          return sum + invQty
        }, 0)
        const subtotalCollected = filteredInvoices.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0)
        const subtotalTotal = filteredInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0)
        const subtotalDue = filteredInvoices.reduce((sum, inv) => sum + (inv.balance_due || 0), 0)

        return (
          <div className="deals-table-wrap" style={{ marginTop: '0' }}>
            <table className="deals-table">
              <thead>
                <tr style={{ userSelect: 'none' }}>
                  <th onClick={() => requestSort('invoice_number')} style={{ cursor: 'pointer' }}>Invoice # <SortIcon columnKey="invoice_number" /></th>
                  <th onClick={() => requestSort('status')} style={{ cursor: 'pointer' }}>Status <SortIcon columnKey="status" /></th>
                  <th onClick={() => requestSort('customer_name')} style={{ cursor: 'pointer' }}>Customer <SortIcon columnKey="customer_name" /></th>
                  <th onClick={() => requestSort('source_deals')} style={{ cursor: 'pointer' }}>Source Deal(s) <SortIcon columnKey="source_deals" /></th>
                  <th onClick={() => requestSort('issue_date')} style={{ cursor: 'pointer' }}>Payment Date <SortIcon columnKey="issue_date" /></th>
                  <th onClick={() => requestSort('total_amount')} style={{ cursor: 'pointer', textAlign:'right' }}>Total <SortIcon columnKey="total_amount" /></th>
                  <th onClick={() => requestSort('balance_due')} style={{ cursor: 'pointer', textAlign:'right' }}>Balance Due <SortIcon columnKey="balance_due" /></th>
                </tr>
              </thead>
              <tbody>
                {sortedInvoices.length === 0 && (
                  <tr><td colSpan={8} style={{textAlign:'center', padding:'30px', color:'var(--text-muted)'}}>No invoices found matching your query.</td></tr>
                )}
                {sortedInvoices.map(inv => {
                  const st = INVOICE_STATUSES[inv.status as InvoiceStatus]
                  return (
                    <tr key={inv.id} className="deal-row">
                      <td>
                        <a href={`/dashboard/sales/${inv.id}`} className="deal-number-link">
                          {inv.invoice_number}
                        </a>
                      </td>
                      <td><span className={`status-badge ${st?.color||''}`}>{st?.label}</span></td>
                      <td>
                        <strong>{inv.customer_name}</strong>
                        {(() => {
                          if (!inv.invoice_line_items || inv.invoice_line_items.length === 0) return null;
                          const qty = inv.invoice_line_items.reduce((sum: number, i: any) => sum + (i.quantity || 0), 0);
                          const models = Array.from(new Set(inv.invoice_line_items.map((i: any) => i.deals?.model || i.description?.split(' ')[0] || '').filter(Boolean))).join(', ');
                          return (
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {qty} units {models ? `· ${models}` : ''}
                            </div>
                          );
                        })()}
                      </td>
                      <td>
                        {(() => {
                          const dealGroups = new Map<string, { deal: any; qty: number }>()
                          for (const item of (inv.invoice_line_items || [])) {
                            const deal = item.deals
                            if (deal && deal.id && deal.deal_number) {
                              const existing = dealGroups.get(deal.id)
                              if (existing) {
                                existing.qty += (item.quantity || 0)
                              } else {
                                dealGroups.set(deal.id, { deal, qty: item.quantity || 0 })
                              }
                            }
                          }

                          const groups = Array.from(dealGroups.values())
                          if (groups.length === 0) return <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>;
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {groups.map(({ deal, qty }) => (
                                <a
                                  key={deal.id}
                                  href={`/dashboard/deals/${deal.id}`}
                                  className="deal-number-link"
                                  style={{ fontSize: '12px', fontWeight: 500 }}
                                >
                                  {deal.deal_number} <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>({deal.model})</span>
                                  <span style={{ fontSize: '11px', color: 'var(--accent-teal)', fontWeight: 600, marginLeft: '6px' }}>— {qty} units</span>
                                </a>
                              ))}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="deal-date">{fmtD(inv.issue_date)}</td>
                      <td className="deal-amount" style={{textAlign:'right'}}>{fmtS(inv.total_amount)}</td>
                      <td className="deal-amount" style={{textAlign:'right', color: inv.balance_due > 0 ? '#fb923c' : 'inherit'}}>
                        {fmtS(inv.balance_due)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {filteredInvoices.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 'bold', background: 'var(--bg-elevated)' }}>
                    <td colSpan={2} style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '13px' }}>
                      Subtotal
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>Qty Sold</div>
                      <div style={{ fontSize: '13px', fontWeight: 'bold' }}>{subtotalQty} units</div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>Amt Collected</div>
                      <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--accent-green)' }}>{fmtS(subtotalCollected)}</div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {/* empty space */}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', fontWeight: 'bold' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>Total</div>
                      <div>{fmtS(subtotalTotal)}</div>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', fontWeight: 'bold', color: subtotalDue > 0 ? '#fb923c' : 'inherit' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>Due</div>
                      <div>{fmtS(subtotalDue)}</div>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )
      })()}

      {/* New Invoice Modal */}
      {showNew && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowNew(false)}>
          <div className="modal-box" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <div><h2 className="modal-title">New Invoice</h2><p className="modal-sub">Draft a new wholesale invoice</p></div>
              <button className="modal-close" onClick={()=>setShowNew(false)}>&#x2715;</button>
            </div>
            <div className="modal-form">
              <style>{`
                .suggestion-item:hover { background: var(--bg-hover) !important; color: var(--text) !important; }
              `}</style>
              <div className="form-group" style={{ position: 'relative' }}>
                <label className="form-label">Customer / Company Name *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={form.customer_name} 
                  onChange={e => {
                    setForm(f => ({ ...f, customer_name: e.target.value }))
                    setShowSuggestions(true)
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                />
                {showSuggestions && form.customer_name.trim() && (
                  (() => {
                    const filtered = (clients || []).filter(c => c.name.toLowerCase().includes(form.customer_name.toLowerCase()))
                    if (filtered.length === 0) return null
                    return (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        zIndex: 100,
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        maxHeight: '150px',
                        overflowY: 'auto',
                        marginTop: '4px',
                        boxShadow: 'var(--shadow-lg)'
                      }}>
                        {filtered.map(c => (
                          <div 
                            key={c.id} 
                            onClick={() => {
                              setForm(f => ({
                                ...f,
                                customer_name: c.name,
                                customer_email: c.email || '',
                                customer_phone: c.phone || '',
                                customer_address: c.address || ''
                              }))
                              setShowSuggestions(false)
                            }}
                            style={{
                              padding: '10px 12px',
                              cursor: 'pointer',
                              fontSize: '13px',
                              borderBottom: '1px solid var(--border-subtle)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '2px',
                              color: 'var(--text)'
                            }}
                            className="suggestion-item"
                          >
                            <span style={{ fontWeight: 600 }}>{c.name}</span>
                            {c.email && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.email}</span>}
                          </div>
                        ))}
                      </div>
                    )
                  })()
                )}
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input type="email" className="form-input" value={form.customer_email} onChange={e=>setForm(f=>({...f,customer_email:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input type="text" className="form-input" value={form.customer_phone} onChange={e=>setForm(f=>({...f,customer_phone:e.target.value}))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Billing Address</label>
                <textarea className="form-input" rows={2} value={form.customer_address} onChange={e=>setForm(f=>({...f,customer_address:e.target.value}))} />
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Issue Date</label>
                  <input type="date" className="form-input" value={form.issue_date} onChange={e=>setForm(f=>({...f,issue_date:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Due Date</label>
                  <input type="date" className="form-input" value={form.due_date} onChange={e=>setForm(f=>({...f,due_date:e.target.value}))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Notes (Visible on Invoice)</label>
                <textarea className="form-input" rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} />
              </div>
              {error && <div className="login-error">&#9888; {error}</div>}
              <div className="modal-actions">
                <button className="btn-ghost" onClick={()=>setShowNew(false)}>Cancel</button>
                <button className="btn-primary" disabled={isPending} onClick={handleCreate}>
                  {isPending ? 'Drafting...' : 'Draft Invoice'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
    </div>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { INVOICE_STATUSES, type InvoiceStatus } from '@/lib/sales/constants'
import { createInvoice, updateInvoiceApproval } from '@/lib/sales/actions'
import { useRole } from '@/components/RoleProvider'

function fmtS(n: number) { return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n||0) }
function fmtD(d: string|null|undefined) { if(!d) return '-'; return new Date(d).toLocaleDateString('en-AE',{day:'2-digit',month:'short',year:'numeric'}) }

export default function SalesClient({ invoices, pendingInvoices = [] }: { invoices: any[], pendingInvoices?: any[] }) {
  const router = useRouter()
  const role = useRole()
  const [isPending, startTransition] = useTransition()
  const [showNew, setShowNew] = useState(false)
  
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

  return (
    <div className="page-root">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sales & Invoicing</h1>
          <p className="page-subtitle">Manage wholesale invoices and reconcile payments</p>
        </div>
        <button className="btn-primary" onClick={() => setShowNew(true)}>+ New Invoice</button>
      </div>

      {/* Summary Cards */}
      <div className="log-summary-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="log-sum-card log-sum-blue">
          <span className="log-sum-label">Outstanding Receivables</span>
          <span className="log-sum-value">{fmtS(totalReceivables)}</span>
          <span className="log-sum-sub">Total balance due</span>
        </div>
        <div className="log-sum-card log-sum-green">
          <span className="log-sum-label">Total Collected</span>
          <span className="log-sum-value">{fmtS(totalPaid)}</span>
          <span className="log-sum-sub">Payments received</span>
        </div>
        <div className="log-sum-card log-sum-amber">
          <span className="log-sum-label">Overdue Invoices</span>
          <span className="log-sum-value">{overdueInvoices}</span>
          <span className="log-sum-sub">Past due date</span>
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
                  <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>{fmtDate(inv.created_at)}</div>
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

      {/* Invoices List */}
      <div className="deals-table-wrap" style={{ marginTop: '24px' }}>
        <table className="deals-table">
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Status</th>
              <th>Customer</th>
              <th>Payment Date</th>
              <th style={{textAlign:'right'}}>Total</th>
              <th style={{textAlign:'right'}}>Balance Due</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 && (
              <tr><td colSpan={7} style={{textAlign:'center', padding:'30px', color:'var(--text-muted)'}}>No invoices found. Create one above!</td></tr>
            )}
            {invoices.map(inv => {
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
                  <td className="deal-date">{fmtD(inv.issue_date)}</td>
                  <td className="deal-amount" style={{textAlign:'right'}}>{fmtS(inv.total_amount)}</td>
                  <td className="deal-amount" style={{textAlign:'right', color: inv.balance_due > 0 ? '#fb923c' : 'inherit'}}>
                    {fmtS(inv.balance_due)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* New Invoice Modal */}
      {showNew && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowNew(false)}>
          <div className="modal-box" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <div><h2 className="modal-title">New Invoice</h2><p className="modal-sub">Draft a new wholesale invoice</p></div>
              <button className="modal-close" onClick={()=>setShowNew(false)}>&#x2715;</button>
            </div>
            <div className="modal-form">
              <div className="form-group">
                <label className="form-label">Customer / Company Name *</label>
                <input type="text" className="form-input" value={form.customer_name} onChange={e=>setForm(f=>({...f,customer_name:e.target.value}))} />
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

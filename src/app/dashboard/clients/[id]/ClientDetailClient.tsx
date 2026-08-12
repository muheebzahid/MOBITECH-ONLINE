'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getClientImpactAnalysis, deleteClientAccount } from '@/lib/clients/actions'

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

export default function ClientDetailClient({ client }: { client: any }) {
  const router = useRouter()
  const invoices = client.invoices || []
  const [isPending, startTransition] = useTransition()
  
  // Delete Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isLoadingImpact, setIsLoadingImpact] = useState(false)
  const [impactData, setImpactData] = useState<any>(null)
  const [targetClientId, setTargetClientId] = useState('')
  const [deleteError, setDeleteError] = useState('')

  const handleOpenDeleteModal = async () => {
    setIsLoadingImpact(true)
    setDeleteError('')
    try {
      const data = await getClientImpactAnalysis(client.id)
      if (data.error) {
        alert(data.error)
        return
      }
      setImpactData(data)
      setShowDeleteModal(true)
    } catch (err: any) {
      alert(err.message || 'Error fetching client impact audit')
    } finally {
      setIsLoadingImpact(false)
    }
  }

  const handleConfirmDelete = () => {
    const invCount = impactData?.invoices?.length || 0
    if (invCount > 0 && !targetClientId) {
      setDeleteError('Please select a destination client account to transfer all active invoices before deleting.')
      return
    }

    setDeleteError('')
    startTransition(async () => {
      const res = await deleteClientAccount(client.id, targetClientId || undefined)
      if (res.error) {
        setDeleteError(res.error)
      } else {
        setShowDeleteModal(false)
        window.location.href = '/dashboard/clients'
      }
    })
  }

  return (
    <div className="page-root">
      {/* Header */}
      <div className="deal-detail-header" style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="dh-left">
          <Link href="/dashboard/clients" className="dh-back">
            &larr; Back to Client Accounts
          </Link>
          <div className="dh-title-row" style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1 className="page-title" style={{ margin: 0 }}>{client.name}</h1>
            <span style={{ fontSize: '12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              CLIENT ACCOUNT
            </span>
          </div>
        </div>

        <button
          onClick={handleOpenDeleteModal}
          disabled={isLoadingImpact || isPending}
          className="btn-danger"
          style={{
            padding: '10px 18px',
            fontSize: '13px',
            fontWeight: 700,
            background: 'rgba(239, 68, 68, 0.15)',
            color: '#f87171',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span>🗑</span>
          {isLoadingImpact ? 'Auditing Impact...' : 'Delete Client Account'}
        </button>
      </div>

      {/* Summary Metrics Grid */}
      <div className="log-summary-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '24px' }}>
        <div className="log-sum-card log-sum-blue">
          <span className="log-sum-label">Total Invoiced</span>
          <span className="log-sum-value">{fmtS(client.total_billed)}</span>
          <span className="log-sum-sub">All active invoices</span>
        </div>
        <div className="log-sum-card log-sum-green">
          <span className="log-sum-label">Total Paid</span>
          <span className="log-sum-value">{fmtS(client.total_paid)}</span>
          <span className="log-sum-sub">Received payments</span>
        </div>
        <div className="log-sum-card log-sum-orange">
          <span className="log-sum-label">Outstanding Balance</span>
          <span className="log-sum-value" style={{ color: client.total_outstanding > 0 ? 'var(--accent-rose)' : 'inherit' }}>
            {fmtS(client.total_outstanding)}
          </span>
          <span className="log-sum-sub">Balance due</span>
        </div>
        <div className="log-sum-card log-sum-amber">
          <span className="log-sum-label">Invoices Count</span>
          <span className="log-sum-value">{client.invoices_count}</span>
          <span className="log-sum-sub">Draft, issued &amp; paid</span>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="shipment-body-grid">
        
        {/* Client Profile Details */}
        <div className="deal-info-panel" style={{ height: 'fit-content' }}>
          <div className="panel-title">Account Details</div>
          <div className="info-group">
            <div className="info-row">
              <span>Account ID</span>
              <strong style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{client.id}</strong>
            </div>
            <div className="info-row">
              <span>Email Address</span>
              <strong>{client.email || '-'}</strong>
            </div>
            <div className="info-row">
              <span>Phone Number</span>
              <strong>{client.phone || '-'}</strong>
            </div>
            <div className="info-row">
              <span>Billing Address</span>
              <strong style={{ whiteSpace: 'pre-line', textAlign: 'right', maxWidth: '60%' }}>
                {client.address || '-'}
              </strong>
            </div>
            <div className="info-row">
              <span>Created On</span>
              <strong>{fmtD(client.created_at)}</strong>
            </div>
          </div>
        </div>

        {/* Client Invoices List */}
        <div className="deal-history-panel">
          <div className="panel-title">Invoices Account Statements</div>
          {invoices.length === 0 ? (
            <p className="history-empty">No invoices linked to this client account.</p>
          ) : (
            <div className="deals-table-wrap" style={{ border: 'none', background: 'transparent', padding: 0 }}>
              <table className="deals-table" style={{ border: 'none', marginTop: 0 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <th style={{ paddingLeft: '8px' }}>Invoice #</th>
                    <th>Status</th>
                    <th>Issue Date</th>
                    <th>Due Date</th>
                    <th style={{ textAlign: 'right' }}>Qty Sold</th>
                    <th style={{ textAlign: 'right' }}>Total Amount</th>
                    <th style={{ textAlign: 'right' }}>Balance Due</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv: any) => {
                    const statusClass = inv.status === 'PAID' ? 'status-paid' : inv.status === 'DRAFT' ? 'status-draft' : inv.status === 'CANCELLED' ? 'status-cancelled' : 'status-pending'
                    const qty = inv.invoice_line_items ? inv.invoice_line_items.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) : 0
                    return (
                      <tr key={inv.id}>
                        <td style={{ paddingLeft: '8px', fontWeight: 600 }}>
                          <Link href={`/dashboard/sales/${inv.id}`} className="deal-number-link">
                            {inv.invoice_number}
                          </Link>
                        </td>
                        <td>
                          <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)' }} className={statusClass}>
                            {inv.status}
                          </span>
                        </td>
                        <td className="deal-date">{fmtD(inv.issue_date)}</td>
                        <td className="deal-date">{fmtD(inv.due_date)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{qty} units</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtS(inv.total_amount)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: inv.balance_due > 0 && inv.status !== 'CANCELLED' ? 'var(--accent-rose)' : 'inherit' }}>
                          {fmtS(inv.balance_due)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {invoices.length > 0 && (() => {
                  const subQty = invoices.reduce((s: number, i: any) => s + (i.invoice_line_items ? i.invoice_line_items.reduce((ss: number, il: any) => ss + (il.quantity || 0), 0) : 0), 0)
                  const subTotal = invoices.reduce((s: number, i: any) => s + (Number(i.total_amount) || 0), 0)
                  const subDue = invoices.reduce((s: number, i: any) => s + (Number(i.balance_due) || 0), 0)
                  return (
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 'bold', background: 'var(--bg-elevated)' }}>
                        <td colSpan={4} style={{ padding: '12px 8px', color: 'var(--text-muted)', fontSize: '13px', paddingLeft: '8px' }}>
                          Subtotal
                        </td>
                        <td style={{ padding: '12px 8px', textAlign: 'right', fontSize: '13px', fontWeight: 'bold' }}>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>Qty Sold</div>
                          <div>{subQty} units</div>
                        </td>
                        <td style={{ padding: '12px 8px', textAlign: 'right', fontSize: '13px', fontWeight: 'bold' }}>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>Total</div>
                          <div>{fmtS(subTotal)}</div>
                        </td>
                        <td style={{ padding: '12px 8px', textAlign: 'right', fontSize: '13px', fontWeight: 'bold', color: subDue > 0 ? 'var(--accent-rose)' : 'inherit' }}>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>Due</div>
                          <div>{fmtS(subDue)}</div>
                        </td>
                      </tr>
                    </tfoot>
                  )
                })()}
              </table>
            </div>
          )}
        </div>

      </div>

      {/* Delete & Reassignment Modal */}
      {showDeleteModal && impactData && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowDeleteModal(false)}>
          <div className="modal-box" style={{ maxWidth: '680px', width: '90%' }}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title" style={{ color: '#ef4444' }}>Client Account Deletion & Impact Audit</h2>
                <p className="modal-sub">Review affected relationships for client account: <strong>{client.name}</strong></p>
              </div>
              <button className="modal-close" onClick={() => setShowDeleteModal(false)}>&#x2715;</button>
            </div>

            <div className="modal-form" style={{ gap: '20px' }}>
              
              {/* Impact Banner */}
              {impactData.invoices?.length > 0 ? (
                <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#f87171', fontSize: '13.5px' }}>
                  <strong>⚠️ Action Required:</strong> This client account has <strong>{impactData.invoices.length} linked Sales Invoice(s)</strong> and <strong>{impactData.deals?.length || 0} linked Deal(s)</strong>.
                  <br /><span style={{ fontSize: '12px', opacity: 0.9 }}>Deletion will <strong>NOT be successful</strong> unless all linked invoices are re-assigned to another client account below.</span>
                </div>
              ) : (
                <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', color: '#34d399', fontSize: '13.5px' }}>
                  <strong>✅ Safe to Delete:</strong> This client account has no linked invoices or active transactions and can be deleted cleanly.
                </div>
              )}

              {/* Mandatory Destination Selection if Invoices Exist */}
              {impactData.invoices?.length > 0 && (
                <div className="form-group" style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                  <label className="form-label" style={{ color: '#f8fafc', fontWeight: 700, fontSize: '13px' }}>
                    Destination Client Account for Invoice Transfer *
                  </label>
                  <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>
                    Select which active client account will take ownership of all {impactData.invoices.length} linked invoice(s):
                  </p>
                  
                  {impactData.availableClients?.length === 0 ? (
                    <div style={{ color: '#f87171', fontSize: '13px', fontWeight: 600 }}>
                      ❌ Cannot delete: No other client accounts exist in the system to receive these invoices. Please create another client account first.
                    </div>
                  ) : (
                    <select
                      className="form-input"
                      value={targetClientId}
                      onChange={e => setTargetClientId(e.target.value)}
                      style={{ background: '#0f172a', color: '#f8fafc', borderColor: '#475569', fontSize: '13.5px', fontWeight: 600 }}
                      required
                    >
                      <option value="">-- Select Destination Client Account --</option>
                      {impactData.availableClients.map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.email ? `(${c.email})` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Affected Linked Sales Invoices Table */}
              {impactData.invoices?.length > 0 && (
                <div>
                  <h4 style={{ fontSize: '13px', color: '#cbd5e1', marginBottom: '8px' }}>
                    Linked Sales Invoices ({impactData.invoices.length})
                  </h4>
                  <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1px solid #334155', borderRadius: '8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', color: '#cbd5e1' }}>
                      <thead>
                        <tr style={{ background: '#1e293b', borderBottom: '1px solid #334155', textAlign: 'left' }}>
                          <th style={{ padding: '8px 12px' }}>Invoice #</th>
                          <th style={{ padding: '8px 12px' }}>Status</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>Total Amount</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>Balance Due</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {impactData.invoices.map((inv: any) => (
                          <tr key={inv.id} style={{ borderBottom: '1px solid #1e293b' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 600, color: '#f8fafc' }}>{inv.invoice_number}</td>
                            <td style={{ padding: '8px 12px' }}>
                              <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: '#334155', color: '#94a3b8' }}>
                                {inv.status}
                              </span>
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>{fmtS(inv.total_amount)}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', color: inv.balance_due > 0 ? '#f43f5e' : 'inherit' }}>{fmtS(inv.balance_due)}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                              <a href={`/dashboard/sales/${inv.id}`} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', textDecoration: 'none', fontSize: '11px', fontWeight: 600 }}>
                                Open Invoice ↗
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Affected Linked Deals Table */}
              {impactData.deals?.length > 0 && (
                <div>
                  <h4 style={{ fontSize: '13px', color: '#cbd5e1', marginBottom: '8px' }}>
                    Linked Purchase Deals ({impactData.deals.length})
                  </h4>
                  <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid #334155', borderRadius: '8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', color: '#cbd5e1' }}>
                      <thead>
                        <tr style={{ background: '#1e293b', borderBottom: '1px solid #334155', textAlign: 'left' }}>
                          <th style={{ padding: '8px 12px' }}>Deal #</th>
                          <th style={{ padding: '8px 12px' }}>Model</th>
                          <th style={{ padding: '8px 12px' }}>Supplier</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {impactData.deals.map((d: any) => (
                          <tr key={d.id} style={{ borderBottom: '1px solid #1e293b' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 600, color: '#f8fafc' }}>{d.deal_number}</td>
                            <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{d.model}</td>
                            <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{d.supplier || '—'}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                              <a href={`/dashboard/deals/${d.id}`} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', textDecoration: 'none', fontSize: '11px', fontWeight: 600 }}>
                                Open Deal ↗
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {deleteError && (
                <div style={{ color: '#f87171', fontSize: '13px', background: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                  ⚠️ {deleteError}
                </div>
              )}

              {/* Modal Actions */}
              <div className="modal-actions" style={{ marginTop: '10px' }}>
                <button type="button" className="btn-ghost" onClick={() => setShowDeleteModal(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={handleConfirmDelete}
                  disabled={isPending || (impactData.invoices?.length > 0 && !targetClientId)}
                  style={{
                    background: (impactData.invoices?.length > 0 && !targetClientId) ? '#334155' : 'linear-gradient(135deg, #ef4444, #dc2626)',
                    color: '#ffffff',
                    border: 'none',
                    padding: '10px 20px',
                    fontWeight: 700,
                    borderRadius: '8px',
                    cursor: (impactData.invoices?.length > 0 && !targetClientId) ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isPending ? 'Processing...' : (impactData.invoices?.length > 0 ? 'Reassign Invoices & Delete Account' : 'Permanently Delete Client Account')}
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  )
}

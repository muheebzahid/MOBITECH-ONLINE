'use client'

import { useState, useTransition } from 'react'
import { updateUserRole, addMember, deleteMember } from '@/lib/admin/actions'
import { generateOnlineBackup } from '@/lib/backup/actions'
import UpdateLiveSyncModal from '@/components/sync/UpdateLiveSyncModal'
import { useRole } from '@/components/RoleProvider'

interface Props {
  users: any[]
  pendingInvoices?: any[]
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function AdminClient({ users }: Props) {
  const currentRole = useRole()
  const [isPending, startTransition] = useTransition()
  const [isBackupPending, startBackupTransition] = useTransition()

  // Sync Audit State
  const [isAuditing, setIsAuditing] = useState(false)
  const [auditData, setAuditData] = useState<any>(null)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [selectedDealsToSync, setSelectedDealsToSync] = useState<string[]>([])
  const [showSyncModal, setShowSyncModal] = useState(false)
  const [activeModuleTab, setActiveModuleTab] = useState<'deals' | 'clients' | 'invoices' | 'shipments' | 'payments' | 'inventory' | 'online_orders' | 'expenses'>('deals')

  const handleRunAudit = async () => {
    setIsAuditing(true)
    setAuditError(null)
    try {
      const res = await fetch('/api/sync/admin/compare')
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || 'Failed to compare online data')
      }
      setAuditData(data)
      // Default select all unsynced deals
      setSelectedDealsToSync(data.unsynced_deal_ids || [])
    } catch (err: any) {
      setAuditError(err.message || 'Error executing sync audit')
    } finally {
      setIsAuditing(false)
    }
  }

  const handleBackup = () => {
    if (currentRole === 'VIEW_ONLY') return
    startBackupTransition(async () => {
      const res = await generateOnlineBackup()
      if (res.error) {
        alert('Backup failed: ' + res.error)
      } else if (res.success && res.data && res.filename) {
        // Trigger browser download
        const blob = new Blob([res.data], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = res.filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        alert('✅ Online ERP Backup downloaded successfully!')
      }
    })
  }

  // Add Member State
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState({ email: '', password: '', role: 'SALES' })
  const [addError, setAddError] = useState('')

  // Remove Member State
  const [memberToRemove, setMemberToRemove] = useState<any>(null)

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (currentRole === 'VIEW_ONLY') return
    startTransition(async () => {
      await updateUserRole(userId, newRole as any)
    })
  }

  const confirmDeleteMember = async () => {
    if (currentRole === 'VIEW_ONLY') return
    if (!memberToRemove) return
    startTransition(async () => {
      const res = await deleteMember(memberToRemove.user_id)
      if (res.error) {
        alert(res.error)
      } else {
        alert('✅ Member removed successfully.')
        setMemberToRemove(null)
      }
    })
  }

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (currentRole === 'VIEW_ONLY') return
    setAddError('')
    startTransition(async () => {
      const fd = new FormData()
      fd.append('email', addForm.email)
      fd.append('password', addForm.password)
      fd.append('role', addForm.role)
      const res = await addMember(fd)
      if (res.error) {
        setAddError(res.error)
      } else {
        setShowAddForm(false)
        setAddForm({ email: '', password: '', role: 'SALES' })
      }
    })
  }

  const toggleSelectAllDeals = () => {
    if (!auditData?.unsynced_deal_ids) return
    if (selectedDealsToSync.length === auditData.unsynced_deal_ids.length) {
      setSelectedDealsToSync([])
    } else {
      setSelectedDealsToSync(auditData.unsynced_deal_ids)
    }
  }

  const toggleSelectDeal = (id: string) => {
    setSelectedDealsToSync(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  return (
    <div className="page-root">
      <div className="page-header" style={{ marginBottom: '32px' }}>
        <div>
          <h1 className="page-title">Super Admin Dashboard</h1>
          <p className="page-sub">System governance, database backups, and online live sync management.</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        
        {/* ── SYNC AUDIT & COMPARISON CENTER ── */}
        <div className="panel" style={{ padding: '24px', background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95))', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '14px', boxShadow: '0 10px 25px rgba(0,0,0,0.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>⚡</span>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc', margin: 0 }}>Online ERP Sync & Data Comparison Audit</h2>
                <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px', background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.4)' }}>
                  Target: aivcmkwclfipntadipec (the-workflows.com)
                </span>
              </div>
              <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '6px' }}>
                Compare local hosted ERP records against Online Production Cloud ERP across all modules (Accounts, Deals, Invoices, Shipments, Payments, Inventory).
              </p>
            </div>

            <button
              onClick={handleRunAudit}
              disabled={isAuditing}
              style={{
                padding: '12px 24px',
                fontSize: '14px',
                fontWeight: 700,
                background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                cursor: isAuditing ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
                opacity: isAuditing ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <span>🔍</span>
              {isAuditing ? 'Auditing Cloud & Local Data...' : 'Audit & Compare Online Data'}
            </button>
          </div>

          {auditError && (
            <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#f87171', fontSize: '13.5px', marginBottom: '20px' }}>
              <strong>Audit Error:</strong> {auditError}
            </div>
          )}

          {auditData && (
            <div style={{ marginTop: '16px' }}>
              {/* Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(30, 41, 59, 0.7)', border: '1px solid #334155' }}>
                  <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>Total Local Records</div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#f8fafc', marginTop: '4px' }}>{auditData.summary.total_local_records}</div>
                </div>

                <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(244, 63, 94, 0.12)', border: '1px solid rgba(244, 63, 94, 0.3)' }}>
                  <div style={{ fontSize: '12px', color: '#fb7185', fontWeight: 600 }}>Missing Online</div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#f43f5e', marginTop: '4px' }}>{auditData.summary.total_missing_online}</div>
                </div>

                <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                  <div style={{ fontSize: '12px', color: '#fbbf24', fontWeight: 600 }}>Out of Date Online</div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#f59e0b', marginTop: '4px' }}>{auditData.summary.total_out_of_date}</div>
                </div>

                <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                  <div style={{ fontSize: '12px', color: '#34d399', fontWeight: 600 }}>Synced & Matching</div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>{auditData.summary.total_synced_online}</div>
                </div>
              </div>

              {/* Module Tabs */}
              <div style={{ display: 'flex', gap: '10px', borderBottom: '1px solid #334155', paddingBottom: '12px', marginBottom: '16px', overflowX: 'auto' }}>
                {[
                  { key: 'deals', label: 'Deals', count: auditData.modules.deals.missing + auditData.modules.deals.outOfDate },
                  { key: 'clients', label: 'Accounts / Clients', count: auditData.modules.clients.missing + auditData.modules.clients.outOfDate },
                  { key: 'invoices', label: 'Sales Invoices', count: auditData.modules.invoices.missing + auditData.modules.invoices.outOfDate },
                  { key: 'shipments', label: 'Shipments', count: auditData.modules.shipments.missing + auditData.modules.shipments.outOfDate },
                  { key: 'payments', label: 'Payments', count: auditData.modules.payments.missing + auditData.modules.payments.outOfDate },
                  { key: 'inventory', label: 'Inventory Items', count: auditData.modules.inventory.missing + auditData.modules.inventory.outOfDate },
                  { key: 'online_orders', label: 'Online Orders', count: auditData.modules.online_orders.missing + auditData.modules.online_orders.outOfDate },
                  { key: 'expenses', label: 'Expenses', count: (auditData.modules.expenses?.missing || 0) + (auditData.modules.expenses?.outOfDate || 0) }
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveModuleTab(tab.key as any)}
                    style={{
                      padding: '8px 16px',
                      fontSize: '13px',
                      fontWeight: 600,
                      borderRadius: '8px',
                      border: 'none',
                      background: activeModuleTab === tab.key ? '#3b82f6' : '#1e293b',
                      color: activeModuleTab === tab.key ? '#fff' : '#94a3b8',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>{tab.label}</span>
                    {tab.count > 0 && (
                      <span style={{ fontSize: '10px', background: activeModuleTab === tab.key ? '#1d4ed8' : '#334155', color: '#f8fafc', padding: '2px 6px', borderRadius: '10px' }}>
                        {tab.count} unsynced
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Unsynced Table */}
              <div style={{ background: '#0f172a', borderRadius: '10px', border: '1px solid #1e293b', padding: '16px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ margin: 0, fontSize: '14px', color: '#f8fafc' }}>
                    Unsynced & Desynced Items for Module: <span style={{ color: '#60a5fa', textTransform: 'uppercase' }}>{activeModuleTab}</span>
                  </h4>

                  {auditData.unsynced_deal_ids?.length > 0 && currentRole !== 'VIEW_ONLY' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <button
                        onClick={toggleSelectAllDeals}
                        style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 600, background: '#1e293b', color: '#cbd5e1', border: '1px solid #334155', borderRadius: '6px', cursor: 'pointer' }}
                      >
                        {selectedDealsToSync.length === auditData.unsynced_deal_ids.length ? 'Deselect All Deals' : 'Select All Unsynced Deals'}
                      </button>

                      <button
                        onClick={() => setShowSyncModal(true)}
                        disabled={selectedDealsToSync.length === 0}
                        style={{
                          padding: '8px 18px',
                          fontSize: '13px',
                          fontWeight: 700,
                          background: selectedDealsToSync.length > 0 ? 'linear-gradient(135deg, #10b981, #059669)' : '#334155',
                          color: selectedDealsToSync.length > 0 ? '#ffffff' : '#64748b',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: selectedDealsToSync.length > 0 ? 'pointer' : 'not-allowed'
                        }}
                      >
                        ⚡ Upload Selected Live ({selectedDealsToSync.length} Deals)
                      </button>
                    </div>
                  )}
                </div>

                {auditData.modules[activeModuleTab]?.items?.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#10b981', fontSize: '14px', fontWeight: 500 }}>
                    ✅ All records in {activeModuleTab} are 100% up to date in the Online Cloud ERP!
                  </div>
                ) : (
                  <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', color: '#cbd5e1' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #1e293b', color: '#64748b', textAlign: 'left' }}>
                          <th style={{ padding: '10px 8px', width: '40px' }}>Select</th>
                          <th style={{ padding: '10px 8px', width: '220px' }}>Identifier / Record Link</th>
                          <th style={{ padding: '10px 8px' }}>Exact Unsynced Field Details</th>
                          <th style={{ padding: '10px 8px', width: '130px' }}>Issue Type</th>
                          <th style={{ padding: '10px 8px', width: '150px' }}>Updated Local Date</th>
                          <th style={{ padding: '10px 8px', width: '110px', textAlign: 'right' }}>Manual Check</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditData.modules[activeModuleTab].items.map((item: any) => {
                          const dealId = item.deal_id || item.id
                          const isSelected = selectedDealsToSync.includes(dealId)
                          const itemName = item.deal_number || item.invoice_number || item.shipment_number || item.order_number || item.name || item.imei || item.id

                          return (
                            <tr key={item.id} style={{ borderBottom: '1px solid #1e293b' }}>
                              <td style={{ padding: '10px 8px' }}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelectDeal(dealId)}
                                  disabled={activeModuleTab !== 'deals' || currentRole === 'VIEW_ONLY'}
                                />
                              </td>
                              <td style={{ padding: '10px 8px', fontWeight: 600, color: '#f8fafc' }}>
                                {itemName}
                              </td>
                              <td style={{ padding: '10px 8px', color: '#94a3b8', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '12px' }}>
                                {item.diff_detail || 'Record is missing entirely on online cloud DB.'}
                              </td>
                              <td style={{ padding: '10px 8px' }}>
                                <span style={{
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  background: item.type === 'missing' ? 'rgba(244, 63, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                  color: item.type === 'missing' ? '#fb7185' : '#fbbf24'
                                }}>
                                  {item.type === 'missing' ? 'MISSING' : 'OUT_OF_DATE'}
                                </span>
                              </td>
                              <td style={{ padding: '10px 8px', color: '#64748b' }}>
                                {fmtDate(item.updated_at || item.created_at)}
                              </td>
                              <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                                <a
                                  href={`/dashboard/${activeModuleTab === 'deals' ? 'deals' : activeModuleTab === 'invoices' ? 'sales' : activeModuleTab === 'inventory' ? 'inventory' : activeModuleTab}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    fontSize: '12px',
                                    color: '#60a5fa',
                                    textDecoration: 'none',
                                    fontWeight: 600,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                  }}
                                >
                                  Inspect ↗
                                </a>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── USER ROLES & MEMBERS ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '32px' }}>
          
          <div className="panel" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 600 }}>Team Members</h2>
              {currentRole !== 'VIEW_ONLY' && (
                <button className="btn-primary" onClick={() => setShowAddForm(!showAddForm)}>
                  + Add Member
                </button>
              )}
            </div>
            
            {showAddForm && (
              <form onSubmit={handleAddMember} style={{ padding: '16px', background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 500, marginBottom: '12px' }}>Create New Account</h3>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                  <input 
                    type="email" 
                    className="form-input" 
                    placeholder="Email" 
                    value={addForm.email} 
                    onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                    required 
                  />
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Default Password" 
                    value={addForm.password} 
                    onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))}
                    required 
                    minLength={6}
                  />
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <select 
                    className="form-input" 
                    value={addForm.role}
                    onChange={e => setAddForm(f => ({ ...f, role: e.target.value }))}
                  >
                    <option value="SALES">Sales</option>
                    <option value="LOGISTICS">Logistics</option>
                    <option value="FINANCE">Finance</option>
                    <option value="SUPER_ADMIN">Super Admin</option>
                    <option value="VIEW_ONLY">View Only</option>
                  </select>
                  <button type="submit" className="btn-primary" disabled={isPending}>
                    {isPending ? 'Saving...' : 'Create Account'}
                  </button>
                </div>
                {addError && <div style={{ color: 'var(--accent-red)', fontSize: '13px', marginTop: '8px' }}>{addError}</div>}
              </form>
            )}

            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
              {users.map(u => (
                <div key={u.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{u.email}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Joined {fmtDate(u.created_at)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <select 
                      className="form-input" 
                      style={{ width: 'auto', padding: '6px 12px', height: 'auto' }}
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      disabled={isPending || u.email === 'muheebzahid@gmail.com' || currentRole === 'VIEW_ONLY'}
                    >
                      <option value="SUPER_ADMIN">Super Admin</option>
                      <option value="SALES">Sales</option>
                      <option value="LOGISTICS">Logistics</option>
                      <option value="FINANCE">Finance</option>
                      <option value="VIEW_ONLY">View Only</option>
                    </select>
                    {u.email !== 'muheebzahid@gmail.com' && currentRole !== 'VIEW_ONLY' && (
                      <button 
                        onClick={() => setMemberToRemove(u)}
                        disabled={isPending}
                        className="btn-danger"
                        style={{ 
                          padding: '6px 12px', 
                          background: 'transparent',
                          border: '1px solid var(--accent-red)',
                          color: 'var(--accent-red)',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: 500,
                          opacity: isPending ? 0.5 : 1
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Database Backup Panel */}
          <div className="panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 'fit-content' }}>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Online Database Backups</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: '1.6', marginBottom: '24px' }}>
                Create a secure backup of your entire Online ERP database. This fetches all tables (deals, inventory, shipments, invoices, payments, partners, expenses) directly from the-workflows.com and downloads it to your browser.
              </p>
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Backup Type:</span>
                  <span style={{ fontWeight: 500, color: 'var(--text-normal)' }}>Online ERP Backup</span>
                  
                  <span style={{ color: 'var(--text-muted)' }}>Backup Source:</span>
                  <span style={{ fontWeight: 500, color: 'var(--text-normal)' }}>the-workflows.com</span>
                  
                  <span style={{ color: 'var(--text-muted)' }}>Destination:</span>
                  <span style={{ fontWeight: 500, color: 'var(--text-normal)' }}>Browser Download</span>
                </div>
              </div>
            </div>
            
            <button 
              onClick={handleBackup} 
              disabled={isBackupPending || currentRole === 'VIEW_ONLY'}
              className="btn-primary" 
              style={{ 
                width: '100%', 
                background: 'linear-gradient(135deg, #0d9488, #2563eb)',
                color: 'white', 
                border: 'none',
                padding: '12px',
                fontWeight: 600,
                fontSize: '14px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                opacity: isBackupPending ? 0.7 : 1
              }}
            >
              <span>☁️</span>
              {isBackupPending ? 'Generating Online Backup...' : 'Download Online Backup'}
            </button>
          </div>

        </div>
      </div>

      {/* Remove Member Modal */}
      {memberToRemove && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999
        }}>
          <div style={{
            background: 'var(--bg-panel)', padding: '24px', borderRadius: '8px', 
            border: '1px solid var(--border)', width: '100%', maxWidth: '400px'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: 'var(--accent-red)' }}>Remove Team Member</h3>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Are you sure you want to remove this team member? Their access will be revoked but business records will be preserved.
            </p>
            
            <div style={{ background: 'var(--bg-elevated)', padding: '16px', borderRadius: '6px', marginBottom: '24px', fontSize: '13px' }}>
              <div style={{ marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Email:</span> <span style={{ fontWeight: 500 }}>{memberToRemove.email}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Current Role:</span> <span style={{ fontWeight: 500 }}>{memberToRemove.role}</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button 
                onClick={() => setMemberToRemove(null)}
                className="btn-secondary"
                disabled={isPending}
                style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-normal)', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button 
                onClick={confirmDeleteMember}
                className="btn-danger"
                disabled={isPending}
                style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: 'var(--accent-red)', color: '#fff', cursor: 'pointer' }}
              >
                {isPending ? 'Removing...' : 'Remove Member'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync Execution Modal */}
      {showSyncModal && selectedDealsToSync.length > 0 && (
        <UpdateLiveSyncModal
          dealIds={selectedDealsToSync}
          isOpen={showSyncModal}
          onClose={() => {
            setShowSyncModal(false)
            handleRunAudit() // Refresh audit on close
          }}
        />
      )}
    </div>
  )
}

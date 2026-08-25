'use client'

import { useState, useTransition } from 'react'
import { updateUserRole, addMember, deleteMember } from '@/lib/admin/actions'
import { generateOnlineBackup } from '@/lib/backup/actions'
import { useRole } from '@/components/RoleProvider'

interface Props {
  users: any[]
  pendingInvoices?: any[]
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' })
}

const MODULE_TABS = [
  { key: 'deals', label: 'Deals' },
  { key: 'clients', label: 'Clients' },
  { key: 'invoices', label: 'Sales & Invoices' },
  { key: 'payments', label: 'Payments' },
  { key: 'logistics', label: 'Logistics' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'online_sales', label: 'Online Sales' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'partners', label: 'Partners' },
  { key: 'treasury', label: 'Treasury' },
]

export default function AdminClient({ users }: Props) {
  const currentRole = useRole()
  const [isPending, startTransition] = useTransition()
  const [isBackupPending, startBackupTransition] = useTransition()

  // Sync Audit State
  const [isAuditing, setIsAuditing] = useState(false)
  const [auditData, setAuditData] = useState<any>(null)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [activeModuleTab, setActiveModuleTab] = useState('deals')

  // Sync Execution State
  const [showSyncConfirm, setShowSyncConfirm] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<any>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  const handleRunAudit = async () => {
    setIsAuditing(true)
    setAuditError(null)
    setSyncResult(null)
    setSyncError(null)
    try {
      const res = await fetch('/api/sync/admin/compare')
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || 'Failed to compare online data')
      }
      setAuditData(data)
    } catch (err: any) {
      setAuditError(err.message || 'Error executing sync audit')
    } finally {
      setIsAuditing(false)
    }
  }

  const handleExecuteFullSync = async () => {
    setIsSyncing(true)
    setSyncError(null)
    try {
      const res = await fetch('/api/sync/admin/execute', { method: 'POST' })
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || 'Sync execution failed')
      }
      setSyncResult(data)
      setShowSyncConfirm(false)
      // Re-run audit to show updated state
      await handleRunAudit()
    } catch (err: any) {
      setSyncError(err.message || 'Sync execution error')
    } finally {
      setIsSyncing(false)
    }
  }

  const handleBackup = () => {
    if (currentRole === 'VIEW_ONLY') return
    startBackupTransition(async () => {
      const res = await generateOnlineBackup()
      if (res.error) {
        alert('Backup failed: ' + res.error)
      } else if (res.success && res.data && res.filename) {
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

  // Helper to get module data
  const getModuleData = (key: string) => auditData?.modules?.[key] || { missing: 0, outOfDate: 0, extraOnline: 0, synced: 0, items: [] }
  const getModuleChangeCount = (key: string) => {
    const m = getModuleData(key)
    return m.missing + m.outOfDate + m.extraOnline
  }

  const totalChanges = auditData?.summary?.total_changes_required || 0

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
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc', margin: 0 }}>Full Mirror Sync — Master ERP → Online Cloud</h2>
                <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px', background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.4)' }}>
                  Target: aivcmkwclfipntadipec (the-workflows.com)
                </span>
              </div>
              <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '6px' }}>
                Audits ALL modules and entries across the entire ERP. Shows exactly what will be created, updated, or deleted on the online cloud before you approve.
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
                gap: '8px',
                whiteSpace: 'nowrap'
              }}
            >
              <span>🔍</span>
              {isAuditing ? 'Auditing All Modules...' : 'Audit & Compare Online Data'}
            </button>
          </div>

          {auditError && (
            <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#f87171', fontSize: '13.5px', marginBottom: '20px' }}>
              <strong>Audit Error:</strong> {auditError}
            </div>
          )}

          {/* Sync Success Banner */}
          {syncResult && (
            <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.4)', color: '#34d399', fontSize: '13.5px', marginBottom: '20px' }}>
              <strong>✅ Full Mirror Sync Completed!</strong> Upserted {syncResult.total_upserted} records, deleted {syncResult.total_deleted} orphans.
              {syncResult.total_errors > 0 && <span style={{ color: '#fbbf24' }}> ({syncResult.total_errors} errors encountered)</span>}
            </div>
          )}

          {syncError && (
            <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#f87171', fontSize: '13.5px', marginBottom: '20px' }}>
              <strong>Sync Error:</strong> {syncError}
            </div>
          )}

          {auditData && (
            <div style={{ marginTop: '16px' }}>
              {/* Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '14px', marginBottom: '24px' }}>
                <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(30, 41, 59, 0.7)', border: '1px solid #334155' }}>
                  <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>Total Local Records</div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#f8fafc', marginTop: '4px' }}>{auditData.summary.total_local_records}</div>
                </div>

                <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(244, 63, 94, 0.12)', border: '1px solid rgba(244, 63, 94, 0.3)' }}>
                  <div style={{ fontSize: '12px', color: '#fb7185', fontWeight: 600 }}>Missing Online (Create)</div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#f43f5e', marginTop: '4px' }}>{auditData.summary.total_missing_online}</div>
                </div>

                <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                  <div style={{ fontSize: '12px', color: '#fbbf24', fontWeight: 600 }}>Out of Date (Update)</div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#f59e0b', marginTop: '4px' }}>{auditData.summary.total_out_of_date}</div>
                </div>

                <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
                  <div style={{ fontSize: '12px', color: '#c084fc', fontWeight: 600 }}>Extra Online (Delete)</div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#a855f7', marginTop: '4px' }}>{auditData.summary.total_extra_online}</div>
                </div>

                <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                  <div style={{ fontSize: '12px', color: '#34d399', fontWeight: 600 }}>Synced & Matching</div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>{auditData.summary.total_synced}</div>
                </div>
              </div>

              {/* Module Tabs */}
              <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #334155', paddingBottom: '12px', marginBottom: '16px', overflowX: 'auto', flexWrap: 'wrap' }}>
                {MODULE_TABS.map(tab => {
                  const changeCount = getModuleChangeCount(tab.key)
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveModuleTab(tab.key)}
                      style={{
                        padding: '8px 14px',
                        fontSize: '13px',
                        fontWeight: 600,
                        borderRadius: '8px',
                        border: 'none',
                        background: activeModuleTab === tab.key ? '#3b82f6' : '#1e293b',
                        color: activeModuleTab === tab.key ? '#fff' : '#94a3b8',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <span>{tab.label}</span>
                      {changeCount > 0 && (
                        <span style={{ fontSize: '10px', background: activeModuleTab === tab.key ? '#1d4ed8' : '#334155', color: '#f8fafc', padding: '2px 6px', borderRadius: '10px' }}>
                          {changeCount}
                        </span>
                      )}
                      {changeCount === 0 && (
                        <span style={{ fontSize: '10px', color: '#10b981' }}>✓</span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Audit Items Table */}
              <div style={{ background: '#0f172a', borderRadius: '10px', border: '1px solid #1e293b', padding: '16px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ margin: 0, fontSize: '14px', color: '#f8fafc' }}>
                    Differences for: <span style={{ color: '#60a5fa', textTransform: 'capitalize' }}>{MODULE_TABS.find(t => t.key === activeModuleTab)?.label}</span>
                    <span style={{ color: '#64748b', fontWeight: 400, marginLeft: '8px', fontSize: '12px' }}>
                      ({getModuleData(activeModuleTab).total_local || 0} local / {getModuleData(activeModuleTab).total_online || 0} online)
                    </span>
                  </h4>

                  {totalChanges > 0 && currentRole === 'SUPER_ADMIN' && (
                    <button
                      onClick={() => setShowSyncConfirm(true)}
                      disabled={isSyncing}
                      style={{
                        padding: '10px 20px',
                        fontSize: '13px',
                        fontWeight: 700,
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: isSyncing ? 'not-allowed' : 'pointer',
                        boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      ⚡ Mirror All to Cloud ({totalChanges} changes)
                    </button>
                  )}
                </div>

                {getModuleData(activeModuleTab).items?.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#10b981', fontSize: '14px', fontWeight: 500 }}>
                    ✅ All records in this module are 100% up to date in the Online Cloud ERP!
                  </div>
                ) : (
                  <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', color: '#cbd5e1' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #1e293b', color: '#64748b', textAlign: 'left' }}>
                          <th style={{ padding: '10px 8px', width: '140px' }}>Table</th>
                          <th style={{ padding: '10px 8px', width: '200px' }}>Identifier</th>
                          <th style={{ padding: '10px 8px' }}>Details</th>
                          <th style={{ padding: '10px 8px', width: '120px' }}>Issue</th>
                          <th style={{ padding: '10px 8px', width: '120px' }}>Action Preview</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getModuleData(activeModuleTab).items.map((item: any) => (
                          <tr key={`${item.table}-${item.id}`} style={{ borderBottom: '1px solid #1e293b' }}>
                            <td style={{ padding: '10px 8px', color: '#64748b', fontSize: '11px' }}>
                              {item.table}
                            </td>
                            <td style={{ padding: '10px 8px', fontWeight: 600, color: '#f8fafc' }}>
                              {item.identifier}
                            </td>
                            <td style={{ padding: '10px 8px', color: '#94a3b8', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '11.5px', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {item.diff_detail}
                            </td>
                            <td style={{ padding: '10px 8px' }}>
                              <span style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                padding: '2px 8px',
                                borderRadius: '6px',
                                background: item.issue === 'MISSING_ONLINE'
                                  ? 'rgba(244, 63, 94, 0.15)'
                                  : item.issue === 'EXTRA_ONLINE'
                                  ? 'rgba(168, 85, 247, 0.15)'
                                  : 'rgba(245, 158, 11, 0.15)',
                                color: item.issue === 'MISSING_ONLINE'
                                  ? '#fb7185'
                                  : item.issue === 'EXTRA_ONLINE'
                                  ? '#c084fc'
                                  : '#fbbf24'
                              }}>
                                {item.issue === 'MISSING_ONLINE' ? 'MISSING' : item.issue === 'EXTRA_ONLINE' ? 'EXTRA' : 'OUTDATED'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 8px', fontSize: '11px', color: item.issue === 'EXTRA_ONLINE' ? '#c084fc' : item.issue === 'MISSING_ONLINE' ? '#34d399' : '#fbbf24' }}>
                              {item.action_preview}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Per-table breakdown */}
              {auditData.tables && (
                <div style={{ background: '#0f172a', borderRadius: '10px', border: '1px solid #1e293b', padding: '16px' }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: '14px', color: '#f8fafc' }}>Per-Table Summary</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
                    {auditData.tables.map((t: any) => {
                      const changes = t.missing + t.outOfDate + t.extraOnline
                      return (
                        <div
                          key={t.table}
                          style={{
                            padding: '10px 12px',
                            borderRadius: '8px',
                            background: changes > 0 ? 'rgba(245, 158, 11, 0.06)' : 'rgba(16, 185, 129, 0.06)',
                            border: `1px solid ${changes > 0 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)'}`,
                            fontSize: '12px'
                          }}
                        >
                          <div style={{ fontWeight: 600, color: '#f8fafc', marginBottom: '4px' }}>{t.displayName}</div>
                          <div style={{ color: '#64748b', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <span>{t.total_local} local</span>
                            {t.missing > 0 && <span style={{ color: '#fb7185' }}>+{t.missing} create</span>}
                            {t.outOfDate > 0 && <span style={{ color: '#fbbf24' }}>~{t.outOfDate} update</span>}
                            {t.extraOnline > 0 && <span style={{ color: '#c084fc' }}>-{t.extraOnline} delete</span>}
                            {changes === 0 && <span style={{ color: '#10b981' }}>✓ synced</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
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

      {/* ── FULL SYNC CONFIRMATION MODAL ── */}
      {showSyncConfirm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(3, 7, 18, 0.85)', backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '24px'
        }}
        onClick={e => { if (e.target === e.currentTarget && !isSyncing) setShowSyncConfirm(false) }}
        >
          <div style={{
            width: '100%', maxWidth: '680px',
            backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '20px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            overflow: 'hidden', color: '#f8fafc'
          }}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #1e293b', background: 'linear-gradient(to right, #0f172a, #0b1120)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>⚠️</div>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 800 }}>Confirm Full Mirror Sync</div>
                  <div style={{ fontSize: '12.5px', color: '#94a3b8', marginTop: '2px' }}>
                    This will make Online ERP identical to Master ERP
                  </div>
                </div>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '24px' }}>
              <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', marginBottom: '20px', fontSize: '13px', color: '#fbbf24', lineHeight: '1.6' }}>
                <strong>⚠️ Warning:</strong> This action will overwrite the online cloud ERP to exactly match your local master ERP. Records only in the cloud will be deleted. This cannot be undone.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
                <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#10b981' }}>{auditData?.summary?.total_missing_online || 0}</div>
                  <div style={{ fontSize: '11px', color: '#34d399', fontWeight: 600 }}>Records to CREATE</div>
                </div>
                <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#f59e0b' }}>{auditData?.summary?.total_out_of_date || 0}</div>
                  <div style={{ fontSize: '11px', color: '#fbbf24', fontWeight: 600 }}>Records to UPDATE</div>
                </div>
                <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#ef4444' }}>{auditData?.summary?.total_extra_online || 0}</div>
                  <div style={{ fontSize: '11px', color: '#f87171', fontWeight: 600 }}>Records to DELETE</div>
                </div>
              </div>

              <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '4px' }}>
                Master ERP has <strong style={{ color: '#f8fafc' }}>{auditData?.summary?.total_local_records || 0}</strong> records across all {auditData?.tables?.length || 0} tables.
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between' }}>
              <button
                onClick={() => setShowSyncConfirm(false)}
                disabled={isSyncing}
                style={{ padding: '10px 20px', fontSize: '13px', fontWeight: 600, background: '#1e293b', color: '#cbd5e1', border: '1px solid #334155', borderRadius: '8px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteFullSync}
                disabled={isSyncing}
                style={{
                  padding: '10px 24px', fontSize: '14px', fontWeight: 700,
                  background: isSyncing ? '#334155' : 'linear-gradient(135deg, #dc2626, #b91c1c)',
                  color: '#fff', border: 'none', borderRadius: '8px',
                  cursor: isSyncing ? 'not-allowed' : 'pointer',
                  boxShadow: isSyncing ? 'none' : '0 4px 14px rgba(220, 38, 38, 0.4)',
                  display: 'flex', alignItems: 'center', gap: '8px'
                }}
              >
                {isSyncing ? (
                  <>🔄 Syncing All Tables...</>
                ) : (
                  <>🔥 Confirm & Mirror to Cloud</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

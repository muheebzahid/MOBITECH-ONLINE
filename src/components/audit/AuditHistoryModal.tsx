'use client'

import { useState } from 'react'
import { type AuditLogItem } from '@/lib/audit/actions'

interface Props {
  isOpen: boolean
  onClose: () => void
  logs: AuditLogItem[]
  title?: string
}

function fmtDate(d: string) {
  if (!d) return '-'
  return new Date(d).toLocaleString('en-AE', { 
    day: '2-digit', 
    month: 'short', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  })
}

export default function AuditHistoryModal({ isOpen, onClose, logs, title = 'Module Edit History' }: Props) {
  const [searchTerm, setSearchTerm] = useState('')

  if (!isOpen) return null

  const filteredLogs = logs.filter(log => {
    if (!searchTerm) return true
    const q = searchTerm.toLowerCase()
    const userEmail = (log.new_data?._user?.email || log.old_data?._user?.email || '').toLowerCase()
    const userRole = (log.new_data?._user?.role || log.old_data?._user?.role || '').toLowerCase()
    const action = (log.action || '').toLowerCase()
    const table = (log.table_name || '').toLowerCase()
    return userEmail.includes(q) || userRole.includes(q) || action.includes(q) || table.includes(q)
  })

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-box" style={{ maxWidth: '850px', width: '95%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        
        {/* Header */}
        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📜 {title}
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Complete audit trail showing past vs present entries, email IDs, and user roles
            </p>
          </div>
          <button 
            className="btn-ghost" 
            onClick={onClose}
            style={{ fontSize: '18px', padding: '4px 12px' }}
          >
            ✕
          </button>
        </div>

        {/* Search Bar */}
        <div style={{ padding: '16px 20px 8px' }}>
          <input 
            type="text" 
            className="form-input" 
            placeholder="Search by user email, role, or action..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        {/* Log List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filteredLogs.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔍</div>
              <p style={{ fontSize: '14px' }}>No audit log history recorded yet for this selection.</p>
            </div>
          ) : (
            filteredLogs.map(log => {
              const userMeta = log.new_data?._user || log.old_data?._user || { email: 'system@mobitech.com', role: 'SYSTEM' }
              const oldKeys = Object.keys(log.old_data || {}).filter(k => k !== '_user')
              const newKeys = Object.keys(log.new_data || {}).filter(k => k !== '_user')
              const allKeys = Array.from(new Set([...oldKeys, ...newKeys]))

              return (
                <div 
                  key={log.id} 
                  style={{ 
                    background: 'var(--bg-surface)', 
                    border: '1px solid var(--border)', 
                    borderRadius: '10px', 
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}
                >
                  {/* Top Bar: Action, Timestamp, User */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span 
                        style={{ 
                          padding: '4px 10px', 
                          borderRadius: '6px', 
                          fontSize: '11px', 
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          background: log.action === 'CREATE' ? 'rgba(16, 185, 129, 0.15)' : log.action === 'DELETE' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                          color: log.action === 'CREATE' ? '#34d399' : log.action === 'DELETE' ? '#f87171' : '#818cf8',
                          border: `1px solid ${log.action === 'CREATE' ? 'rgba(16, 185, 129, 0.3)' : log.action === 'DELETE' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(99, 102, 241, 0.3)'}`
                        }}
                      >
                        {log.action}
                      </span>

                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {log.table_name.toUpperCase()} {log.record_id ? `#${String(log.record_id).slice(0, 8)}` : ''}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {/* User Info Badge */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-elevated)', padding: '4px 10px', borderRadius: '20px', border: '1px solid var(--border)' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#34d399' }} />
                        <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 500 }}>
                          {userMeta.email}
                        </span>
                        <span style={{ fontSize: '10px', background: 'var(--accent-purple)', color: 'white', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                          {userMeta.role}
                        </span>
                      </div>

                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {fmtDate(log.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Past vs Present Comparison Table */}
                  {allKeys.length > 0 && (
                    <div style={{ marginTop: '4px', border: '1px solid var(--border-subtle)', borderRadius: '8px', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)' }}>
                            <th style={{ padding: '8px 12px', textAlign: 'left', width: '30%', color: 'var(--text-muted)' }}>Field</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', width: '35%', color: 'var(--text-muted)' }}>Past Entry (Before)</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', width: '35%', color: 'var(--text-muted)' }}>Present Entry (After)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {allKeys.map(key => {
                            const oldVal = log.old_data ? log.old_data[key] : null
                            const newVal = log.new_data ? log.new_data[key] : null
                            const isChanged = JSON.stringify(oldVal) !== JSON.stringify(newVal)

                            if (!isChanged && log.action === 'UPDATE') return null

                            return (
                              <tr key={key} style={{ borderBottom: '1px solid var(--border-subtle)', background: isChanged ? 'rgba(99,102,241,0.03)' : 'transparent' }}>
                                <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                  {key.replace(/_/g, ' ')}
                                </td>
                                <td style={{ padding: '8px 12px', color: oldVal !== null ? 'var(--accent-rose)' : 'var(--text-muted)', fontFamily: 'monospace' }}>
                                  {oldVal !== null && oldVal !== undefined ? (typeof oldVal === 'object' ? JSON.stringify(oldVal) : String(oldVal)) : '-'}
                                </td>
                                <td style={{ padding: '8px 12px', color: newVal !== null ? 'var(--accent-green)' : 'var(--text-muted)', fontFamily: 'monospace', fontWeight: isChanged ? 600 : 400 }}>
                                  {newVal !== null && newVal !== undefined ? (typeof newVal === 'object' ? JSON.stringify(newVal) : String(newVal)) : '-'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                </div>
              )
            })
          )}
        </div>

      </div>
    </div>
  )
}

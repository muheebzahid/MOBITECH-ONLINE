'use client'

import { useState, useTransition } from 'react'
import { updateUserRole, addMember, deleteMember } from '@/lib/admin/actions'
import { generateOnlineBackup } from '@/lib/backup/actions'


interface Props {
  users: any[]
  pendingInvoices?: any[] // Kept for type safety but not used here anymore
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function AdminClient({ users }: Props) {
  const [isPending, startTransition] = useTransition()
  const [isBackupPending, startBackupTransition] = useTransition()

  const handleBackup = () => {
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
    startTransition(async () => {
      await updateUserRole(userId, newRole as any)
    })
  }

  const confirmDeleteMember = async () => {
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

  return (
    <div className="page-root">
      <div className="page-header" style={{ marginBottom: '32px' }}>
        <div>
          <h1 className="page-title">Super Admin Dashboard</h1>
          <p className="page-sub">Manage user roles and team members.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '32px' }}>
        
        {/* User Roles */}
        <div className="panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600 }}>Team Members</h2>
            <button className="btn-primary" onClick={() => setShowAddForm(!showAddForm)}>
              + Add Member
            </button>
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
                    disabled={isPending || u.email === 'muheebzahid@gmail.com'} // Prevent self-lockout
                  >
                    <option value="SUPER_ADMIN">Super Admin</option>
                    <option value="SALES">Sales</option>
                    <option value="LOGISTICS">Logistics</option>
                    <option value="FINANCE">Finance</option>
                    <option value="VIEW_ONLY">View Only</option>
                  </select>
                  {u.email !== 'muheebzahid@gmail.com' && (
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
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = 'var(--accent-red)'
                        e.currentTarget.style.color = '#fff'
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.color = 'var(--accent-red)'
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
            disabled={isBackupPending}
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
    </div>
  )
}

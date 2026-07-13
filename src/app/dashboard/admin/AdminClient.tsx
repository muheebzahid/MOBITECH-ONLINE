'use client'

import { useState, useTransition } from 'react'
import { updateUserRole, addMember } from '@/lib/admin/actions'

interface Props {
  users: any[]
  pendingInvoices?: any[] // Kept for type safety but not used here anymore
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function AdminClient({ users }: Props) {
  const [isPending, startTransition] = useTransition()
  
  // Add Member State
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState({ email: '', password: '', role: 'SALES' })
  const [addError, setAddError] = useState('')
  
  const handleRoleChange = async (userId: string, newRole: string) => {
    startTransition(async () => {
      await updateUserRole(userId, newRole as any)
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
                <div>
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
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}

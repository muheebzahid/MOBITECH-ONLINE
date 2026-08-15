'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { requestWithdrawal, approveTransaction, rejectTransaction, distributeProfit, injectCapital } from '@/lib/partners/actions'
import { exportToExcel } from '@/lib/utils/exportExcel'
import { getAuditHistory } from '@/lib/audit/actions'
import AuditHistoryModal from '@/components/audit/AuditHistoryModal'

interface Props {
  netProfit: number
  partners: any[]
  pendingWithdrawals: any[]
  transactions: any[]
}

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


function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function PartnersClient({ netProfit, partners, pendingWithdrawals, transactions }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  
  // Modals
  const [showWithdrawModal, setShowWithdrawModal] = useState(false)
  const [showDistributeModal, setShowDistributeModal] = useState(false)
  const [showInjectModal, setShowInjectModal] = useState(false)
  
  // Form states
  const [selectedPartnerId, setSelectedPartnerId] = useState(partners[0]?.id || '')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')

  const [showAuditModal, setShowAuditModal] = useState(false)
  const [auditLogs, setAuditLogs] = useState<any[]>([])

  const handleOpenAudit = async () => {
    const logs = await getAuditHistory('partners')
    setAuditLogs(logs)
    setShowAuditModal(true)
  }

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault()
    startTransition(async () => {
      await requestWithdrawal(selectedPartnerId, Number(amount), notes)
      setShowWithdrawModal(false)
      setAmount('')
      setNotes('')
    })
  }

  const handleInject = async (e: React.FormEvent) => {
    e.preventDefault()
    startTransition(async () => {
      await injectCapital(selectedPartnerId, Number(amount), notes)
      setShowInjectModal(false)
      setAmount('')
      setNotes('')
    })
  }

  const handleDistribute = async (e: React.FormEvent) => {
    e.preventDefault()
    startTransition(async () => {
      await distributeProfit(Number(amount))
      setShowDistributeModal(false)
      setAmount('')
    })
  }

  const totalCapital = partners.reduce((s, p) => s + Number(p.balance), 0)

  return (
    <div className="page-root">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: '32px' }}>
        <div>
          <h1 className="page-title">Partner Accounting</h1>
          <p className="page-sub">Manage capital accounts, equity shares, and profit distributions.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button 
            className="btn-ghost" 
            onClick={handleOpenAudit} 
            style={{ border: '1px solid var(--accent-purple)', color: 'var(--accent-purple)' }}
          >
            📜 History
          </button>
          <button 
            className="btn-ghost" 
            onClick={() => {
              const headers = ['Partner Name', 'Equity Share (%)', 'Capital Balance ($)']
              const rows = partners.map(p => [p.name, p.equity_share || 0, p.current_balance || p.balance || 0])
              exportToExcel('mobitech_partners_capital_export', headers, rows)
            }} 
            style={{ border: '1px solid var(--accent-green)', color: 'var(--accent-green)' }}
          >
            📊 Export to Excel
          </button>
          <button 
            className="btn-primary" 
            style={{ background: 'var(--accent-purple)' }}
            onClick={() => { setAmount(netProfit.toString()); setShowDistributeModal(true) }}
          >
            💰 Distribute Profit
          </button>
          <button 
            className="btn-primary"
            style={{ background: 'var(--accent-green)', color: '#000' }}
            onClick={() => { setAmount(''); setShowInjectModal(true) }}
          >
            + Inject Capital
          </button>
          <button 
            className="btn-primary"
            style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}
            onClick={() => { setAmount(''); setShowWithdrawModal(true) }}
          >
            - Request Withdrawal
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '32px' }}>
        {partners.map(p => (
          <div key={p.id} className="log-sum-card" style={{ flex: '1 1 300px', minWidth: '250px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
              {p.name}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Equity Share: {p.equity_share}%
            </p>
            <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-main)' }}>
              {fmt(Number(p.balance))}
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Current Capital Balance</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '32px' }}>
        
        {/* Pending Withdrawals */}
        <div className="panel" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-amber)' }}></span>
            Pending Withdrawal Requests
          </h2>
          
          {pendingWithdrawals.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', fontStyle: 'italic' }}>No pending requests.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {pendingWithdrawals.map(req => (
                <div key={req.id} style={{ padding: '16px', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 500, color: 'var(--text-main)' }}>{req.partners?.name}</span>
                    <span style={{ fontWeight: 600, color: 'var(--accent-amber)' }}>{fmt(req.amount)}</span>
                  </div>
                  {req.notes && <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>"{req.notes}"</p>}
                  
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    <button 
                      className="btn-primary" 
                      style={{ padding: '6px 12px', fontSize: '13px', flex: 1 }}
                      onClick={() => startTransition(() => approveTransaction(req.id))}
                      disabled={isPending}
                    >
                      Approve
                    </button>
                    <button 
                      className="btn-ghost" 
                      style={{ padding: '6px 12px', fontSize: '13px', color: 'var(--accent-red)', border: '1px solid var(--border)' }}
                      onClick={() => startTransition(() => rejectTransaction(req.id))}
                      disabled={isPending}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Transaction History */}
        <div className="panel" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Ledger History</h2>
          
          <div style={{ maxHeight: '600px', overflowY: 'auto', paddingRight: '8px' }}>
            {transactions.slice(0, 50).map(tx => {
              const isPositive = tx.type === 'CAPITAL_INJECTION' || tx.type === 'PROFIT_SHARE'
              return (
                <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '14px', color: 'var(--text-main)' }}>
                      {tx.partners?.name}
                      <span style={{ marginLeft: '8px', fontSize: '11px', padding: '2px 6px', background: 'var(--surface-3)', borderRadius: '4px', color: 'var(--text-muted)' }}>
                        {tx.type.replace('_', ' ')}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {fmtDate(tx.created_at)} • {tx.status}
                    </div>
                  </div>
                  <div style={{ fontWeight: 600, color: isPositive ? 'var(--accent-green)' : 'var(--text-main)', textAlign: 'right' }}>
                    {isPositive ? '+' : '-'} {fmt(tx.amount)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

      </div>

      {/* Modals */}
      {showWithdrawModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Request Withdrawal</h2>
            <form onSubmit={handleWithdraw}>
              <div className="form-group">
                <label>Partner</label>
                <select className="form-input" value={selectedPartnerId} onChange={e => setSelectedPartnerId(e.target.value)}>
                  {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Amount (USD)</label>
                <input type="number" step="0.01" required className="form-input" value={amount} onChange={e => setAmount(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Notes (Optional)</label>
                <input type="text" className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Q3 Profit Withdrawal" />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn-ghost" onClick={() => setShowWithdrawModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={isPending}>{isPending ? 'Sending...' : 'Submit Request'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDistributeModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Distribute Profit</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Current Total Net Profit: <strong style={{ color: 'var(--accent-purple)' }}>{fmt(netProfit)}</strong>
            </p>
            <form onSubmit={handleDistribute}>
              <div className="form-group">
                <label>Amount to Distribute (USD)</label>
                <input type="number" step="0.01" required className="form-input" value={amount} onChange={e => setAmount(e.target.value)} />
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                  This amount will be split equally (33.3%) among Muheeb, Beshair, and Faisal and credited to their capital balances.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn-ghost" onClick={() => setShowDistributeModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ background: 'var(--accent-purple)' }} disabled={isPending}>{isPending ? 'Distributing...' : 'Confirm Distribution'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showInjectModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Inject Capital</h2>
            <form onSubmit={handleInject}>
              <div className="form-group">
                <label>Partner</label>
                <select className="form-input" value={selectedPartnerId} onChange={e => setSelectedPartnerId(e.target.value)}>
                  {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Amount (USD)</label>
                <input type="number" step="0.01" required className="form-input" value={amount} onChange={e => setAmount(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Notes (Optional)</label>
                <input type="text" className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Initial Capital" />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn-ghost" onClick={() => setShowInjectModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ background: 'var(--accent-green)', color: '#000' }} disabled={isPending}>{isPending ? 'Saving...' : 'Add Capital'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      <AuditHistoryModal isOpen={showAuditModal} onClose={() => setShowAuditModal(false)} logs={auditLogs} title="Partner Accounting Edit History" />
    </div>
  )
}

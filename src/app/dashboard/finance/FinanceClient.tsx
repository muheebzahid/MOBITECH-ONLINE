'use client'

import { useState, useTransition } from 'react'
import { updateTreasurySettings, logWireTransfer, logRepayment, updateWireTransfer, deleteWireTransfer, updateRepayment, deleteRepayment } from '@/lib/finance/actions'

interface Props {
  settings: any
  wires: any[]
  repayments: any[]
  deals: any[]
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(n)
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function FinanceClient({ settings, wires, repayments, deals }: Props) {
  const [isPending, startTransition] = useTransition()
  
  // Modals
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showWireModal, setShowWireModal] = useState(false)
  const [showRepayModal, setShowRepayModal] = useState(false)
  
  // Editing state
  const [editingWireId, setEditingWireId] = useState<string | null>(null)
  const [editingRepayId, setEditingRepayId] = useState<string | null>(null)
  
  // Form states
  const [amexLimit, setAmexLimit] = useState(settings.amex_limit.toString())
  const [cashLimit, setCashLimit] = useState(settings.cash_limit.toString())
  
  const [wireDeal, setWireDeal] = useState('')
  const [wireAmount, setWireAmount] = useState('')
  const [wireDest, setWireDest] = useState('B-Stock')
  const [wireNotes, setWireNotes] = useState('')
  
  const [repayAmount, setRepayAmount] = useState('')
  const [repaySource, setRepaySource] = useState('AMEX')
  const [repayNotes, setRepayNotes] = useState('')

  // Calculations
  const amexStuck = deals
    .filter(d => d.status !== 'DEAL_CLOSED' && (d.funding_source === 'AMEX' || d.funding_source === 'MIXED'))
    .reduce((s, d) => s + (Number(d.amex_amount) || Number(d.total_commitment)), 0)
    
  const cashStuck = deals
    .filter(d => d.status !== 'DEAL_CLOSED' && (d.funding_source === 'CASH_POOL' || d.funding_source === 'MIXED'))
    .reduce((s, d) => s + (Number(d.cash_amount) || Number(d.total_commitment)), 0)

  const amexAvailable = settings.amex_limit - amexStuck
  const cashAvailable = settings.cash_limit - cashStuck

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    startTransition(async () => {
      await updateTreasurySettings(Number(amexLimit), Number(cashLimit))
      setShowSettingsModal(false)
    })
  }

  const openWireModal = (wire?: any) => {
    if (wire) {
      setEditingWireId(wire.id)
      setWireAmount(wire.amount.toString())
      setWireDest(wire.destination)
      setWireNotes(wire.notes || '')
      setWireDeal(wire.deal_id || '')
    } else {
      setEditingWireId(null)
      setWireAmount('')
      setWireDest('B-Stock')
      setWireNotes('')
      setWireDeal('')
    }
    setShowWireModal(true)
  }

  const openRepayModal = (repay?: any) => {
    if (repay) {
      setEditingRepayId(repay.id)
      setRepayAmount(repay.amount.toString())
      setRepaySource(repay.source)
      setRepayNotes(repay.notes || '')
    } else {
      setEditingRepayId(null)
      setRepayAmount('')
      setRepaySource('AMEX')
      setRepayNotes('')
    }
    setShowRepayModal(true)
  }

  const handleWire = async (e: React.FormEvent) => {
    e.preventDefault()
    startTransition(async () => {
      if (editingWireId) {
        await updateWireTransfer(editingWireId, Number(wireAmount), wireDest, wireNotes, wireDeal || null)
      } else {
        await logWireTransfer(wireDeal || null, Number(wireAmount), wireDest, wireNotes)
      }
      setShowWireModal(false)
    })
  }
  
  const handleDeleteWire = async () => {
    if (!editingWireId || !confirm('Are you sure you want to delete this wire transfer?')) return
    startTransition(async () => {
      await deleteWireTransfer(editingWireId)
      setShowWireModal(false)
    })
  }

  const handleRepay = async (e: React.FormEvent) => {
    e.preventDefault()
    startTransition(async () => {
      if (editingRepayId) {
        await updateRepayment(editingRepayId, Number(repayAmount), repaySource as any, repayNotes)
      } else {
        await logRepayment(Number(repayAmount), repaySource as any, repayNotes)
      }
      setShowRepayModal(false)
    })
  }
  
  const handleDeleteRepay = async () => {
    if (!editingRepayId || !confirm('Are you sure you want to delete this repayment?')) return
    startTransition(async () => {
      await deleteRepayment(editingRepayId)
      setShowRepayModal(false)
    })
  }

  return (
    <div className="page-root">
      <div className="page-header" style={{ marginBottom: '32px' }}>
        <div>
          <h1 className="page-title">Treasury Control</h1>
          <p className="page-sub">Manage global limits, wire transfers, and capital repayments.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn-ghost" style={{ border: '1px solid var(--border)' }} onClick={() => setShowSettingsModal(true)}>
            ⚙️ Edit Limits
          </button>
          <button className="btn-primary" style={{ background: 'var(--accent-purple)' }} onClick={() => openWireModal()}>
            💸 Log Outbound Wire
          </button>
          <button className="btn-primary" style={{ background: 'var(--accent-green)', color: '#000' }} onClick={() => openRepayModal()}>
            🏦 Log Repayment
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        <div className="log-sum-card" style={{ borderLeft: '4px solid var(--accent-blue)' }}>
          <h3 style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px', textTransform: 'uppercase' }}>Amex Facility</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Total Limit</span>
            <span style={{ fontWeight: 600 }}>{fmt(settings.amex_limit)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Stuck in Deals</span>
            <span style={{ fontWeight: 600, color: 'var(--accent-red)' }}>{fmt(amexStuck)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>Available</span>
            <span style={{ fontWeight: 700, color: 'var(--accent-green)' }}>{fmt(amexAvailable)}</span>
          </div>
        </div>

        <div className="log-sum-card" style={{ borderLeft: '4px solid var(--accent-amber)' }}>
          <h3 style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px', textTransform: 'uppercase' }}>Cash Pool</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Total Pool</span>
            <span style={{ fontWeight: 600 }}>{fmt(settings.cash_limit)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Stuck in Deals</span>
            <span style={{ fontWeight: 600, color: 'var(--accent-red)' }}>{fmt(cashStuck)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>Available</span>
            <span style={{ fontWeight: 700, color: 'var(--accent-green)' }}>{fmt(cashAvailable)}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '32px' }}>
        
        {/* Wire Transfers Ledger */}
        <div className="panel" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Outbound Wires</h2>
          <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
            {wires.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No wire transfers logged.</p> : null}
            {wires.map(w => (
              <div key={w.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ cursor: 'pointer' }} onClick={() => openWireModal(w)}>
                  <div style={{ fontWeight: 500, display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {w.destination}
                    <span style={{ fontSize: '10px', background: 'var(--bg-hover)', padding: '2px 6px', borderRadius: '4px' }}>Edit</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {fmtDate(w.created_at)} {w.deals?.deal_number ? `• Deal ${w.deals.deal_number}` : ''}
                  </div>
                </div>
                <div style={{ fontWeight: 600, color: 'var(--accent-purple)' }}>
                  {fmt(w.amount)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Repayments Ledger */}
        <div className="panel" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Capital Repayments</h2>
          <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
            {repayments.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No repayments logged.</p> : null}
            {repayments.map(r => (
              <div key={r.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ cursor: 'pointer' }} onClick={() => openRepayModal(r)}>
                  <div style={{ fontWeight: 500, display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {r.source === 'AMEX' ? 'Amex Bill Payment' : 'Cash Pool Replenishment'}
                    <span style={{ fontSize: '10px', background: 'var(--bg-hover)', padding: '2px 6px', borderRadius: '4px' }}>Edit</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {fmtDate(r.created_at)}
                  </div>
                </div>
                <div style={{ fontWeight: 600, color: 'var(--accent-green)' }}>
                  {fmt(r.amount)}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Edit Treasury Limits</h2>
            <form onSubmit={handleUpdateSettings}>
              <div className="form-group">
                <label>Amex Limit</label>
                <input type="number" required className="form-input" value={amexLimit} onChange={e => setAmexLimit(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Cash Pool Limit</label>
                <input type="number" required className="form-input" value={cashLimit} onChange={e => setCashLimit(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn-ghost" onClick={() => setShowSettingsModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={isPending}>{isPending ? 'Saving...' : 'Save Limits'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Wire Modal */}
      {showWireModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>{editingWireId ? 'Edit Wire Transfer' : 'Log Outbound Wire'}</h2>
            <form onSubmit={handleWire}>
              <div className="form-group">
                <label>Destination</label>
                <input type="text" required className="form-input" value={wireDest} onChange={e => setWireDest(e.target.value)} placeholder="e.g. B-Stock, EcoATM, Shipping Co" />
              </div>
              <div className="form-group">
                <label>Amount (USD)</label>
                <input type="number" step="0.01" required className="form-input" value={wireAmount} onChange={e => setWireAmount(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Associated Deal (Optional)</label>
                <select className="form-input" value={wireDeal} onChange={e => setWireDeal(e.target.value)}>
                  <option value="">-- None --</option>
                  {deals.filter(d => d.status !== 'DEAL_CLOSED' || d.id === wireDeal).map(d => (
                    <option key={d.id} value={d.id}>{d.deal_number} ({d.model})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Notes</label>
                <input type="text" className="form-input" value={wireNotes} onChange={e => setWireNotes(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'space-between' }}>
                {editingWireId ? (
                  <button type="button" className="btn-ghost" style={{ color: 'var(--accent-red)' }} onClick={handleDeleteWire} disabled={isPending}>Delete</button>
                ) : <div />}
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button type="button" className="btn-ghost" onClick={() => setShowWireModal(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" style={{ background: 'var(--accent-purple)' }} disabled={isPending}>{isPending ? 'Saving...' : 'Save'}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Repay Modal */}
      {showRepayModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>{editingRepayId ? 'Edit Repayment' : 'Log Capital Repayment'}</h2>
            <form onSubmit={handleRepay}>
              <div className="form-group">
                <label>Source</label>
                <select className="form-input" value={repaySource} onChange={e => setRepaySource(e.target.value)}>
                  <option value="AMEX">Amex Bill Payment</option>
                  <option value="CASH_POOL">Cash Pool Replenishment</option>
                </select>
              </div>
              <div className="form-group">
                <label>Amount (USD)</label>
                <input type="number" step="0.01" required className="form-input" value={repayAmount} onChange={e => setRepayAmount(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Notes</label>
                <input type="text" className="form-input" value={repayNotes} onChange={e => setRepayNotes(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'space-between' }}>
                {editingRepayId ? (
                  <button type="button" className="btn-ghost" style={{ color: 'var(--accent-red)' }} onClick={handleDeleteRepay} disabled={isPending}>Delete</button>
                ) : <div />}
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button type="button" className="btn-ghost" onClick={() => setShowRepayModal(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" style={{ background: 'var(--accent-green)', color: '#000' }} disabled={isPending}>{isPending ? 'Saving...' : 'Save'}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}

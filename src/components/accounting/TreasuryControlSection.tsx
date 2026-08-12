'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  TreasuryTransaction,
  autoGenerateTreasuryEntriesFromDeals,
  recordTreasuryTransaction,
  deleteTreasuryTransaction
} from '@/lib/accounting/treasuryActions'

interface Props {
  initialTransactions: TreasuryTransaction[]
  currency: 'usd' | 'aed'
  userRole: string
}

export default function TreasuryControlSection({ initialTransactions, currency, userRole }: Props) {
  const router = useRouter()
  const [transactions, setTransactions] = useState<TreasuryTransaction[]>(initialTransactions)
  const [selectedCycle, setSelectedCycle] = useState<string>('ALL')
  const [selectedType, setSelectedType] = useState<string>('ALL')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)

  // Modal State
  const [showModal, setShowModal] = useState(false)
  const [monthCycle, setMonthCycle] = useState(new Date().toISOString().slice(0, 7))
  const [transType, setTransType] = useState<'TURBO_TO_SB' | 'SB_TO_AMEX'>('TURBO_TO_SB')
  const [amount, setAmount] = useState<string>('')
  const [transDate, setTransDate] = useState<string>(`${new Date().toISOString().slice(0, 7)}-10`)
  const [refNotes, setRefNotes] = useState<string>('')
  const [isSaving, setIsSaving] = useState(false)

  const formatCurrency = (val: number) => {
    const displayAmt = currency === 'usd' ? val : val * 3.674
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(displayAmt)
  }

  // Get distinct month cycles for filtering
  const availableCycles = Array.from(new Set(transactions.map(t => t.month_cycle))).sort().reverse()

  // Filter transactions
  const filteredTransactions = transactions.filter(t => {
    const cycleMatch = selectedCycle === 'ALL' || t.month_cycle === selectedCycle
    const typeMatch = selectedType === 'ALL' || t.transaction_type === selectedType
    return cycleMatch && typeMatch
  })

  // Summary Metrics
  const totalTurboToSb = transactions
    .filter(t => t.transaction_type === 'TURBO_TO_SB')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0)

  const totalSbToAmex = transactions
    .filter(t => t.transaction_type === 'SB_TO_AMEX')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0)

  const handleAutoGenerate = async () => {
    setIsGenerating(true)
    try {
      const res = await autoGenerateTreasuryEntriesFromDeals()
      if (!res.success) {
        throw new Error(res.error || 'Failed to generate treasury entries')
      }
      alert(`✅ ${res.message}`)
      router.refresh()
      window.location.reload()
    } catch (err: any) {
      alert('⚠️ Auto-Generate Error: ' + err.message)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!amount || Number(amount) <= 0) {
      alert('Please enter a valid amount')
      return
    }
    setIsSaving(true)
    try {
      const res = await recordTreasuryTransaction({
        month_cycle: monthCycle,
        transaction_type: transType,
        amount: Number(amount),
        transaction_date: transDate,
        reference_notes: refNotes
      })

      if (!res.success) {
        throw new Error(res.error || 'Failed to record entry')
      }

      alert('✅ Single entry recorded successfully!')
      setShowModal(false)
      setAmount('')
      setRefNotes('')
      router.refresh()
      window.location.reload()
    } catch (err: any) {
      alert('⚠️ Error saving entry: ' + err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteEntry = (id: string) => {
    if (confirm('Are you sure you want to delete this treasury entry?')) {
      startTransition(async () => {
        const res = await deleteTreasuryTransaction(id)
        if (res.success) {
          setTransactions(prev => prev.filter(t => t.id !== id))
          router.refresh()
        } else {
          alert('Failed to delete: ' + res.error)
        }
      })
    }
  }

  return (
    <div style={{ marginTop: '36px', borderTop: '1px solid var(--border)', paddingTop: '32px' }}>
      
      {/* Section Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '22px' }}>🏛️</span>
            <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
              Monthly Treasury Settlement & AMEX Payoff History
            </h2>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Single-entry cash flow ledger: Turbo Pool ➔ SB Pool (by 10th) &amp; SB Pool ➔ AMEX Credit Card Payoff (by 11th)
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={handleAutoGenerate}
            disabled={isGenerating}
            style={{
              padding: '10px 18px',
              fontSize: '13px',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              cursor: isGenerating ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
            }}
          >
            <span>⚡</span>
            {isGenerating ? 'Calculating Deals...' : 'Auto-Generate Monthly Entries from Deals'}
          </button>

          <button
            onClick={() => setShowModal(true)}
            style={{
              padding: '10px 18px',
              fontSize: '13px',
              fontWeight: 700,
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              cursor: 'pointer'
            }}
          >
            + Add Single Entry
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ padding: '18px 20px', backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '14px', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
            Rule 1: Turbo ➔ SB Transfers (Before 10th)
          </div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#f59e0b', marginTop: '6px' }}>
            {formatCurrency(totalTurboToSb)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Funded cash allocations to SB Pool
          </div>
        </div>

        <div style={{ padding: '18px 20px', backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '14px', borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
            Rule 2: SB ➔ AMEX Payoffs (Before 11th)
          </div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#10b981', marginTop: '6px' }}>
            {formatCurrency(totalSbToAmex)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Credit card facility fully settled
          </div>
        </div>

        <div style={{ padding: '18px 20px', backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '14px', borderLeft: '4px solid #8b5cf6' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
            Recorded Monthly Cycles
          </div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#a78bfa', marginTop: '6px' }}>
            {availableCycles.length} Month Cycles
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {transactions.length} Total Single Entries Logged
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>Month Cycle:</span>
          <select
            value={selectedCycle}
            onChange={e => setSelectedCycle(e.target.value)}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              outline: 'none',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            <option value="ALL">All Month Cycles ({availableCycles.length})</option>
            {availableCycles.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>Entry Type:</span>
          <select
            value={selectedType}
            onChange={e => setSelectedType(e.target.value)}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              outline: 'none',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            <option value="ALL">All Single Entries</option>
            <option value="TURBO_TO_SB">Rule 1: Turbo ➔ SB (10th)</option>
            <option value="SB_TO_AMEX">Rule 2: SB ➔ AMEX Payoff (11th)</option>
          </select>
        </div>
      </div>

      {/* Transactions Table */}
      <div style={{ backgroundColor: 'var(--bg-elevated)', borderRadius: '16px', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '14px 18px', fontWeight: 600 }}>Month Cycle</th>
              <th style={{ padding: '14px 18px', fontWeight: 600 }}>Target Date</th>
              <th style={{ padding: '14px 18px', fontWeight: 600 }}>Single Entry Type</th>
              <th style={{ padding: '14px 18px', fontWeight: 600 }}>Source ➔ Destination</th>
              <th style={{ padding: '14px 18px', fontWeight: 600, textAlign: 'right' }}>Amount ($)</th>
              <th style={{ padding: '14px 18px', fontWeight: 600 }}>Reference Notes &amp; Deals</th>
              <th style={{ padding: '14px 18px', fontWeight: 600, textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '40px 18px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No treasury settlement entries found for this filter. Click <strong>Auto-Generate Monthly Entries from Deals</strong> to calculate all deal payoffs!
                </td>
              </tr>
            ) : (
              filteredTransactions.map(t => {
                const isTurbo = t.transaction_type === 'TURBO_TO_SB'
                const isExpanded = expandedRowId === t.id

                return (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}>
                    <td style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {t.month_cycle}
                    </td>
                    <td style={{ padding: '14px 18px', color: 'var(--text-muted)' }}>
                      {t.transaction_date}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '11.5px',
                          fontWeight: 800,
                          backgroundColor: isTurbo ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                          color: isTurbo ? '#fbbf24' : '#34d399',
                          border: `1px solid ${isTurbo ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`
                        }}
                      >
                        {isTurbo ? '🟡 Rule 1: TURBO ➔ SB (10th)' : '🟢 Rule 2: SB ➔ AMEX (11th)'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {t.source_account} ➔ {t.destination_account}
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: 800, textAlign: 'right', color: isTurbo ? '#fbbf24' : '#34d399', fontSize: '14.5px' }}>
                      {formatCurrency(t.amount)}
                    </td>
                    <td style={{ padding: '14px 18px', color: 'var(--text-muted)', fontSize: '13px' }}>
                      {t.reference_notes || '—'}
                      {t.deal_ids && t.deal_ids.length > 0 && (
                        <span style={{ marginLeft: '8px', fontSize: '11.5px', color: '#60a5fa', fontWeight: 700 }}>
                          ({t.deal_ids.length} Deal{t.deal_ids.length > 1 ? 's' : ''} Included)
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                      {userRole === 'SUPER_ADMIN' && (
                        <button
                          onClick={() => handleDeleteEntry(t.id)}
                          style={{ background: 'none', border: 'none', color: 'var(--status-red)', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Manual Entry Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '20px', width: '100%', maxWidth: '520px', padding: '28px', color: 'var(--text-primary)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>Record Single Treasury Entry</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>

            <form onSubmit={handleSaveEntry} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-muted)' }}>Month Cycle (YYYY-MM)</label>
                <input
                  type="month"
                  value={monthCycle}
                  onChange={e => {
                    setMonthCycle(e.target.value)
                    setTransDate(`${e.target.value}-${transType === 'TURBO_TO_SB' ? '10' : '11'}`)
                  }}
                  required
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', background: 'var(--bg-page)', border: '1px solid var(--border)', color: 'var(--text-primary)', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-muted)' }}>Single Entry Rule Type</label>
                <select
                  value={transType}
                  onChange={e => {
                    const val = e.target.value as any
                    setTransType(val)
                    setTransDate(`${monthCycle}-${val === 'TURBO_TO_SB' ? '10' : '11'}`)
                  }}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', background: 'var(--bg-page)', border: '1px solid var(--border)', color: 'var(--text-primary)', outline: 'none' }}
                >
                  <option value="TURBO_TO_SB">Rule 1: Turbo Pool ➔ SB Pool Transfer (Due by 10th)</option>
                  <option value="SB_TO_AMEX">Rule 2: SB Pool ➔ AMEX Credit Card Payoff (Due by 11th)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-muted)' }}>Target Date</label>
                <input
                  type="date"
                  value={transDate}
                  onChange={e => setTransDate(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', background: 'var(--bg-page)', border: '1px solid var(--border)', color: 'var(--text-primary)', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-muted)' }}>Amount ($ USD)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 410247.11"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', background: 'var(--bg-page)', border: '1px solid var(--border)', color: 'var(--text-primary)', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-muted)' }}>Reference Notes</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Monthly transfer from Turbo pool to SB pool for credit card payoff"
                  value={refNotes}
                  onChange={e => setRefNotes(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', background: 'var(--bg-page)', border: '1px solid var(--border)', color: 'var(--text-primary)', outline: 'none', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" disabled={isSaving} style={{ padding: '10px 22px', borderRadius: '10px', border: 'none', background: 'var(--accent-purple)', color: '#fff', fontWeight: 700, cursor: isSaving ? 'not-allowed' : 'pointer' }}>
                  {isSaving ? 'Saving...' : 'Save Single Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}

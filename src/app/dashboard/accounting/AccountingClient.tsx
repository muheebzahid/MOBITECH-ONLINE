'use client'

import { useState, useTransition } from 'react'
import { logExpense } from '@/lib/accounting/actions'

type FinancialSummary = {
  revenue: number
  cogs: number
  grossProfit: number
  freight: number
  opex: number
  netProfit: number
  inventoryAsset: number
}

export default function AccountingClient({ summary, expenseHistory }: { summary: { usd: FinancialSummary, aed: FinancialSummary }, expenseHistory: any[] }) {
  const [currency, setCurrency] = useState<'usd' | 'aed'>('usd')
  const [isPending, startTransition] = useTransition()
  const [showExpenseModal, setShowExpenseModal] = useState(false)

  // Expense form state
  const [category, setCategory] = useState('OTHER')
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState(0)

  const data = summary[currency]
  const symbol = currency === 'usd' ? '$' : 'د.إ'

  const handleLogExpense = (e: React.FormEvent) => {
    e.preventDefault()
    startTransition(async () => {
      // Amount is saved natively in USD. If they are in AED mode, we convert back to USD before saving.
      const amountUsd = currency === 'usd' ? amount : amount / 3.674
      await logExpense(category, desc, amountUsd)
      setShowExpenseModal(false)
      setCategory('OTHER')
      setDesc('')
      setAmount(0)
    })
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(val)
  }

  return (
    <div className="page-root">
      <div className="page-header" style={{ alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Accounting & Finance</h1>
          <p className="page-subtitle">Real-time automated Profit & Loss</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'var(--bg-elevated)', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border)' }}>
            <button 
              style={{ padding: '8px 16px', border: 'none', background: currency === 'usd' ? 'var(--accent-purple)' : 'transparent', color: currency === 'usd' ? 'white' : 'var(--text-primary)', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
              onClick={() => setCurrency('usd')}
            >
              USD
            </button>
            <button 
              style={{ padding: '8px 16px', border: 'none', background: currency === 'aed' ? 'var(--accent-purple)' : 'transparent', color: currency === 'aed' ? 'white' : 'var(--text-primary)', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
              onClick={() => setCurrency('aed')}
            >
              AED
            </button>
          </div>
          <button className="btn-primary" onClick={() => setShowExpenseModal(true)}>
            + Log Expense
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        
        {/* P&L Statement */}
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '24px' }}>Profit & Loss Statement (YTD)</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Revenue */}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 600, fontSize: '15px' }}>Sales Revenue (Invoiced)</span>
              <span style={{ fontWeight: 600, fontSize: '15px' }}>{formatCurrency(data.revenue)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '16px', color: 'var(--text-muted)', borderBottom: '2px solid var(--border)' }}>
              <span style={{ fontSize: '14px', paddingLeft: '16px' }}>Less: Cost of Goods Sold</span>
              <span style={{ fontSize: '14px' }}>- {formatCurrency(data.cogs)}</span>
            </div>
            
            {/* Gross Profit */}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 700, fontSize: '16px', color: 'var(--accent-green)' }}>Gross Profit</span>
              <span style={{ fontWeight: 700, fontSize: '16px', color: 'var(--accent-green)' }}>{formatCurrency(data.grossProfit)}</span>
            </div>

            {/* OPEX */}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', marginTop: '8px' }}>
              <span style={{ fontWeight: 600, fontSize: '15px' }}>Operating Expenses</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: '14px', paddingLeft: '16px' }}>Freight & Logistics</span>
              <span style={{ fontSize: '14px' }}>{formatCurrency(data.freight)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '16px', color: 'var(--text-muted)', borderBottom: '2px solid var(--border)' }}>
              <span style={{ fontSize: '14px', paddingLeft: '16px' }}>General & Administrative</span>
              <span style={{ fontSize: '14px' }}>{formatCurrency(data.opex)}</span>
            </div>

            {/* Net Profit */}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0', marginTop: '8px' }}>
              <span style={{ fontWeight: 800, fontSize: '20px' }}>Net Profit / (Loss)</span>
              <span style={{ fontWeight: 800, fontSize: '20px', color: data.netProfit >= 0 ? 'var(--accent-green)' : 'var(--status-red)' }}>
                {formatCurrency(data.netProfit)}
              </span>
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Asset Snapshot */}
          <div 
            className="log-sum-card" 
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.2s' }}
            onClick={() => {
              // Navigate to deals and pass a query param to trigger the highlight
              window.location.href = '/dashboard/deals?highlight=unsold'
            }}
          >
            <h3 style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>Current Assets</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: '15px', fontWeight: 600 }}>Unsold Inventory ↗</span>
              <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent-purple)' }}>{formatCurrency(data.inventoryAsset)}</span>
            </div>
          </div>

          {/* Recent Expenses List */}
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', flex: 1 }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>Recent Manual Expenses</h3>
            {expenseHistory.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No expenses logged yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {expenseHistory.map(exp => {
                  const displayAmt = currency === 'usd' ? Number(exp.amount) : Number(exp.amount) * 3.674
                  return (
                    <div key={exp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 600 }}>{exp.description}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {exp.category} • {new Date(exp.expense_date).toLocaleDateString()}
                        </div>
                      </div>
                      <div style={{ fontWeight: 600, color: 'var(--status-red)' }}>
                        -{formatCurrency(displayAmt)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Log Expense Modal */}
      {showExpenseModal && (
        <div className="modal-overlay" onClick={(e: any) => { if (e.target === e.currentTarget) setShowExpenseModal(false) }}>
          <div className="modal-box" style={{ width: '480px' }}>
            <div className="modal-header">
              <h3>Log Operating Expense</h3>
              <button className="btn-ghost" onClick={() => setShowExpenseModal(false)}>✕</button>
            </div>
            <form className="modal-body" onSubmit={handleLogExpense}>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label>Category</label>
                <select className="form-input" value={category} onChange={e => setCategory(e.target.value)}>
                  <option value="RENT">Rent</option>
                  <option value="SOFTWARE">Software / IT</option>
                  <option value="OFFICE_SUPPLIES">Office Supplies</option>
                  <option value="TRAVEL">Travel</option>
                  <option value="UTILITIES">Utilities</option>
                  <option value="PAYROLL">Salary</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label>Description</label>
                <input type="text" className="form-input" required placeholder="e.g. Google Workspace Subscription" value={desc} onChange={e => setDesc(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: '24px' }}>
                <label>Amount ({currency.toUpperCase()})</label>
                <input type="number" className="form-input" required min="0.01" step="0.01" value={amount || ''} onChange={e => setAmount(Number(e.target.value))} />
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Amount will be recorded in USD based on 1 USD = 3.674 AED standard rate if you enter AED.
                </p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-ghost" onClick={() => setShowExpenseModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={isPending}>
                  {isPending ? 'Saving...' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

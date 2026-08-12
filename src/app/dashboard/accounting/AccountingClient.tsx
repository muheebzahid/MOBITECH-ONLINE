'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { logExpense, editExpense, deleteExpense } from '@/lib/accounting/actions'
import { createClient } from '@/lib/supabase/client'
import TreasuryControlSection from '@/components/accounting/TreasuryControlSection'
import { TreasuryTransaction } from '@/lib/accounting/treasuryActions'

type FinancialSummary = {
  revenue: number
  cogs: number
  cogsDevices: number
  cogsLogistics: number
  grossProfit: number
  amexProfit: number
  freight: number
  opex: number
  netProfit: number
  inventoryAsset: number
  treasury: {
    amexLimit: number
    amexStuck: number
    amexAvailable: number
    cashLimit: number
    cashStuck: number
    cashAvailable: number
  }
}

export default function AccountingClient({ 
  summary, 
  expenseHistory,
  partners = [],
  partnerTransactions = [],
  treasuryTransactions = [],
  statementDates = [],
  selectedStatementDate,
  fromDate,
  toDate,
  userRole
}: { 
  summary: { usd: FinancialSummary, aed: FinancialSummary }, 
  expenseHistory: any[],
  partners?: any[],
  partnerTransactions?: any[],
  treasuryTransactions?: TreasuryTransaction[],
  statementDates?: string[],
  selectedStatementDate?: string,
  fromDate?: string,
  toDate?: string,
  userRole?: string
}) {
  const supabase = createClient()
  const [currency, setCurrency] = useState<'usd' | 'aed'>('usd')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [tempFromDate, setTempFromDate] = useState(fromDate || '')
  const [tempToDate, setTempToDate] = useState(toDate || '')

  // Expense form state
  const [category, setCategory] = useState('OTHER')
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState(0)
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().split('T')[0])
  const [refLink, setRefLink] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Edit Expense State
  const [editingExpense, setEditingExpense] = useState<any>(null)

  const data = summary[currency]
  const symbol = currency === 'usd' ? '$' : 'د.إ'

  const handleLogExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    setUploading(true)
    let finalRefLink = refLink
    const file = fileInputRef.current?.files?.[0]
    
    if (file) {
      const ext = file.name.split('.').pop()
      const fileName = `receipts/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`
      const { data: uploadData, error } = await supabase.storage.from('invoices').upload(fileName, file)
      if (!error && uploadData) {
        const { data: { publicUrl } } = supabase.storage.from('invoices').getPublicUrl(uploadData.path)
        finalRefLink = publicUrl
      }
    }

    startTransition(async () => {
      const amountUsd = currency === 'usd' ? amount : amount / 3.674
      if (editingExpense) {
        await editExpense(editingExpense.id, {
          category,
          description: desc,
          amount: amountUsd,
          expense_date: expenseDate,
          ...(finalRefLink ? { reference_link: finalRefLink } : {})
        })
      } else {
        await logExpense(category, desc, amountUsd, finalRefLink, expenseDate)
      }
      setUploading(false)
      setShowExpenseModal(false)
      setEditingExpense(null)
      resetForm()
    })
  }

  const resetForm = () => {
    setCategory('OTHER')
    setDesc('')
    setAmount(0)
    setExpenseDate(new Date().toISOString().split('T')[0])
    setRefLink('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleEditClick = (exp: any) => {
    setEditingExpense(exp)
    setCategory(exp.category)
    setDesc(exp.description)
    setAmount(currency === 'usd' ? Number(exp.amount) : Number(exp.amount) * 3.674)
    setExpenseDate(exp.expense_date.split('T')[0])
    setRefLink(exp.reference_link || '')
    setShowExpenseModal(true)
  }

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this expense?')) {
      startTransition(async () => {
        await deleteExpense(id)
      })
    }
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(val)
  }

  const [isSyncingExpenses, setIsSyncingExpenses] = useState(false)

  const handleSyncExpensesLive = async () => {
    setIsSyncingExpenses(true)
    try {
      const res = await fetch('/api/sync/expenses/execute', { method: 'POST' })
      const resData = await res.json()
      if (!resData.success) {
        throw new Error(resData.error || 'Failed to sync expenses')
      }
      alert(`✅ Successfully synced ${resData.synced_count} operating expense(s) live to Online Cloud ERP (the-workflows.com)!`)
      router.refresh()
    } catch (err: any) {
      alert('⚠️ Expense Sync Error: ' + err.message)
    } finally {
      setIsSyncingExpenses(false)
    }
  }

  return (
    <div className="page-root">
      <div className="page-header" style={{ alignItems: 'center' }}>
        <div style={{ marginBottom: '8px' }}>
          <h1 className="page-title">Financial Treasury</h1>
          <p className="page-subtitle">Real-time automated Profit & Loss</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input 
              type="date"
              value={tempFromDate}
              onChange={(e) => setTempFromDate(e.target.value)}
              style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 12px', color: 'var(--text-primary)', outline: 'none'
              }}
            />
            <span style={{ color: 'var(--text-muted)' }}>to</span>
            <input 
              type="date"
              value={tempToDate}
              onChange={(e) => setTempToDate(e.target.value)}
              style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 12px', color: 'var(--text-primary)', outline: 'none'
              }}
            />
            <button
              onClick={() => {
                const url = new URL(window.location.href)
                if (tempFromDate) url.searchParams.set('from_date', tempFromDate)
                else url.searchParams.delete('from_date')
                if (tempToDate) url.searchParams.set('to_date', tempToDate)
                else url.searchParams.delete('to_date')
                router.push(url.pathname + url.search)
                router.refresh()
              }}
              style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', cursor: 'pointer' }}
            >
              Apply Filter
            </button>
            {(tempFromDate || tempToDate || fromDate || toDate) && (
              <button
                onClick={() => {
                  setTempFromDate('')
                  setTempToDate('')
                  const url = new URL(window.location.href)
                  url.searchParams.delete('from_date')
                  url.searchParams.delete('to_date')
                  router.push(url.pathname + url.search)
                  router.refresh()
                }}
                style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'transparent', color: 'var(--status-red)', cursor: 'pointer' }}
              >
                Clear
              </button>
            )}
          </div>
          <select
            value={(() => {
              if (tempFromDate && tempToDate) {
                const dFrom = new Date(tempFromDate)
                const dTo = new Date(tempToDate)
                const isFirst = dFrom.getDate() === 1
                const isLast = dTo.getDate() === new Date(dTo.getFullYear(), dTo.getMonth() + 1, 0).getDate()
                if (isFirst && isLast && dFrom.getMonth() === dTo.getMonth() && dFrom.getFullYear() === dTo.getFullYear()) {
                  return `${dFrom.getFullYear()}-${String(dFrom.getMonth() + 1).padStart(2, '0')}`
                }
              }
              return ''
            })()}
            onChange={(e) => {
              const val = e.target.value
              if (val) {
                const [year, month] = val.split('-')
                const firstDay = new Date(Number(year), Number(month) - 1, 1)
                const lastDay = new Date(Number(year), Number(month), 0)
                
                const fromStr = `${year}-${month}-01`
                const toStr = `${year}-${month}-${String(lastDay.getDate()).padStart(2, '0')}`
                
                setTempFromDate(fromStr)
                setTempToDate(toStr)
                
                const url = new URL(window.location.href)
                url.searchParams.set('from_date', fromStr)
                url.searchParams.set('to_date', toStr)
                url.searchParams.delete('statement_date')
                router.push(url.pathname + url.search)
                router.refresh()
              } else {
                setTempFromDate('')
                setTempToDate('')
                const url = new URL(window.location.href)
                url.searchParams.delete('from_date')
                url.searchParams.delete('to_date')
                router.push(url.pathname + url.search)
                router.refresh()
              }
            }}
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '8px 16px',
              color: 'var(--text-primary)',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="">All Months</option>
            {Array.from({ length: 24 }).map((_, i) => {
              const d = new Date()
              d.setMonth(d.getMonth() - i)
              const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
              const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
              return <option key={val} value={val}>{label}</option>
            })}
          </select>
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
          <button
            className="btn-primary"
            onClick={handleSyncExpensesLive}
            disabled={isSyncingExpenses}
            style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>⚡</span>
            {isSyncingExpenses ? 'Syncing Expenses Live...' : 'Sync Expenses Live to Cloud'}
          </button>
          <button className="btn-primary" onClick={() => {
            resetForm()
            setEditingExpense(null)
            setShowExpenseModal(true)
          }}>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: '14px', paddingLeft: '16px' }}>Less: Cost of Goods (Deals)</span>
              <span style={{ fontSize: '14px' }}>- {formatCurrency(data.cogsDevices)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '16px', color: 'var(--text-muted)', borderBottom: '2px solid var(--border)' }}>
              <span style={{ fontSize: '14px', paddingLeft: '16px' }}>Less: Logistics Charges (Deals)</span>
              <span style={{ fontSize: '14px' }}>- {formatCurrency(data.cogsLogistics)}</span>
            </div>
            
            {/* Gross Profit */}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 700, fontSize: '16px', color: 'var(--accent-green)' }}>Gross Profit</span>
              <span style={{ fontWeight: 700, fontSize: '16px', color: 'var(--accent-green)' }}>{formatCurrency(data.grossProfit)}</span>
            </div>

            {/* Amex Cashback Profit */}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '16px', color: 'var(--accent-purple)', borderBottom: '2px solid var(--border)' }}>
              <span style={{ fontSize: '14px', paddingLeft: '16px' }}>Plus: Amex Cashback Profit</span>
              <span style={{ fontSize: '14px', fontWeight: 600 }}>+ {formatCurrency(data.amexProfit)}</span>
            </div>

            {/* OPEX */}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', marginTop: '8px' }}>
              <span style={{ fontWeight: 600, fontSize: '15px' }}>Operating Expenses</span>
            </div>
            
            {/* Individual expenses list */}
            {expenseHistory.map((exp) => {
              const displayAmt = currency === 'usd' ? Number(exp.amount) : Number(exp.amount) * 3.674
              return (
                <div key={exp.id} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '14px', paddingLeft: '16px', paddingBottom: '8px' }}>
                  <span>
                    {exp.description}{' '}
                    {exp.reference_link ? (
                      <a href={exp.reference_link} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: 'var(--accent-purple)', marginLeft: '8px', textDecoration: 'underline' }}>
                        🔗 Ref
                      </a>
                    ) : (
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                        (No Ref)
                      </span>
                    )}
                  </span>
                  <span>- {formatCurrency(displayAmt)}</span>
                </div>
              )
            })}

            {expenseHistory.length === 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', paddingBottom: '8px' }}>
                <span style={{ fontSize: '14px', paddingLeft: '16px' }}>General & Administrative</span>
                <span style={{ fontSize: '14px' }}>{formatCurrency(data.opex)}</span>
              </div>
            )}
            
            <div style={{ borderBottom: '2px solid var(--border)', paddingBottom: '8px' }} />

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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
              <span style={{ fontSize: '15px', fontWeight: 600 }}>Unsold Inventory ↗</span>
              <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent-purple)' }}>{formatCurrency(data.inventoryAsset)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: '13px' }}>Logistics charges for unsold inventory</span>
              <span style={{ fontSize: '13px' }}>{formatCurrency(data.freight)}</span>
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
                        <div style={{ fontSize: '14px', fontWeight: 600 }}>
                          {exp.description}
                          {exp.reference_link && (
                            <a href={exp.reference_link} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: 'var(--accent-purple)', marginLeft: '8px', textDecoration: 'underline' }}>
                              🔗 Ref
                            </a>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {exp.category} • {new Date(exp.expense_date).toLocaleDateString()}
                        </div>
                      </div>
                      <div style={{ fontWeight: 600, color: 'var(--status-red)', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        <span>-{formatCurrency(displayAmt)}</span>
                        {userRole === 'SUPER_ADMIN' && (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button 
                              onClick={() => handleEditClick(exp)}
                              style={{ fontSize: '11px', background: 'transparent', border: 'none', color: 'var(--accent-purple)', cursor: 'pointer' }}
                            >
                              Edit
                            </button>
                            <button 
                              onClick={() => handleDelete(exp.id)}
                              style={{ fontSize: '11px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Treasury & Capital Dashboard Section */}
      <div style={{ marginTop: '32px', borderTop: '1px solid var(--border)', paddingTop: '32px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '24px' }}>Treasury & Capital Statement</h2>
        
        {/* Treasury Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '32px' }}>
          
          {/* Amex Facility Card */}
          <div className="log-sum-card" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderLeft: '4px solid var(--accent-purple)', padding: '20px' }}>
            <h3 style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px', textTransform: 'uppercase', fontWeight: 600 }}>Amex Card Limit</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Total Facility</span>
              <span style={{ fontWeight: 600 }}>{formatCurrency(data.treasury.amexLimit)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Cash Stuck in Deals</span>
              <span style={{ fontWeight: 600, color: 'var(--status-red)' }}>-{formatCurrency(data.treasury.amexLimit - data.treasury.amexAvailable)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--border)', fontWeight: 700 }}>
              <span>Available on Card</span>
              <span style={{ color: 'var(--accent-green)' }}>{formatCurrency(data.treasury.amexAvailable)}</span>
            </div>
          </div>

          {/* Cash Pool Card */}
          <div className="log-sum-card" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderLeft: '4px solid var(--accent-blue)', padding: '20px' }}>
            <h3 style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px', textTransform: 'uppercase', fontWeight: 600 }}>Cash Pool (In Hand)</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Total Cash Pool</span>
              <span style={{ fontWeight: 600 }}>{formatCurrency(data.treasury.cashLimit)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Cash Stuck in Deals</span>
              <span style={{ fontWeight: 600, color: 'var(--status-red)' }}>-{formatCurrency(data.treasury.cashLimit - data.treasury.cashAvailable)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--border)', fontWeight: 700 }}>
              <span>Available Cash in Hand</span>
              <span style={{ color: 'var(--accent-green)' }}>{formatCurrency(data.treasury.cashAvailable)}</span>
            </div>
          </div>

        </div>

        {/* Partners Equity & Withdrawals Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '32px' }}>
          
          {/* Partners list */}
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Partner Capital Accounts</h3>
              <a 
                href="/dashboard/partners" 
                style={{ fontSize: '12px', color: 'var(--accent-purple)', textDecoration: 'underline', fontWeight: 600 }}
              >
                Manage Partners ↗
              </a>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {partners.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No partner accounts created.</p>
              ) : (
                partners.map((p: any) => {
                  const displayBal = currency === 'usd' ? Number(p.balance || 0) : Number(p.balance || 0) * 3.674
                  return (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '14px' }}>{p.name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Share: {p.equity_share}%
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{formatCurrency(displayBal)}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Withdrawable Balance</div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Partner Ledger / Withdrawals */}
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Recent Capital & Withdrawal Activities</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '300px', overflowY: 'auto', paddingRight: '8px' }}>
              {partnerTransactions.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No partner transactions logged yet.</p>
              ) : (
                partnerTransactions.slice(0, 10).map((tx: any) => {
                  const displayAmt = currency === 'usd' ? Number(tx.amount) : Number(tx.amount) * 3.674
                  const isNegative = tx.type === 'WITHDRAWAL'
                  return (
                    <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '8px', borderBottom: '1px solid var(--border)', fontSize: '13px' }}>
                      <div>
                        <span style={{ fontWeight: 600 }}>{tx.partners?.name || 'Partner'}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '11px', marginLeft: '6px' }}>
                          ({tx.type.replace('_', ' ')})
                        </span>
                        {tx.notes && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{tx.notes}</div>}
                      </div>
                      <div style={{ fontWeight: 600, color: isNegative ? 'var(--status-red)' : 'var(--accent-green)' }}>
                        {isNegative ? '-' : '+'}{formatCurrency(displayAmt)}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Monthly Treasury Settlement & AMEX Payoff History */}
      <TreasuryControlSection
        initialTransactions={treasuryTransactions}
        currency={currency}
        userRole={userRole || ''}
      />

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
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label>Reference Link (Optional)</label>
                <input type="url" className="form-input" placeholder="e.g. https://drive.google.com/..." value={refLink} onChange={e => setRefLink(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label>Date</label>
                <input type="date" className="form-input" required value={expenseDate} onChange={e => setExpenseDate(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label>Receipt / Document (Optional)</label>
                <input type="file" className="form-input" accept=".pdf,image/*" ref={fileInputRef} />
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
                <button type="submit" className="btn-primary" disabled={isPending || uploading}>
                  {isPending || uploading ? 'Saving...' : (editingExpense ? 'Save Changes' : 'Save Expense')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

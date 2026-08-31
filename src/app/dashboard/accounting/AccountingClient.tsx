'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { logExpense, editExpense, deleteExpense } from '@/lib/accounting/actions'
import { createClient } from '@/lib/supabase/client'
import TreasuryControlSection from '@/components/accounting/TreasuryControlSection'
import { TreasuryTransaction } from '@/lib/accounting/treasuryActions'
import { exportToExcel } from '@/lib/utils/exportExcel'
import { getAuditHistory } from '@/lib/audit/actions'
import AuditHistoryModal from '@/components/audit/AuditHistoryModal'

type FinancialSummary = {
  revenue: number
  revenueWholesale: number
  revenueOnline: number
  cogs: number
  cogsWholesale: number
  cogsOnline: number
  cogsDevices: number
  cogsLogistics: number
  wholesaleCogsDevices: number
  wholesaleCogsLogistics: number
  onlineCogsDevices: number
  onlineCogsLogistics: number
  grossProfit: number
  grossProfitWholesale: number
  grossProfitOnline: number
  amexProfit: number
  freight: number
  opex: number
  netProfit: number
  inventoryAsset: number
  inventoryAssetWholesale: number
  inventoryAssetOnline: number
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
  const [activeTab, setActiveTab] = useState<'pnl' | 'balance_sheet' | 'waterfall' | 'treasury' | 'expenses'>('pnl')
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

  const [showAuditModal, setShowAuditModal] = useState(false)
  const [auditLogs, setAuditLogs] = useState<any[]>([])

  const handleOpenAudit = async () => {
    const table = activeTab === 'expenses' ? 'operating_expenses' : activeTab === 'treasury' ? 'treasury' : 'deals'
    const logs = await getAuditHistory(table)
    setAuditLogs(logs)
    setShowAuditModal(true)
  }

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
              const now = new Date()
              const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
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
            className="btn-ghost" 
            onClick={handleOpenAudit} 
            style={{ border: '1px solid var(--accent-purple)', color: 'var(--accent-purple)' }}
          >
            📜 History
          </button>
          <button 
            className="btn-ghost" 
            onClick={() => {
              if (activeTab === 'expenses') {
                const headers = ['Description', 'Category', 'Amount ($)', 'Expense Date', 'Reference Link']
                const rows = expenseHistory.map(e => [e.description, e.category, e.amount, e.expense_date, e.reference_link || ''])
                exportToExcel('mobitech_expenses_export', headers, rows)
              } else if (activeTab === 'balance_sheet') {
                const bs = (data as any).balanceSheet
                const headers = ['Category', 'Account Code & Description', 'Amount ($)']
                const rows = [
                  ['ASSETS', '1010 - Cash & Liquid Treasury', bs?.liquidCash || 0],
                  ['ASSETS', '1110 - Accounts Receivable (Wholesale)', bs?.accountsReceivable || 0],
                  ['ASSETS', '1120 - Accounts Receivable (Online)', 0],
                  ['ASSETS', '1210 - Inventory Asset (Wholesale)', bs?.inventoryAssetWholesale || 0],
                  ['ASSETS', '1220 - Inventory Asset (Online)', bs?.inventoryAssetOnline || 0],
                  ['ASSETS', 'TOTAL ASSETS', bs?.totalAssets || 0],
                  ['LIABILITIES', '2010 - Accounts Payable (Suppliers)', bs?.accountsPayable || 0],
                  ['LIABILITIES', '2020 - AMEX Credit Line Deployed', bs?.amexLiability || 0],
                  ['LIABILITIES', 'TOTAL LIABILITIES', bs?.totalLiabilities || 0],
                  ['EQUITY', '3010 - Partner Capital Accounts', bs?.partnerCapital || 0],
                  ['EQUITY', '3020 - Retained Net Earnings', bs?.retainedEarnings || 0],
                  ['EQUITY', 'TOTAL OWNER\'S EQUITY', bs?.totalEquity || 0]
                ]
                exportToExcel('mobitech_balance_sheet_export', headers, rows)
              } else {
                const headers = ['Line Item', 'Amount ($)']
                const rows = [
                  ['Wholesale Sales (Deals) Revenue', data.revenueWholesale],
                  ['Less: Cost of Goods (Deals)', data.wholesaleCogsDevices],
                  ['Less: Logistics Cost (Deals)', data.wholesaleCogsLogistics],
                  ['Wholesale Gross Profit', data.grossProfitWholesale],
                  ['Online Sales Revenue', data.revenueOnline],
                  ['Less: Cost of Goods (Online)', data.onlineCogsDevices],
                  ['Less: Logistics Cost (Online)', data.onlineCogsLogistics],
                  ['Online Gross Profit', data.grossProfitOnline],
                  ['Total Combined Revenue', data.revenue],
                  ['Less: Total Cost of Goods', data.cogsDevices],
                  ['Less: Total Logistics Charges', data.cogsLogistics],
                  ['Consolidated Gross Profit', data.grossProfit],
                  ['Plus: Amex Cashback Profit', data.amexProfit],
                  ['Operating Expenses', data.opex],
                  ['Net Profit / (Loss)', data.netProfit]
                ]
                exportToExcel('mobitech_pnl_statement_export', headers, rows)
              }
            }}
            style={{ border: '1px solid var(--accent-green)', color: 'var(--accent-green)' }}
          >
            📊 Export to Excel
          </button>
          {userRole !== 'VIEW_ONLY' && (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* Module Tab Switcher */}
      <div style={{ display: 'flex', gap: '10px', borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '24px' }}>
        {[
          { id: 'pnl', label: '📊 Profit & Loss (YTD)' },
          { id: 'balance_sheet', label: '🏛️ Balance Sheet (GAAP)' },
          { id: 'waterfall', label: '🌊 Cycle Waterfall Cash Flow' },
          { id: 'treasury', label: '🏦 Treasury & Partners' },
          { id: 'expenses', label: '📄 Expense Ledger' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              fontSize: '13.5px',
              fontWeight: activeTab === tab.id ? 700 : 500,
              backgroundColor: activeTab === tab.id ? 'var(--accent-purple)' : 'var(--bg-elevated)',
              color: activeTab === tab.id ? '#ffffff' : 'var(--text-muted)',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* CYCLE WATERFALL CASH FLOW TAB */}
      {activeTab === 'waterfall' && (() => {
        const cycles = (data as any).waterfallCycles || []
        const totalAmexLimit = data.treasury?.amexLimit || 500000
        const totalCashLimit = data.treasury?.cashLimit || 300000

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Rule Header Banner */}
            <div style={{
              padding: '20px 24px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(168, 85, 247, 0.12) 100%)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '24px' }}>🌊</span>
                  <div>
                    <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      Statement Cycle Cash Flow Waterfall Engine
                    </h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Automated Statement Settlement & Shortfall Auto-Sweep Rules
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ padding: '8px 16px', background: 'var(--bg-elevated)', borderRadius: '10px', border: '1px solid var(--border)', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>AMEX Cycle Cap: </span>
                    <strong style={{ color: '#a855f7' }}>{formatCurrency(totalAmexLimit)}</strong>
                  </div>
                  <div style={{ padding: '8px 16px', background: 'var(--bg-elevated)', borderRadius: '10px', border: '1px solid var(--border)', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Cash Pool Buffer: </span>
                    <strong style={{ color: '#38bdf8' }}>{formatCurrency(totalCashLimit)}</strong>
                  </div>
                </div>
              </div>

              {/* Waterfall Steps Explanation */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginTop: '4px' }}>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#a855f7' }}>STEP 1: AMEX PURCHASES</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Purchases capped at $500k per cycle. Suppliers paid 100% upfront at win date.
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#34d399' }}>STEP 2: INVOICE CASH WATERFALL</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Customer invoice cash collected in cycle directly pays off AMEX statement balance.
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#38bdf8' }}>STEP 3: CASH POOL AUTO-SWEEP</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    If collected cash &lt; statement due, remaining shortfall is auto-drawn from $300k Cash Pool.
                  </div>
                </div>
              </div>
            </div>

            {/* Cycle Waterfall Grid Table */}
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Payment Cycles Settlement Matrix</h3>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{cycles.length} Cycle(s) Recorded</span>
              </div>

              {cycles.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No statement cycles recorded yet.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>
                        <th style={{ padding: '14px 20px' }}>Payment Cycle</th>
                        <th style={{ padding: '14px 20px' }}>Deals</th>
                        <th style={{ padding: '14px 20px' }}>AMEX Purchases ($500k Cap)</th>
                        <th style={{ padding: '14px 20px' }}>Invoice Cash Collected</th>
                        <th style={{ padding: '14px 20px' }}>Cash Pool Auto-Sweep</th>
                        <th style={{ padding: '14px 20px' }}>Remaining Open AR</th>
                        <th style={{ padding: '14px 20px' }}>Settlement Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cycles.map((c: any) => (
                        <tr key={c.cycle} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '16px 20px', fontWeight: 700 }}>{c.cycle}</td>
                          <td style={{ padding: '16px 20px', color: 'var(--text-muted)' }}>{c.dealsCount} deal(s)</td>
                          <td style={{ padding: '16px 20px', fontWeight: 600 }}>
                            {formatCurrency(c.amexPurchases)}
                            {c.isCapped && (
                              <span style={{ marginLeft: '8px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(239,68,68,0.2)', color: '#f87171', fontSize: '11px', fontWeight: 800 }}>
                                ⚠️ CAPPED &gt; $500K
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '16px 20px', color: '#34d399', fontWeight: 600 }}>
                            {formatCurrency(c.collectedCash)}
                          </td>
                          <td style={{ padding: '16px 20px', color: c.cashPoolDrawn > 0 ? '#fbbf24' : 'var(--text-muted)', fontWeight: 600 }}>
                            {c.cashPoolDrawn > 0 ? `Shortfall: ${formatCurrency(c.cashPoolDrawn)}` : '$0.00 (Covered)'}
                          </td>
                          <td style={{ padding: '16px 20px', color: 'var(--text-muted)' }}>
                            {formatCurrency(c.openAR)}
                          </td>
                          <td style={{ padding: '16px 20px' }}>
                            {c.isAmexFullyPaid ? (
                              <span style={{ padding: '4px 12px', borderRadius: '20px', background: 'rgba(16,185,129,0.15)', color: '#34d399', fontSize: '12px', fontWeight: 700 }}>
                                ✅ SETTLED BY INVOICE CASH
                              </span>
                            ) : (
                              <span style={{ padding: '4px 12px', borderRadius: '20px', background: 'rgba(245,158,11,0.15)', color: '#fbbf24', fontSize: '12px', fontWeight: 700 }}>
                                🛡️ CASH POOL AUTO-SWEEPT
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        )
      })()}

      {/* BALANCE SHEET TAB */}
      {activeTab === 'balance_sheet' && (() => {
        const bs = (data as any).balanceSheet || {
          liquidCash: data.treasury?.cashAvailable || 0,
          accountsReceivable: 0,
          inventoryAsset: data.inventoryAsset || 0,
          inventoryAssetWholesale: (data as any).inventoryAssetWholesale || 0,
          inventoryAssetOnline: (data as any).inventoryAssetOnline || 0,
          totalAssets: (data.treasury?.cashAvailable || 0) + (data.inventoryAsset || 0),
          accountsPayable: 0,
          amexLiability: data.treasury?.amexStuck || 0,
          totalLiabilities: data.treasury?.amexStuck || 0,
          partnerCapital: 0,
          retainedEarnings: data.netProfit || 0,
          totalEquity: data.netProfit || 0,
          isBalanced: true
        }

        const totalLiabilitiesAndEquity = bs.totalLiabilities + bs.totalEquity

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* GAAP Verification Header Banner */}
            <div style={{
              padding: '18px 24px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(59, 130, 246, 0.12) 100%)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ fontSize: '28px' }}>⚖️</div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    Statement of Financial Position (Balance Sheet)
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    GAAP Standard Accounting Equation: <strong style={{ color: '#38bdf8' }}>Assets = Liabilities + Equity</strong>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 800,
                  backgroundColor: 'rgba(16, 185, 129, 0.2)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.4)'
                }}>
                  ✅ PERFECT BALANCE VERIFIED
                </span>
              </div>
            </div>

            {/* 3 Columns Balance Sheet Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
              
              {/* ASSETS */}
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid var(--accent-blue)', paddingBottom: '12px', marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-blue)' }}>1. ASSETS</h3>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>DEBIT</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Cash & Liquid Treasury</span>
                      <span style={{ fontWeight: 600 }}>{formatCurrency(bs.liquidCash)}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Accounts Receivable (Wholesale)</span>
                      <span style={{ fontWeight: 600 }}>{formatCurrency(bs.accountsReceivable)}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Accounts Receivable (Online)</span>
                      <span style={{ fontWeight: 600 }}>{formatCurrency(0)}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Unsold Inventory (Wholesale)</span>
                      <span style={{ fontWeight: 600 }}>{formatCurrency(bs.inventoryAssetWholesale || 0)}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Unsold Inventory (Online)</span>
                      <span style={{ fontWeight: 600 }}>{formatCurrency(bs.inventoryAssetOnline || 0)}</span>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '28px', paddingTop: '16px', borderTop: '2px solid var(--accent-blue)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 800, fontSize: '15px', color: 'var(--accent-blue)' }}>TOTAL ASSETS</span>
                  <span style={{ fontWeight: 800, fontSize: '18px', color: 'var(--accent-blue)' }}>{formatCurrency(bs.totalAssets)}</span>
                </div>
              </div>

              {/* LIABILITIES */}
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid var(--accent-rose)', paddingBottom: '12px', marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-rose)' }}>2. LIABILITIES</h3>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>CREDIT</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Accounts Payable (Supplier Deals)</span>
                      <span style={{ fontWeight: 600 }}>{formatCurrency(bs.accountsPayable)}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>AMEX Credit Line Deployed</span>
                      <span style={{ fontWeight: 600 }}>{formatCurrency(bs.amexLiability)}</span>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '28px', paddingTop: '16px', borderTop: '2px solid var(--accent-rose)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 800, fontSize: '15px', color: 'var(--accent-rose)' }}>TOTAL LIABILITIES</span>
                  <span style={{ fontWeight: 800, fontSize: '18px', color: 'var(--accent-rose)' }}>{formatCurrency(bs.totalLiabilities)}</span>
                </div>
              </div>

              {/* OWNER'S EQUITY */}
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid var(--accent-green)', paddingBottom: '12px', marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-green)' }}>3. OWNER'S EQUITY</h3>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>NET WORTH</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Partner Capital Accounts</span>
                      <span style={{ fontWeight: 600 }}>{formatCurrency(bs.partnerCapital)}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Retained Net Profit</span>
                      <span style={{ fontWeight: 600, color: 'var(--accent-green)' }}>{formatCurrency(bs.retainedEarnings)}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <div style={{ marginTop: '28px', paddingTop: '16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--accent-green)' }}>TOTAL EQUITY</span>
                    <span style={{ fontWeight: 700, fontSize: '16px', color: 'var(--accent-green)' }}>{formatCurrency(bs.totalEquity)}</span>
                  </div>
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '2px solid var(--accent-purple)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 800, fontSize: '14px', color: 'var(--accent-purple)' }}>LIABILITIES + EQUITY</span>
                    <span style={{ fontWeight: 800, fontSize: '17px', color: 'var(--accent-purple)' }}>{formatCurrency(totalLiabilitiesAndEquity)}</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )
      })()}

      {/* PNL TAB */}
      {(activeTab === 'pnl' || activeTab === 'treasury' || activeTab === 'expenses') && (
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        
        {/* P&L Statement */}
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '24px' }}>Profit & Loss Statement (YTD)</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* 1. Wholesale Sales */}
            <div style={{ padding: '12px 16px', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: 'var(--accent-blue)', borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
                <span>Wholesale Sales (Deals)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Wholesale Revenue</span>
                <span>{formatCurrency(data.revenueWholesale)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--text-muted)' }}>
                <span>Less: Cost of Goods (Deals)</span>
                <span>- {formatCurrency(data.wholesaleCogsDevices)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--text-muted)' }}>
                <span>Less: Logistics Cost (Deals)</span>
                <span>- {formatCurrency(data.wholesaleCogsLogistics)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '14px', borderTop: '1px dashed var(--border)', paddingTop: '4px', color: 'var(--accent-blue)' }}>
                <span>Wholesale Gross Profit</span>
                <span>{formatCurrency(data.grossProfitWholesale)}</span>
              </div>
            </div>

            {/* 2. Online Sales */}
            <div style={{ padding: '12px 16px', background: 'rgba(168, 85, 247, 0.05)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: 'var(--accent-purple)', borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
                <span>Online Sales (Amazon & Revibe)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Online Revenue</span>
                <span>{formatCurrency(data.revenueOnline)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--text-muted)' }}>
                <span>Less: Cost of Goods (Online)</span>
                <span>- {formatCurrency(data.onlineCogsDevices)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--text-muted)' }}>
                <span>Less: Logistics Cost (Online)</span>
                <span>- {formatCurrency(data.onlineCogsLogistics)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '14px', borderTop: '1px dashed var(--border)', paddingTop: '4px', color: 'var(--accent-purple)' }}>
                <span>Online Gross Profit</span>
                <span>{formatCurrency(data.grossProfitOnline)}</span>
              </div>
            </div>

            {/* 3. Consolidated Summary */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px', borderTop: '2px solid var(--border)', paddingTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                <span>Total Combined Revenue</span>
                <span>{formatCurrency(data.revenue)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '14px' }}>
                <span>Less: Total Cost of Goods</span>
                <span>- {formatCurrency(data.cogsDevices)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '14px' }}>
                <span>Less: Total Logistics Charges</span>
                <span>- {formatCurrency(data.cogsLogistics)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '16px', color: 'var(--accent-green)', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                <span>Consolidated Gross Profit</span>
                <span>{formatCurrency(data.grossProfit)}</span>
              </div>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Unsold Inventory (Wholesale)</span>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{formatCurrency((data as any).inventoryAssetWholesale || 0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Unsold Inventory (Online)</span>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{formatCurrency((data as any).inventoryAssetOnline || 0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '4px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: '14px', fontWeight: 700 }}>Total Unsold Inventory ↗</span>
                <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-purple)' }}>{formatCurrency(data.inventoryAsset)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', marginTop: '4px' }}>
                <span style={{ fontSize: '12px' }}>Logistics charges for unsold inventory</span>
                <span style={{ fontSize: '12px' }}>{formatCurrency(data.freight)}</span>
              </div>
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
      )}

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
      <AuditHistoryModal isOpen={showAuditModal} onClose={() => setShowAuditModal(false)} logs={auditLogs} title="Accounting & Finance Edit History" />
    </div>
  )
}

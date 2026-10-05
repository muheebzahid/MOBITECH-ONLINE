'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { logExpense, editExpense, deleteExpense } from '@/lib/accounting/actions'
import { createClient } from '@/lib/supabase/client'
import { exportToExcel } from '@/lib/utils/exportExcel'
import { getAuditHistory } from '@/lib/audit/actions'
import AuditHistoryModal from '@/components/audit/AuditHistoryModal'

export type PlatformMetrics = {
  unitsSold: number
  revenue: number
  cogsDevices: number
  cogsLogistics: number
  repairCost: number
  otherExpenses: number
  totalCost: number
  grossProfit: number
  netProfit: number
  roi: number
}

export type SkuFinancialMetric = {
  model: string
  storage: string
  grade: string
  quantity: number
  revenue: number
  cogsDevices: number
  logisticsCost: number
  repairCost: number
  totalCost: number
  netProfit: number
  avgPrice: number
  avgCost: number
  profitPerUnit: number
  roi: number
}

export type OnlineFinancialMetrics = {
  totalUnitsSold: number
  totalRevenue: number
  cogsDevices: number
  cogsLogistics: number
  totalRepairCost: number
  otherExpenses: number
  totalCost: number
  grossProfit: number
  netProfit: number
  roi: number
  grossMarginPct: number
  netMarginPct: number
  avgSellingPrice: number
  avgCostPerUnit: number
  avgProfitPerUnit: number
  platformBreakdown: {
    amazon: PlatformMetrics
    revibe: PlatformMetrics
  }
  skuBreakdown: SkuFinancialMetric[]
}

export type FinancialSummary = {
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
  onlineMetrics?: OnlineFinancialMetrics
  treasury?: {
    amexLimit: number
    amexStuck: number
    amexAvailable: number
    cashLimit: number
    cashStuck: number
    cashAvailable: number
  }
  balanceSheet?: {
    liquidCash: number
    accountsReceivable: number
    inventoryAsset: number
    inventoryAssetWholesale: number
    inventoryAssetOnline: number
    totalAssets: number
    accountsPayable: number
    amexLiability: number
    totalLiabilities: number
    partnerCapital: number
    retainedEarnings: number
    totalEquity: number
    isBalanced: boolean
  }
}

export default function AccountingClient({ 
  summary, 
  expenseHistory = [],
  statementDates = [],
  selectedStatementDate,
  fromDate,
  toDate,
  userRole
}: { 
  summary: { usd: FinancialSummary, aed: FinancialSummary }, 
  expenseHistory?: any[],
  partners?: any[],
  partnerTransactions?: any[],
  treasuryTransactions?: any[],
  statementDates?: string[],
  selectedStatementDate?: string,
  fromDate?: string,
  toDate?: string,
  userRole?: string
}) {
  const supabase = createClient()
  const [currency, setCurrency] = useState<'usd' | 'aed'>('usd')
  const [activeTab, setActiveTab] = useState<'pnl' | 'online' | 'balance_sheet' | 'expenses'>('pnl')
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
    const table = activeTab === 'expenses' ? 'operating_expenses' : 'deals'
    const logs = await getAuditHistory(table)
    setAuditLogs(logs)
    setShowAuditModal(true)
  }

  const data = summary[currency] || summary.usd
  const om = data.onlineMetrics || {
    totalUnitsSold: 0,
    totalRevenue: data.revenueOnline || 0,
    cogsDevices: data.onlineCogsDevices || 0,
    cogsLogistics: data.onlineCogsLogistics || 0,
    totalRepairCost: 0,
    otherExpenses: 0,
    totalCost: (data.onlineCogsDevices || 0) + (data.onlineCogsLogistics || 0),
    grossProfit: data.grossProfitOnline || 0,
    netProfit: data.grossProfitOnline || 0,
    roi: 0,
    grossMarginPct: 0,
    netMarginPct: 0,
    avgSellingPrice: 0,
    avgCostPerUnit: 0,
    avgProfitPerUnit: 0,
    platformBreakdown: {
      amazon: { unitsSold: 0, revenue: 0, cogsDevices: 0, cogsLogistics: 0, repairCost: 0, otherExpenses: 0, totalCost: 0, grossProfit: 0, netProfit: 0, roi: 0 },
      revibe: { unitsSold: 0, revenue: 0, cogsDevices: 0, cogsLogistics: 0, repairCost: 0, otherExpenses: 0, totalCost: 0, grossProfit: 0, netProfit: 0, roi: 0 }
    },
    skuBreakdown: []
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(val || 0)
  }

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

  const [isSyncingExpenses, setIsSyncingExpenses] = useState(false)

  const handleSyncExpensesLive = async () => {
    setIsSyncingExpenses(true)
    try {
      const res = await fetch('/api/sync/expenses/execute', { method: 'POST' })
      const resData = await res.json()
      if (!resData.success) {
        throw new Error(resData.error || 'Failed to sync expenses')
      }
      alert(`✅ Successfully synced ${resData.synced_count} operating expense(s) live to Online Cloud ERP!`)
      router.refresh()
    } catch (err: any) {
      alert('⚠️ Expense Sync Error: ' + err.message)
    } finally {
      setIsSyncingExpenses(false)
    }
  }

  return (
    <div className="page-root">
      {/* Page Header */}
      <div className="page-header" style={{ alignItems: 'center' }}>
        <div style={{ marginBottom: '8px' }}>
          <h1 className="page-title">Financial Treasury & Accounting</h1>
          <p className="page-subtitle">Real-time automated Wholesale, Online Sales & Profit & Loss</p>
        </div>
        
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Date Filter */}
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
              Apply
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

          {/* Month Selector */}
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

          {/* Currency Toggle */}
          <div style={{ display: 'flex', background: 'var(--bg-elevated)', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border)' }}>
            <button 
              style={{ padding: '8px 16px', border: 'none', background: currency === 'usd' ? 'var(--accent-purple)' : 'transparent', color: currency === 'usd' ? 'white' : 'var(--text-primary)', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
              onClick={() => setCurrency('usd')}
            >
              USD ($)
            </button>
            <button 
              style={{ padding: '8px 16px', border: 'none', background: currency === 'aed' ? 'var(--accent-purple)' : 'transparent', color: currency === 'aed' ? 'white' : 'var(--text-primary)', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
              onClick={() => setCurrency('aed')}
            >
              AED (د.إ)
            </button>
          </div>

          <button 
            className="btn-ghost" 
            onClick={handleOpenAudit} 
            style={{ border: '1px solid var(--accent-purple)', color: 'var(--accent-purple)' }}
          >
            📜 History
          </button>

          {/* Excel Export */}
          <button 
            className="btn-ghost" 
            onClick={() => {
              if (activeTab === 'expenses') {
                const headers = ['Description', 'Category', `Amount (${currency.toUpperCase()})`, 'Expense Date', 'Reference Link']
                const rows = (expenseHistory || []).map(e => [
                  e.description, 
                  e.category, 
                  currency === 'usd' ? Number(e.amount) : Number(e.amount) * 3.674, 
                  e.expense_date, 
                  e.reference_link || ''
                ])
                exportToExcel('mobitech_expenses_export', headers, rows)
              } else if (activeTab === 'online') {
                const headers = ['Model', 'Storage', 'Grade', 'Qty Sold', `Revenue (${currency.toUpperCase()})`, `Avg Price`, `Device Cost`, `Repair Cost`, `Total Cost`, `Net Profit`, `Profit/Unit`, 'ROI %']
                const rows = (om.skuBreakdown || []).map(s => [
                  s.model,
                  s.storage,
                  s.grade,
                  s.quantity,
                  s.revenue,
                  s.avgPrice,
                  s.cogsDevices,
                  s.repairCost,
                  s.totalCost,
                  s.netProfit,
                  s.profitPerUnit,
                  `${s.roi.toFixed(1)}%`
                ])
                exportToExcel('mobitech_online_sales_pnl_export', headers, rows)
              } else if (activeTab === 'balance_sheet') {
                const bs = (data as any).balanceSheet
                const headers = ['Category', 'Account Code & Description', `Amount (${currency.toUpperCase()})`]
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
                  ['EQUITY', '3020 - Retained Net Earnings', bs?.retainedEarnings || 0],
                  ['EQUITY', 'TOTAL OWNER\'S EQUITY', bs?.totalEquity || 0]
                ]
                exportToExcel('mobitech_balance_sheet_export', headers, rows)
              } else {
                const headers = ['Line Item', `Amount (${currency.toUpperCase()})`]
                const rows = [
                  ['Wholesale Sales (Deals) Revenue', data.revenueWholesale],
                  ['Less: Cost of Goods (Deals)', data.wholesaleCogsDevices],
                  ['Less: Logistics Cost (Deals)', data.wholesaleCogsLogistics],
                  ['Wholesale Gross Profit', data.grossProfitWholesale],
                  ['Online Sales Revenue', data.revenueOnline],
                  ['Less: Cost of Goods (Online Base Stock)', om.cogsDevices],
                  ['Less: Logistics Cost (Online Freight)', om.cogsLogistics],
                  ['Less: Device Repair & Refurbishment Costs', om.totalRepairCost],
                  ['Less: Online Platform & Marketing Expenses', om.otherExpenses],
                  ['Online Net Profit', om.netProfit],
                  ['Total Combined Revenue', data.revenue],
                  ['Less: Total Cost of Goods (Base Stock)', data.cogsDevices],
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
                {isSyncingExpenses ? 'Syncing...' : 'Sync Expenses Live'}
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
          { id: 'online', label: '🛒 Online Sales P&L & Performance' },
          { id: 'balance_sheet', label: '🏛️ Balance Sheet (GAAP)' },
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

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 1. NEW DEDICATED TAB: ONLINE SALES P&L & PERFORMANCE          */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'online' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Top 6 KPI Stat Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            
            {/* 1. Total Quantity Sold */}
            <div className="log-sum-card" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderTop: '3px solid #8b5cf6', padding: '18px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '6px' }}>
                Total Quantity Sold
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)' }}>
                {om.totalUnitsSold} <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-muted)' }}>Units</span>
              </div>
              <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', fontWeight: 600 }}>
                  Amazon: {om.platformBreakdown.amazon.unitsSold}
                </span>
                <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(168, 85, 247, 0.15)', color: '#a855f7', fontWeight: 600 }}>
                  Revibe: {om.platformBreakdown.revibe.unitsSold}
                </span>
              </div>
            </div>

            {/* 2. Total Online Revenue */}
            <div className="log-sum-card" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderTop: '3px solid #3b82f6', padding: '18px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '6px' }}>
                Total Online Revenue
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#38bdf8' }}>
                {formatCurrency(om.totalRevenue)}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                Avg Selling Price: <strong>{formatCurrency(om.avgSellingPrice)}</strong>/unit
              </div>
            </div>

            {/* 3. Total Repair Cost */}
            <div className="log-sum-card" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderTop: '3px solid #f97316', padding: '18px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '6px' }}>
                Total Repair Cost
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#fb923c' }}>
                {formatCurrency(om.totalRepairCost)}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                Avg Refurb: <strong>{formatCurrency(om.totalUnitsSold > 0 ? om.totalRepairCost / om.totalUnitsSold : 0)}</strong>/unit
              </div>
            </div>

            {/* 4. Other Online Expenses */}
            <div className="log-sum-card" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderTop: '3px solid #ef4444', padding: '18px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '6px' }}>
                Other Online Expenses
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#f87171' }}>
                {formatCurrency(om.otherExpenses)}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                Platform fees, packaging & marketing
              </div>
            </div>

            {/* 5. Net Online Profit */}
            <div className="log-sum-card" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderTop: `3px solid ${om.netProfit >= 0 ? '#10b981' : '#ef4444'}`, padding: '18px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '6px' }}>
                Net Online Profit
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: om.netProfit >= 0 ? '#34d399' : '#f87171' }}>
                {formatCurrency(om.netProfit)}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                Net Margin: <strong>{om.netMarginPct.toFixed(1)}%</strong> • <strong>{formatCurrency(om.avgProfitPerUnit)}</strong>/unit
              </div>
            </div>

            {/* 6. Return on Investment (ROI %) */}
            <div className="log-sum-card" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderTop: '3px solid #06b6d4', padding: '18px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '6px' }}>
                Return on Investment (ROI)
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: om.roi >= 0 ? '#22d3ee' : '#f87171' }}>
                {om.roi >= 0 ? '+' : ''}{om.roi.toFixed(1)}%
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                Investment Base: <strong>{formatCurrency(om.totalCost)}</strong>
              </div>
            </div>

          </div>

          {/* Platform Channel Breakdown (Amazon vs Revibe) */}
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>Channel Performance Comparison</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>Side-by-side performance matrix for Amazon and Revibe online selling channels</p>
              </div>
            </div>
            
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>
                    <th style={{ padding: '12px 18px' }}>Platform Channel</th>
                    <th style={{ padding: '12px 18px', textAlign: 'center' }}>Units Sold</th>
                    <th style={{ padding: '12px 18px', textAlign: 'right' }}>Gross Revenue</th>
                    <th style={{ padding: '12px 18px', textAlign: 'right' }}>Device Base Cost</th>
                    <th style={{ padding: '12px 18px', textAlign: 'right' }}>Logistics Cost</th>
                    <th style={{ padding: '12px 18px', textAlign: 'right' }}>Repair Cost</th>
                    <th style={{ padding: '12px 18px', textAlign: 'right' }}>Total Investment</th>
                    <th style={{ padding: '12px 18px', textAlign: 'right' }}>Net Profit</th>
                    <th style={{ padding: '12px 18px', textAlign: 'right' }}>ROI %</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Amazon Row */}
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '14px 18px', fontWeight: 700 }}>
                      <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', fontSize: '12px' }}>
                        📦 Amazon FBA
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', textAlign: 'center', fontWeight: 600 }}>{om.platformBreakdown.amazon.unitsSold}</td>
                    <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(om.platformBreakdown.amazon.revenue)}</td>
                    <td style={{ padding: '14px 18px', textAlign: 'right', color: 'var(--text-muted)' }}>{formatCurrency(om.platformBreakdown.amazon.cogsDevices)}</td>
                    <td style={{ padding: '14px 18px', textAlign: 'right', color: 'var(--text-muted)' }}>{formatCurrency(om.platformBreakdown.amazon.cogsLogistics)}</td>
                    <td style={{ padding: '14px 18px', textAlign: 'right', color: '#fb923c' }}>{formatCurrency(om.platformBreakdown.amazon.repairCost)}</td>
                    <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(om.platformBreakdown.amazon.totalCost)}</td>
                    <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: 700, color: om.platformBreakdown.amazon.netProfit >= 0 ? '#34d399' : '#f87171' }}>
                      {formatCurrency(om.platformBreakdown.amazon.netProfit)}
                    </td>
                    <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: 700, color: om.platformBreakdown.amazon.roi >= 0 ? '#22d3ee' : '#f87171' }}>
                      {om.platformBreakdown.amazon.roi >= 0 ? '+' : ''}{om.platformBreakdown.amazon.roi.toFixed(1)}%
                    </td>
                  </tr>

                  {/* Revibe Row */}
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '14px 18px', fontWeight: 700 }}>
                      <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'rgba(168, 85, 247, 0.15)', color: '#a855f7', fontSize: '12px' }}>
                        🛍️ Revibe
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', textAlign: 'center', fontWeight: 600 }}>{om.platformBreakdown.revibe.unitsSold}</td>
                    <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(om.platformBreakdown.revibe.revenue)}</td>
                    <td style={{ padding: '14px 18px', textAlign: 'right', color: 'var(--text-muted)' }}>{formatCurrency(om.platformBreakdown.revibe.cogsDevices)}</td>
                    <td style={{ padding: '14px 18px', textAlign: 'right', color: 'var(--text-muted)' }}>{formatCurrency(om.platformBreakdown.revibe.cogsLogistics)}</td>
                    <td style={{ padding: '14px 18px', textAlign: 'right', color: '#fb923c' }}>{formatCurrency(om.platformBreakdown.revibe.repairCost)}</td>
                    <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(om.platformBreakdown.revibe.totalCost)}</td>
                    <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: 700, color: om.platformBreakdown.revibe.netProfit >= 0 ? '#34d399' : '#f87171' }}>
                      {formatCurrency(om.platformBreakdown.revibe.netProfit)}
                    </td>
                    <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: 700, color: om.platformBreakdown.revibe.roi >= 0 ? '#22d3ee' : '#f87171' }}>
                      {om.platformBreakdown.revibe.roi >= 0 ? '+' : ''}{om.platformBreakdown.revibe.roi.toFixed(1)}%
                    </td>
                  </tr>

                  {/* Total Online Row */}
                  <tr style={{ background: 'rgba(255,255,255,0.03)', fontWeight: 800 }}>
                    <td style={{ padding: '14px 18px', color: 'var(--accent-purple)' }}>TOTAL COMBINED ONLINE</td>
                    <td style={{ padding: '14px 18px', textAlign: 'center' }}>{om.totalUnitsSold}</td>
                    <td style={{ padding: '14px 18px', textAlign: 'right' }}>{formatCurrency(om.totalRevenue)}</td>
                    <td style={{ padding: '14px 18px', textAlign: 'right' }}>{formatCurrency(om.cogsDevices)}</td>
                    <td style={{ padding: '14px 18px', textAlign: 'right' }}>{formatCurrency(om.cogsLogistics)}</td>
                    <td style={{ padding: '14px 18px', textAlign: 'right', color: '#fb923c' }}>{formatCurrency(om.totalRepairCost)}</td>
                    <td style={{ padding: '14px 18px', textAlign: 'right' }}>{formatCurrency(om.totalCost)}</td>
                    <td style={{ padding: '14px 18px', textAlign: 'right', color: om.netProfit >= 0 ? '#34d399' : '#f87171' }}>
                      {formatCurrency(om.netProfit)}
                    </td>
                    <td style={{ padding: '14px 18px', textAlign: 'right', color: om.roi >= 0 ? '#22d3ee' : '#f87171' }}>
                      {om.roi >= 0 ? '+' : ''}{om.roi.toFixed(1)}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* SKU / Model-Level Profitability Table */}
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>Model & SKU Profitability Matrix</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>Detailed breakdown by device model, repair costs, landed costs, profit, and ROI</p>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {om.skuBreakdown.length} Model Variant(s) Sold
              </span>
            </div>

            {om.skuBreakdown.length === 0 ? (
              <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
                No online sales SKU records found for the selected period.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '11.5px', textTransform: 'uppercase' }}>
                      <th style={{ padding: '12px 16px' }}>Device Model</th>
                      <th style={{ padding: '12px 16px' }}>Storage</th>
                      <th style={{ padding: '12px 16px' }}>Grade</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center' }}>Qty</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Total Revenue</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Avg Price</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Base Stock Cost</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Repair Cost</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Total Landed Cost</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Net Profit</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Profit / Unit</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>ROI %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {om.skuBreakdown.map((sku, idx) => (
                      <tr key={`${sku.model}-${sku.storage}-${sku.grade}-${idx}`} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 600 }}>{sku.model}</td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{sku.storage || '-'}</td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{sku.grade || '-'}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700 }}>{sku.quantity}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(sku.revenue)}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-muted)' }}>{formatCurrency(sku.avgPrice)}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-muted)' }}>{formatCurrency(sku.cogsDevices)}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: '#fb923c' }}>{formatCurrency(sku.repairCost)}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(sku.totalCost)}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: sku.netProfit >= 0 ? '#34d399' : '#f87171' }}>
                          {formatCurrency(sku.netProfit)}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: sku.profitPerUnit >= 0 ? '#34d399' : '#f87171' }}>
                          {formatCurrency(sku.profitPerUnit)}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: sku.roi >= 0 ? '#22d3ee' : '#f87171' }}>
                          {sku.roi >= 0 ? '+' : ''}{sku.roi.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 2. MAIN CONSOLIDATED P&L TAB                                  */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'pnl' && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
          
          {/* P&L Statement */}
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '24px' }}>Profit & Loss Statement (YTD)</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* 1. Wholesale Sales */}
              <div style={{ padding: '14px 16px', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: 'var(--accent-blue)', borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
                  <span>Wholesale Sales (Deals)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Wholesale Revenue</span>
                  <span>{formatCurrency(data.revenueWholesale)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--text-muted)' }}>
                  <span>Less: Cost of Goods (Deals Base Cost)</span>
                  <span>- {formatCurrency(data.wholesaleCogsDevices)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--text-muted)' }}>
                  <span>Less: Logistics Cost (Deals Freight Allocation)</span>
                  <span>- {formatCurrency(data.wholesaleCogsLogistics)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '14px', borderTop: '1px dashed var(--border)', paddingTop: '4px', color: 'var(--accent-blue)' }}>
                  <span>Wholesale Gross Profit</span>
                  <span>{formatCurrency(data.grossProfitWholesale)}</span>
                </div>
              </div>

              {/* 2. Online Sales (Itemized with Repairs & ROI) */}
              <div style={{ padding: '14px 16px', background: 'rgba(168, 85, 247, 0.05)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 600, color: 'var(--accent-purple)', borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
                  <span>Online Sales (Amazon & Revibe)</span>
                  <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '12px', background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', fontWeight: 700 }}>
                    {om.totalUnitsSold} Units Sold • ROI: {om.roi.toFixed(1)}%
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Online Sales Revenue</span>
                  <span style={{ fontWeight: 600 }}>{formatCurrency(data.revenueOnline)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--text-muted)' }}>
                  <span>Less: Cost of Goods (Base Device Stock)</span>
                  <span>- {formatCurrency(om.cogsDevices)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--text-muted)' }}>
                  <span>Less: Logistics Cost (Shipping Allocation)</span>
                  <span>- {formatCurrency(om.cogsLogistics)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#fb923c' }}>
                  <span>Less: Device Refurbishment & Repair Costs</span>
                  <span>- {formatCurrency(om.totalRepairCost)}</span>
                </div>
                {om.otherExpenses > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#f87171' }}>
                    <span>Less: Online Marketing & Platform Expenses</span>
                    <span>- {formatCurrency(om.otherExpenses)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '14px', borderTop: '1px dashed var(--border)', paddingTop: '4px', color: 'var(--accent-purple)' }}>
                  <span>Online Net Profit</span>
                  <span>{formatCurrency(om.netProfit)}</span>
                </div>
              </div>

              {/* 3. Consolidated Summary */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px', borderTop: '2px solid var(--border)', paddingTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                  <span>Total Combined Revenue</span>
                  <span>{formatCurrency(data.revenue)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '14px' }}>
                  <span>Less: Total Cost of Goods (Base Stock)</span>
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
              {(expenseHistory || []).map((exp) => {
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
                window.location.href = '/dashboard/deals?highlight=unsold'
              }}
            >
              <h3 style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>Current Inventory Assets</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Unsold Inventory (Wholesale)</span>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{formatCurrency((data as any).inventoryAssetWholesale || 0)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Unsold Inventory (Online Stock)</span>
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
                  {expenseHistory.slice(0, 8).map(exp => {
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

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 3. BALANCE SHEET TAB                                          */}
      {/* ───────────────────────────────────────────────────────────── */}
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
          retainedEarnings: data.netProfit || 0,
          totalEquity: data.netProfit || 0,
          isBalanced: true
        }

        const totalLiabilitiesAndEquity = bs.totalLiabilities + bs.totalEquity

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* GAAP Header */}
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
                    GAAP Standard Accounting Equation: <strong style={{ color: '#38bdf8' }}>Assets = Liabilities + Retained Earnings</strong>
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
                      <span style={{ color: 'var(--text-muted)' }}>Unsold Inventory (Wholesale)</span>
                      <span style={{ fontWeight: 600 }}>{formatCurrency(bs.inventoryAssetWholesale || 0)}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Unsold Inventory (Online Stock)</span>
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

              {/* EQUITY / RETAINED EARNINGS */}
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid var(--accent-green)', paddingBottom: '12px', marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-green)' }}>3. RETAINED EARNINGS</h3>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>NET WORTH</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Retained Net Profit (YTD)</span>
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

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 4. EXPENSE LEDGER TAB                                         */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'expenses' && (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>Operating Expense Ledger</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>All logged administrative, software, marketing, and operational expenses</p>
            </div>
            <button className="btn-primary" onClick={() => {
              resetForm()
              setEditingExpense(null)
              setShowExpenseModal(true)
            }}>
              + Log New Expense
            </button>
          </div>

          {expenseHistory.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No operating expenses recorded yet.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>
                    <th style={{ padding: '14px 20px' }}>Date</th>
                    <th style={{ padding: '14px 20px' }}>Category</th>
                    <th style={{ padding: '14px 20px' }}>Description</th>
                    <th style={{ padding: '14px 20px' }}>Receipt / Ref</th>
                    <th style={{ padding: '14px 20px', textAlign: 'right' }}>Amount</th>
                    {userRole === 'SUPER_ADMIN' && <th style={{ padding: '14px 20px', textAlign: 'right' }}>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {expenseHistory.map(exp => {
                    const displayAmt = currency === 'usd' ? Number(exp.amount) : Number(exp.amount) * 3.674
                    return (
                      <tr key={exp.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '14px 20px', color: 'var(--text-muted)' }}>
                          {new Date(exp.expense_date).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '14px 20px' }}>
                          <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', fontSize: '11.5px', fontWeight: 600 }}>
                            {exp.category}
                          </span>
                        </td>
                        <td style={{ padding: '14px 20px', fontWeight: 600 }}>{exp.description}</td>
                        <td style={{ padding: '14px 20px' }}>
                          {exp.reference_link ? (
                            <a href={exp.reference_link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-purple)', fontSize: '12px', textDecoration: 'underline' }}>
                              🔗 View Attachment
                            </a>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 700, color: 'var(--status-red)' }}>
                          -{formatCurrency(displayAmt)}
                        </td>
                        {userRole === 'SUPER_ADMIN' && (
                          <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                              <button 
                                onClick={() => handleEditClick(exp)}
                                style={{ fontSize: '12px', background: 'transparent', border: 'none', color: 'var(--accent-purple)', cursor: 'pointer', fontWeight: 600 }}
                              >
                                Edit
                              </button>
                              <button 
                                onClick={() => handleDelete(exp.id)}
                                style={{ fontSize: '12px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Log / Edit Expense Modal */}
      {showExpenseModal && (
        <div className="modal-overlay" onClick={(e: any) => { if (e.target === e.currentTarget) setShowExpenseModal(false) }}>
          <div className="modal-box" style={{ width: '480px' }}>
            <div className="modal-header">
              <h3>{editingExpense ? 'Edit Operating Expense' : 'Log Operating Expense'}</h3>
              <button className="btn-ghost" onClick={() => setShowExpenseModal(false)}>✕</button>
            </div>
            <form className="modal-body" onSubmit={handleLogExpense}>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label>Category</label>
                <select className="form-input" value={category} onChange={e => setCategory(e.target.value)}>
                  <option value="RENT">Rent</option>
                  <option value="SOFTWARE">Software / IT</option>
                  <option value="MARKETING">Marketing & Online Platform Fees</option>
                  <option value="OFFICE_SUPPLIES">Office Supplies & Packaging</option>
                  <option value="TRAVEL">Travel</option>
                  <option value="UTILITIES">Utilities</option>
                  <option value="PAYROLL">Salary / Payroll</option>
                  <option value="OTHER">Other Operational Cost</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label>Description</label>
                <input type="text" className="form-input" required placeholder="e.g. Amazon seller subscription, Bubble wrap, etc." value={desc} onChange={e => setDesc(e.target.value)} />
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
                  Amount will be recorded in USD based on 1 USD = 3.674 AED standard rate if entered in AED.
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

      {/* History Modal */}
      <AuditHistoryModal isOpen={showAuditModal} onClose={() => setShowAuditModal(false)} logs={auditLogs} title="Accounting & Expense Audit History" />
    </div>
  )
}

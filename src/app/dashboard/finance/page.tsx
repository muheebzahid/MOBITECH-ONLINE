import { Suspense } from 'react'
import { getTreasurySettings, getWireTransfers, getRepayments, getTreasuryData } from '@/lib/finance/actions'
import { getTreasuryTransactions } from '@/lib/accounting/treasuryActions'
import { getUserRole } from '@/lib/admin/actions'
import { redirect } from 'next/navigation'
import FinanceClient from './FinanceClient'

export const dynamic = 'force-dynamic'

async function FinanceContent() {
  const role = await getUserRole()
  if (role === 'LOGISTICS' || role === 'SALES') redirect('/dashboard')
  const settings = await getTreasurySettings()
  const wires = await getWireTransfers()
  const repayments = await getRepayments()
  
  const { deals, invoices } = await getTreasuryData()
  const treasuryTransactions = await getTreasuryTransactions()
  
  return (
    <FinanceClient 
      settings={settings || { amex_limit: 500000, turbo_cash_limit: 300000, sb_cash_limit: 0 }} 
      wires={wires || []} 
      repayments={repayments || []} 
      deals={deals || []}
      invoices={invoices || []}
      userRole={role || undefined}
      treasuryTransactions={treasuryTransactions || []}
    />
  )
}

export default function FinancePage() {
  return (
    <Suspense fallback={
      <div style={{ padding: '40px', color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '18px', height: '18px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <span>Loading Financial Treasury & P&L Statements...</span>
      </div>
    }>
      <FinanceContent />
    </Suspense>
  )
}


'use client'

import Link from 'next/link'
import { DEAL_STATUSES } from '@/lib/deals/constants'

interface Props {
  deals: any[]
  settings: { amex_limit: number; cash_limit: number }
  outstandingAR: number
  summary: any
  inventoryItems: any[]
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

export default function DashboardHomeClient({ deals, settings, outstandingAR, summary, inventoryItems }: Props) {
  // 1. Active Deals Count
  const activeDeals = deals.filter(d => d.status !== 'SOLD' && d.status !== 'DEAL_CLOSED')
  const activeDealsCount = activeDeals.length

  // 2. Amex Utilised
  const amexStuck = deals
    .filter(d => d.status !== 'DEAL_CLOSED' && (d.funding_source === 'AMEX' || d.funding_source === 'MIXED'))
    .reduce((s, d) => s + (Number(d.amex_amount) || Number(d.total_commitment)), 0)

  // 3. Cash Deployed
  const cashStuck = deals
    .filter(d => d.status !== 'DEAL_CLOSED' && (d.funding_source === 'CASH_POOL' || d.funding_source === 'MIXED'))
    .reduce((s, d) => s + (Number(d.cash_amount) || Number(d.total_commitment)), 0)

  // 4. Net Profit
  const netProfit = summary.usd.netProfit || 0

  // 5. Inventory Asset Value
  const inventoryAsset = summary.usd.inventoryAsset || 0
  const activeInventoryUnits = inventoryItems.filter(i => i.status !== 'SOLD' && i.status !== 'RETURNED').length

  // 6. KPI Cards Config
  const kpiCards = [
    { label: 'Active Deals', value: activeDealsCount.toString(), sub: `${deals.length} total logged deals`, color: 'kpi-purple' },
    { label: 'Amex Utilised', value: fmt(amexStuck), sub: `of ${fmt(settings.amex_limit)} limit`, color: 'kpi-blue' },
    { label: 'Cash Deployed', value: fmt(cashStuck), sub: `of ${fmt(settings.cash_limit)} pool`, color: 'kpi-amber' },
    { label: 'Net Profit (YTD)', value: fmt(netProfit), sub: 'Year to date profit', color: 'kpi-green' },
    { label: 'Inventory Value', value: fmt(inventoryAsset), sub: `${activeInventoryUnits} units in stock`, color: 'kpi-indigo' },
    { label: 'Outstanding A/R', value: fmt(outstandingAR), sub: 'Unpaid sales invoices', color: 'kpi-rose' },
  ]

  // Recent 5 Deals
  const recentDeals = deals.slice(0, 5)

  // Treasury Alerts & Statement Dates
  const alerts: string[] = []
  if (amexStuck > settings.amex_limit * 0.85) {
    alerts.push(`AMEX utilization is high: ${(amexStuck / settings.amex_limit * 100).toFixed(1)}% used.`)
  }
  if (cashStuck > settings.cash_limit * 0.85) {
    alerts.push(`Cash pool deployment is high: ${(cashStuck / settings.cash_limit * 100).toFixed(1)}% used.`)
  }

  const upcomingAmexDeals = deals
    .filter(d => d.status !== 'DEAL_CLOSED' && d.funding_source === 'AMEX' && d.amex_statement_date)
    .map(d => {
      const diff = new Date(d.amex_statement_date).getTime() - new Date().getTime()
      const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
      return { ...d, daysLeft: days }
    })
    .filter(d => d.daysLeft >= 0)
    .sort((a, b) => a.daysLeft - b.daysLeft)

  const nextCutoffDays = upcomingAmexDeals.length > 0 ? upcomingAmexDeals[0].daysLeft : null
  if (nextCutoffDays !== null && nextCutoffDays <= 7) {
    alerts.push(`Upcoming Amex statement cutoff in ${nextCutoffDays} days (Deal ${upcomingAmexDeals[0].deal_number}).`)
  }

  // Partner Balances (33.33% Profit Split)
  const partnerShare = netProfit / 3

  // Inventory Top Models Summary
  const activeItems = inventoryItems.filter(i => i.status !== 'SOLD' && i.status !== 'RETURNED')
  const modelCounts: Record<string, number> = {}
  for (const item of activeItems) {
    if (item.model) {
      modelCounts[item.model] = (modelCounts[item.model] || 0) + 1
    }
  }
  const topModels = Object.keys(modelCounts)
    .map(model => ({ model, count: modelCounts[model] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  return (
    <div className="page-root">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard Overview</h1>
          <p className="page-subtitle">Welcome back · {new Date().toLocaleDateString('en-AE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div className="header-right">
          <div className="header-badge header-badge-green">● System Online</div>
          {nextCutoffDays !== null ? (
            <div className={`header-badge ${nextCutoffDays <= 5 ? 'header-badge-red' : 'header-badge-amber'}`}>
              ⚠ Amex cutoff in {nextCutoffDays} days
            </div>
          ) : (
            <div className="header-badge header-badge-blue">No upcoming cutoff</div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <section className="kpi-grid">
        {kpiCards.map((card) => (
          <div key={card.label} className={`kpi-card ${card.color}`}>
            <div className="kpi-label">{card.label}</div>
            <div className="kpi-value">{card.value}</div>
            <div className="kpi-sub">{card.sub}</div>
          </div>
        ))}
      </section>

      {/* Modules Grid */}
      <section className="modules-grid">
        {/* Recent Deals */}
        <div className="module-card">
          <div className="module-header">
            <span className="module-icon">⚡</span>
            <h2 className="module-title">Recent Deals</h2>
          </div>
          {recentDeals.length === 0 ? (
            <div className="module-empty">
              <p>No deals yet. Add your first auction win to get started.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
              {recentDeals.map((deal: any) => {
                const statusInfo = DEAL_STATUSES[deal.status as keyof typeof DEAL_STATUSES] || { label: deal.status, color: '' }
                return (
                  <Link 
                    key={deal.id} 
                    href={`/dashboard/deals/${deal.id}`}
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      padding: '12px', 
                      background: 'var(--bg-elevated)', 
                      borderRadius: '8px', 
                      border: '1px solid var(--border)',
                      textDecoration: 'none',
                      color: 'inherit',
                      transition: 'border-color 0.2s ease'
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-purple)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13px' }}>{deal.deal_number}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {deal.supplier} · {deal.quantity} units · {fmtDate(deal.auction_won_date)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontWeight: 600, fontSize: '13px' }}>{fmt(deal.total_commitment)}</span>
                      <span className={`status-badge ${statusInfo.color}`} style={{ fontSize: '10px', padding: '2px 8px' }}>
                        {statusInfo.label}
                      </span>
                    </div>
                  </Link>
                )
              })}
              <Link 
                href="/dashboard/deals" 
                style={{ 
                  textAlign: 'center', 
                  fontSize: '12px', 
                  color: 'var(--accent-purple)', 
                  fontWeight: 600, 
                  marginTop: '4px',
                  textDecoration: 'none'
                }}
              >
                View all deals →
              </Link>
            </div>
          )}
        </div>

        {/* Treasury Alerts */}
        <div className="module-card">
          <div className="module-header">
            <span className="module-icon">◉</span>
            <h2 className="module-title">Treasury Alerts</h2>
          </div>
          {alerts.length === 0 ? (
            <div className="module-empty">
              <p>No active treasury alerts. Amex and Cash Pool tracking is clear.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
              {alerts.map((alertMsg, idx) => (
                <div 
                  key={idx} 
                  style={{ 
                    padding: '12px', 
                    background: 'rgba(239, 68, 68, 0.08)', 
                    border: '1px solid rgba(239, 68, 68, 0.2)', 
                    color: 'var(--accent-red)', 
                    borderRadius: '8px', 
                    fontSize: '13px',
                    lineHeight: '1.4'
                  }}
                >
                  {alertMsg}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Partner Balances */}
        <div className="module-card">
          <div className="module-header">
            <span className="module-icon">◑</span>
            <h2 className="module-title">Partner Balances</h2>
          </div>
          <div className="partner-rows" style={{ marginTop: '12px' }}>
            {[
              { name: 'Muheeb', avatar: 'M' },
              { name: 'Beshair', avatar: 'B' },
              { name: 'Faisal', avatar: 'F' }
            ].map((p) => (
              <div key={p.name} className="partner-row">
                <div className="partner-avatar">{p.avatar}</div>
                <div className="partner-details">
                  <span className="partner-name">{p.name}</span>
                  <span className="partner-share">33.33% YTD Profit Share</span>
                </div>
                <div className="partner-balance" style={{ fontWeight: 600, color: partnerShare >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                  {fmt(partnerShare)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Inventory Summary */}
        <div className="module-card">
          <div className="module-header">
            <span className="module-icon">▦</span>
            <h2 className="module-title">Inventory Summary</h2>
          </div>
          {topModels.length === 0 ? (
            <div className="module-empty">
              <p>Inventory will populate once deals are received at the Dubai warehouse.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, paddingBottom: '6px', borderBottom: '1px solid var(--border)' }}>
                <span>MODEL IN STOCK</span>
                <span>QTY</span>
              </div>
              {topModels.map((m: any) => (
                <div key={m.model} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: '13px' }}>
                  <span style={{ fontWeight: 500 }}>{m.model}</span>
                  <span style={{ fontWeight: 600, color: 'var(--accent-purple)' }}>{m.count}</span>
                </div>
              ))}
              <Link 
                href="/dashboard/inventory" 
                style={{ 
                  textAlign: 'center', 
                  fontSize: '12px', 
                  color: 'var(--accent-purple)', 
                  fontWeight: 600, 
                  marginTop: '8px',
                  textDecoration: 'none'
                }}
              >
                View full inventory →
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

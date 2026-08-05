'use client'

import { useState, useMemo } from 'react'

type HeatmapData = {
  model: string
  grade: string
  unitsSold: number
  revenue: number
  cogs: number
  netProfit: number
  margin: number
}

export default function AnalyticsClient({ heatmapData }: { heatmapData: HeatmapData[] }) {
  const [currency, setCurrency] = useState<'aed'|'usd'>('usd')
  const rate = 3.674

  const formatMoney = (amount: number) => {
    const val = currency === 'usd' ? amount : amount * rate
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(val)
  }

  // Calculate totals
  const totalRevenue = heatmapData.reduce((sum, d) => sum + d.revenue, 0)
  const totalProfit = heatmapData.reduce((sum, d) => sum + d.netProfit, 0)
  const totalUnits = heatmapData.reduce((sum, d) => sum + d.unitsSold, 0)
  const overallMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0

  // Find best performers
  const bestModel = [...heatmapData].sort((a, b) => b.netProfit - a.netProfit)[0]
  const highestMargin = [...heatmapData].filter(d => d.unitsSold > 5).sort((a, b) => b.margin - a.margin)[0]

  // Group by model for heatmap
  const models = Array.from(new Set(heatmapData.map(d => d.model))).sort()
  const grades = Array.from(new Set(heatmapData.map(d => d.grade))).sort()

  const getHeatmapColor = (margin: number) => {
    if (margin >= 20) return '#10b981' // excellent green
    if (margin >= 10) return '#34d399' // good green
    if (margin >= 5)  return '#fbbf24' // warning yellow
    if (margin > 0)   return '#f59e0b' // orange
    return '#ef4444' // red
  }

  return (
    <div className="page-root">
      <div className="page-header" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Deal Autopsy & Analytics</h1>
          <p className="page-subtitle">Profitability Breakdown per Model and Grade</p>
        </div>
        <div style={{ display: 'flex', background: 'var(--bg-elevated)', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border)' }}>
          <button 
            onClick={() => setCurrency('usd')}
            style={{ padding: '8px 16px', border: 'none', background: currency === 'usd' ? 'var(--accent-purple)' : 'transparent', color: currency === 'usd' ? 'white' : 'var(--text-primary)', cursor: 'pointer', fontWeight: 600 }}
          >
            USD
          </button>
          <button 
            onClick={() => setCurrency('aed')}
            style={{ padding: '8px 16px', border: 'none', background: currency === 'aed' ? 'var(--accent-purple)' : 'transparent', color: currency === 'aed' ? 'white' : 'var(--text-primary)', cursor: 'pointer', fontWeight: 600 }}
          >
            AED
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginBottom: '24px' }}>
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '8px' }}>All-Time Net Profit</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--status-green)' }}>{formatMoney(totalProfit)}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '8px' }}>From {totalUnits} units sold ({overallMargin.toFixed(1)}% margin)</div>
        </div>
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '8px' }}>Most Profitable Stock</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>{bestModel?.model || 'N/A'}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '8px' }}>{bestModel ? `Grade ${bestModel.grade} • ${formatMoney(bestModel.netProfit)} profit` : 'No data'}</div>
        </div>
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '8px' }}>Highest Margin ({'>'}5 units)</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>{highestMargin?.model || 'N/A'}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '8px' }}>{highestMargin ? `Grade ${highestMargin.grade} • ${highestMargin.margin.toFixed(1)}% margin` : 'No data'}</div>
        </div>
      </div>

      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', overflowX: 'auto' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Profitability Heatmap (Margin %)</h2>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '4px' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '8px', color: 'var(--text-secondary)' }}>Model</th>
              {grades.map(g => (
                <th key={g} style={{ textAlign: 'center', padding: '8px', color: 'var(--text-secondary)' }}>Grade {g}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {models.map(model => (
              <tr key={model}>
                <td style={{ padding: '8px', fontWeight: 500, whiteSpace: 'nowrap' }}>{model}</td>
                {grades.map(grade => {
                  const data = heatmapData.find(d => d.model === model && d.grade === grade)
                  if (!data) return <td key={grade} style={{ padding: '8px', background: 'var(--bg-elevated)', borderRadius: '6px', textAlign: 'center', color: 'var(--text-muted)' }}>-</td>
                  
                  const color = getHeatmapColor(data.margin)
                  return (
                    <td key={grade} style={{ 
                      padding: '12px 8px', 
                      background: color + '22', 
                      border: `1px solid ${color}`,
                      borderRadius: '6px', 
                      textAlign: 'center',
                      position: 'relative'
                    }}>
                      <div style={{ color: color, fontWeight: 700, fontSize: '15px' }}>{data.margin.toFixed(1)}%</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '11px', marginTop: '4px' }}>{data.unitsSold} units</div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', overflowX: 'auto' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Detailed Breakdown</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Grade</th>
              <th>Units Sold</th>
              <th>Revenue</th>
              <th>True COGS</th>
              <th>Net Profit</th>
              <th>Margin</th>
            </tr>
          </thead>
          <tbody>
            {heatmapData.map((d, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 500 }}>{d.model}</td>
                <td><span className="badge">{d.grade}</span></td>
                <td>{d.unitsSold}</td>
                <td>{formatMoney(d.revenue)}</td>
                <td>{formatMoney(d.cogs)}</td>
                <td style={{ color: d.netProfit >= 0 ? 'var(--text-green)' : 'var(--text-red)', fontWeight: 600 }}>
                  {formatMoney(d.netProfit)}
                </td>
                <td style={{ color: d.margin >= 0 ? 'var(--text-green)' : 'var(--text-red)', fontWeight: 600 }}>
                  {d.margin.toFixed(1)}%
                </td>
              </tr>
            ))}
            {heatmapData.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                  No sales data available yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'

type HeatmapData = {
  model: string
  grade: string
  unitsSold: number
  revenue: number
  cogs: number
  netProfit: number
  margin: number
}

export default function AnalyticsClient({ heatmapData, forecastData }: { heatmapData: HeatmapData[], forecastData?: any[] }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  
  const [currency, setCurrency] = useState<'aed'|'usd'>('usd')
  const [activeTab, setActiveTab] = useState<'heatmap'|'forecast'>(
    (searchParams.get('tab') as 'heatmap'|'forecast') || 'heatmap'
  )
  const [forecastModelFilter, setForecastModelFilter] = useState<string>('')
  const [forecastGradeFilter, setForecastGradeFilter] = useState<string>('')
  const rate = 3.674

  // Sync tab state with URL
  useEffect(() => {
    const tab = searchParams.get('tab') as 'heatmap' | 'forecast'
    if (tab && tab !== activeTab) {
      setActiveTab(tab)
    }
  }, [searchParams])

  const handleTabChange = (tab: 'heatmap' | 'forecast') => {
    setActiveTab(tab)
    router.replace(`${pathname}?tab=${tab}`)
  }

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
    if (margin >= 25) return { bg: 'rgba(16, 185, 129, 0.18)', border: 'rgba(16, 185, 129, 0.5)', text: '#10b981' }
    if (margin >= 15) return { bg: 'rgba(52, 211, 153, 0.15)', border: 'rgba(52, 211, 153, 0.4)', text: '#34d399' }
    if (margin >= 5)  return { bg: 'rgba(251, 191, 36, 0.15)', border: 'rgba(251, 191, 36, 0.4)', text: '#fbbf24' }
    if (margin > 0)   return { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.4)', text: '#f59e0b' }
    return { bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.4)', text: '#ef4444' }
  }

  const lowStockCount = forecastData?.filter(f => f.isLowStock).length || 0

  // Normalize model names: strip leading "Apple ", lowercase, trim for grouping
  const normalizeModel = (m: string) => m?.trim().toLowerCase().replace(/^apple\s+/i, '').replace(/\s+/g, ' ') || ''

  // Build unique normalized model labels (canonical display form = most common variant)
  const normalizedModelMap = new Map<string, string>() // normalized -> best display name
  ;(forecastData || []).forEach(d => {
    const key = normalizeModel(d.model)
    if (!normalizedModelMap.has(key)) {
      normalizedModelMap.set(key, d.model) // first seen = display name
    }
  })
  // Sort normalized keys alphabetically for the dropdown
  const uniqueForecastModels = Array.from(normalizedModelMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  const uniqueForecastGrades = Array.from(new Set(forecastData?.map(d => d.grade) || [])).sort()

  const filteredForecast = (forecastData || []).filter(d => 
    (forecastModelFilter === '' || normalizeModel(d.model) === forecastModelFilter) &&
    (forecastGradeFilter === '' || d.grade === forecastGradeFilter)
  )

  const totalForecastSold = filteredForecast.reduce((sum, d) => sum + (d.totalSold || 0), 0)
  const totalForecastMRR = filteredForecast.reduce((sum, d) => sum + (d.mrr || 0), 0)
  const totalForecastStock = filteredForecast.reduce((sum, d) => sum + (d.currentStock || 0), 0)
  const totalForecastShortfall = filteredForecast.reduce((sum, d) => sum + (d.shortfall || 0), 0)
  const totalForecastBid = filteredForecast.reduce((sum, d) => sum + (d.recommendedBid || 0), 0)

  return (
    <div className="page-root" style={{ overflow: 'hidden', gap: '12px' }}>
      <div className="page-header" style={{ justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <h1 className="page-title">Deal Autopsy & Analytics</h1>
          <p className="page-subtitle">Profitability Breakdown and Predictive Procurement</p>
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

      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '16px', flexShrink: 0 }}>
        <button
          className={`btn-ghost ${activeTab === 'heatmap' ? 'active-tab' : ''}`}
          onClick={() => handleTabChange('heatmap')}
          style={{
            background: activeTab === 'heatmap' ? 'var(--bg-hover)' : 'transparent',
            fontWeight: activeTab === 'heatmap' ? 600 : 400,
            color: activeTab === 'heatmap' ? 'var(--text)' : 'var(--text-muted)'
          }}
        >
          Profitability Heatmap
        </button>
        <button
          className={`btn-ghost ${activeTab === 'forecast' ? 'active-tab' : ''}`}
          onClick={() => handleTabChange('forecast')}
          style={{
            background: activeTab === 'forecast' ? 'var(--bg-hover)' : 'transparent',
            fontWeight: activeTab === 'forecast' ? 600 : 400,
            color: activeTab === 'forecast' ? 'var(--text)' : 'var(--text-muted)',
            display: 'flex', alignItems: 'center', gap: '6px'
          }}
        >
          Procurement Forecast
          {lowStockCount > 0 && (
            <span style={{ background: '#ef4444', color: 'white', borderRadius: '50%', width: '18px', height: '18px', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {lowStockCount}
            </span>
          )}
        </button>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .premium-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
        }
        .premium-table th {
          padding: 16px 12px;
          background: rgba(255,255,255,0.03);
          color: var(--text-muted);
          font-weight: 500;
          font-size: 13px;
          border-bottom: 1px solid var(--border);
          white-space: nowrap;
        }
        .premium-table td {
          padding: 14px 12px;
          font-size: 14px;
          border-bottom: 1px solid var(--border);
          transition: background 0.2s;
        }
        .premium-table tr:hover td {
          background: rgba(255,255,255,0.02);
        }
        .badge-low-stock {
          background: rgba(239, 68, 68, 0.15);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.3);
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 700;
          margin-left: 8px;
          vertical-align: middle;
        }
      `}} />

      {activeTab === 'forecast' && (
        <div style={{ flex: 1, minHeight: 0, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Fixed header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>Smart Purchasing Report <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-muted)' }}>(All-Time History)</span></h2>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Data is generated dynamically based on average monthly sales velocity.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <select
                className="form-input"
                value={forecastModelFilter}
                onChange={(e) => setForecastModelFilter(e.target.value)}
                style={{ minWidth: '190px' }}
              >
                <option value="">All Models</option>
                {uniqueForecastModels.map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              <select
                className="form-input"
                value={forecastGradeFilter}
                onChange={(e) => setForecastGradeFilter(e.target.value)}
                style={{ minWidth: '140px' }}
              >
                <option value="">All Grades</option>
                {uniqueForecastGrades.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Scrollable table body */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            <table className="premium-table">
              <thead>
                <tr>
                  <th title="Device Model" style={{ textAlign: 'left', position: 'sticky', top: 0, background: 'var(--bg-elevated)', zIndex: 1 }}>Model</th>
                  <th title="Storage Capacity" style={{ textAlign: 'left', position: 'sticky', top: 0, background: 'var(--bg-elevated)', zIndex: 1 }}>Storage</th>
                  <th title="Device Grade" style={{ textAlign: 'left', position: 'sticky', top: 0, background: 'var(--bg-elevated)', zIndex: 1 }}>Grade</th>
                  <th title="Total Units Sold (All-Time)" style={{ textAlign: 'right', position: 'sticky', top: 0, background: 'var(--bg-elevated)', zIndex: 1 }}>Total Sold</th>
                  <th title="Monthly Recurring Run-rate (Avg Monthly Sales)" style={{ textAlign: 'right', position: 'sticky', top: 0, background: 'var(--bg-elevated)', zIndex: 1 }}>MRR</th>
                  <th title="Current Inventory Stock" style={{ textAlign: 'right', position: 'sticky', top: 0, background: 'var(--bg-elevated)', zIndex: 1 }}>Stock</th>
                  <th title="Inventory Shortfall (Stock minus MRR)" style={{ textAlign: 'right', position: 'sticky', top: 0, background: 'var(--bg-elevated)', zIndex: 1 }}>Shortfall</th>
                  <th title="Recommended Bid Quantity" style={{ textAlign: 'right', position: 'sticky', top: 0, background: 'var(--bg-elevated)', zIndex: 1 }}>Rec. Bid</th>
                  <th title="Average Landed Cost (Cost + Fee)" style={{ textAlign: 'right', position: 'sticky', top: 0, background: 'var(--bg-elevated)', zIndex: 1 }}>Avg Cost</th>
                  <th title="Average Selling Price" style={{ textAlign: 'right', position: 'sticky', top: 0, background: 'var(--bg-elevated)', zIndex: 1 }}>ASP</th>
                  <th title="Return on Investment %" style={{ textAlign: 'right', position: 'sticky', top: 0, background: 'var(--bg-elevated)', zIndex: 1 }}>ROI %</th>
                </tr>
              </thead>
              <tbody>
                {filteredForecast.map((d, i) => {
                  const asp = d.avgSellingPrice || (d.invoicedSold > 0 ? d.invoicedRevenue / d.invoicedSold : (d.totalSold > 0 ? d.totalRevenue / d.totalSold : 0)) || 0;
                  const cost = (d.avgUnitCost || 0) + (d.avgAuctionFee || 0);
                  const roi = cost > 0 ? ((asp - cost) / cost) * 100 : 0;
                  
                  return (
                    <tr key={i} style={d.isLowStock ? { boxShadow: 'inset 4px 0 0 #ef4444', backgroundColor: 'rgba(239, 68, 68, 0.03)' } : {}}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {d.model}
                        {d.isLowStock && <span className="badge-low-stock">LOW STOCK</span>}
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{d.storage}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{d.grade}</td>
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>{d.totalSold}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--accent-teal)' }}>{d.mrr} <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>/mo</span></td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: d.isLowStock ? '#ef4444' : 'var(--text)' }}>{d.currentStock}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: d.shortfall > 0 ? '#f59e0b' : 'var(--text-muted)' }}>{d.shortfall}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: d.recommendedBid > 0 ? 'var(--status-green)' : 'var(--text-muted)' }}>
                        {d.recommendedBid > 0 ? `+${d.recommendedBid}` : '0'}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{formatMoney(cost)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--accent-blue)', fontWeight: 700 }}>
                        {formatMoney(asp)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: roi >= 0 ? 'var(--status-green)' : '#ef4444' }}>
                        {roi.toFixed(1)}%
                      </td>
                    </tr>
                  )
                })}
                {filteredForecast.length === 0 && (
                  <tr>
                    <td colSpan={11} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                      No sales history available to forecast.
                    </td>
                  </tr>
                )}
              </tbody>
              {filteredForecast.length > 0 && (
                <tfoot style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)', padding: '12px' }}>TOTALS:</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{totalForecastSold}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent-teal)' }}>{totalForecastMRR} <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>/mo</span></td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{totalForecastStock}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#f59e0b' }}>{totalForecastShortfall}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--status-green)' }}>+{totalForecastBid}</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}


      {activeTab === 'heatmap' && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '8px' }}>

          {/* KPI Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', flexShrink: 0 }}>
            <div style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(6,78,59,0.2))', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '12px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', right: '-8px', top: '-8px', width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(16,185,129,0.07)' }} />
              <span style={{ fontSize: '24px' }}>💰</span>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 600, color: '#10b981', letterSpacing: '0.07em', textTransform: 'uppercase' }}>All-Time Net Profit</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#10b981', lineHeight: 1.2 }}>{formatMoney(totalProfit)}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{overallMargin.toFixed(1)}% margin · {totalUnits.toLocaleString()} units</div>
              </div>
            </div>
            <div style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(67,56,202,0.2))', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '12px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', right: '-8px', top: '-8px', width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(99,102,241,0.07)' }} />
              <span style={{ fontSize: '24px' }}>🏆</span>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 600, color: '#818cf8', letterSpacing: '0.07em', textTransform: 'uppercase' }}>Most Profitable SKU</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2 }}>{bestModel?.model || 'N/A'}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Grade {bestModel?.grade} · {bestModel ? formatMoney(bestModel.netProfit) + ' profit' : '–'}</div>
              </div>
            </div>
            <div style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(120,53,15,0.2))', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '12px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', right: '-8px', top: '-8px', width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(245,158,11,0.07)' }} />
              <span style={{ fontSize: '24px' }}>📈</span>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 600, color: '#fbbf24', letterSpacing: '0.07em', textTransform: 'uppercase' }}>Highest Margin ({'>'} 5 units)</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2 }}>{highestMargin?.model || 'N/A'}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{highestMargin?.margin.toFixed(1)}% · Grade {highestMargin?.grade}</div>
              </div>
            </div>
          </div>

          {/* Heatmap — full width */}
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '16px', flexShrink: 0, overflow: 'hidden' }}>
            <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>Profitability Heatmap</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>Margin % by model and grade — hover a cell for full details</div>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                {[{ label: '≥25%', color: '#10b981' }, { label: '15–25%', color: '#34d399' }, { label: '5–15%', color: '#fbbf24' }, { label: '0–5%', color: '#f59e0b' }, { label: 'Loss', color: '#ef4444' }].map(l => (
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    <div style={{ width: '9px', height: '9px', borderRadius: '2px', background: l.color }} />
                    {l.label}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ overflowX: 'auto', padding: '14px' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '4px' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Model</th>
                    {grades.map(g => (
                      <th key={g} style={{ textAlign: 'center', padding: '8px 6px', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap' }}>{g}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {models.map(model => (
                    <tr key={model}>
                      <td style={{ padding: '4px 12px', fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{model}</td>
                      {grades.map(grade => {
                        const data = heatmapData.find(d => d.model === model && d.grade === grade)
                        if (!data) return (
                          <td key={grade} style={{ padding: '3px', textAlign: 'center' }}>
                            <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '8px', padding: '10px 6px', color: 'rgba(255,255,255,0.1)', fontSize: '12px' }}>–</div>
                          </td>
                        )
                        const c = getHeatmapColor(data.margin)
                        return (
                          <td key={grade} style={{ padding: '3px', textAlign: 'center' }} title={`${model} • ${grade}\nMargin: ${data.margin.toFixed(1)}%\nProfit: ${formatMoney(data.netProfit)}\nRevenue: ${formatMoney(data.revenue)}\nUnits: ${data.unitsSold}`}>
                            <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: '8px', padding: '10px 6px', cursor: 'default', transition: 'transform 0.12s, box-shadow 0.12s' }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.08)'; (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 16px ${c.border}` }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}
                            >
                              <div style={{ color: c.text, fontWeight: 800, fontSize: '13px' }}>{data.margin.toFixed(1)}%</div>
                              <div style={{ color: 'var(--text-muted)', fontSize: '10px', marginTop: '3px' }}>{data.unitsSold} units</div>
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detailed Breakdown — full width, below heatmap */}
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '16px', flexShrink: 0, overflow: 'hidden' }}>
            <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>Detailed Breakdown</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>{heatmapData.length} SKU combinations · sorted by profit</div>
              </div>
            </div>
            <table className="premium-table">
              <thead>
                <tr>
                  <th title="Device Model" style={{ textAlign: 'left' }}>Model</th>
                  <th title="Device Grade" style={{ textAlign: 'left' }}>Grade</th>
                  <th title="Total Units Sold" style={{ textAlign: 'right' }}>Units Sold</th>
                  <th title="Total Revenue" style={{ textAlign: 'right' }}>Revenue</th>
                  <th title="Cost of Goods Sold" style={{ textAlign: 'right' }}>COGS</th>
                  <th title="Net Profit (Revenue - COGS)" style={{ textAlign: 'right' }}>Net Profit</th>
                  <th title="Profit Margin %" style={{ textAlign: 'right' }}>Margin</th>
                </tr>
              </thead>
              <tbody>
                {[...heatmapData].sort((a, b) => b.netProfit - a.netProfit).map((d, i) => {
                  const c = getHeatmapColor(d.margin)
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{d.model}</td>
                      <td><span style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>{d.grade}</span></td>
                      <td style={{ textAlign: 'right' }}>{d.unitsSold.toLocaleString()}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{formatMoney(d.revenue)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{formatMoney(d.cogs)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: d.netProfit >= 0 ? 'var(--status-green)' : '#ef4444' }}>{formatMoney(d.netProfit)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <span style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}`, padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 700 }}>{d.margin.toFixed(1)}%</span>
                      </td>
                    </tr>
                  )
                })}
                {heatmapData.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>No sales data available yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>

        </div>
      )}

    </div>
  )
}

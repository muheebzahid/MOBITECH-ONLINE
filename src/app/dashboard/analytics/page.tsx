import { Suspense } from 'react'
import { getProfitabilityHeatmap, getProcurementForecast } from '@/lib/analytics/actions'
import AnalyticsClient from './AnalyticsClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

async function AnalyticsContent() {
  const [heatmapData, forecastData] = await Promise.all([
    getProfitabilityHeatmap(),
    getProcurementForecast()
  ])

  return <AnalyticsClient heatmapData={heatmapData} forecastData={forecastData} />
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={
      <div style={{ padding: '40px', color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '18px', height: '18px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <span>Loading Analytics & Procurement Forecast...</span>
      </div>
    }>
      <AnalyticsContent />
    </Suspense>
  )
}


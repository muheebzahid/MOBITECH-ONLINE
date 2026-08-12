import { getProfitabilityHeatmap, getProcurementForecast } from '@/lib/analytics/actions'
import AnalyticsClient from './AnalyticsClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Force recompile to clear cached getProcurementForecast structure
export default async function AnalyticsPage() {
  const [heatmapData, forecastData] = await Promise.all([
    getProfitabilityHeatmap(),
    getProcurementForecast()
  ])

  return <AnalyticsClient heatmapData={heatmapData} forecastData={forecastData} />
}

import { getProfitabilityHeatmap } from '@/lib/analytics/actions'
import AnalyticsClient from './AnalyticsClient'

export const dynamic = 'force-dynamic'

export default async function AnalyticsPage() {
  const heatmapData = await getProfitabilityHeatmap()

  return <AnalyticsClient heatmapData={heatmapData} />
}

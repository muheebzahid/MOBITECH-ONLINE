import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createOnlineClient } from '@/lib/supabase/online-server'
import { getUserRole } from '@/lib/admin/actions'
import { SYNC_TABLES, SYNC_MODULES, ALWAYS_EXCLUDE_FIELDS } from '@/lib/sync/syncTableConfig'

export const dynamic = 'force-dynamic'

/**
 * Comprehensive full-mirror audit.
 *
 * Reads ALL business tables from both local (master) and online ERP,
 * compares every record field-by-field, and returns a structured diff
 * report grouped by module.
 *
 * IMPORTANT: This endpoint is 100% READ-ONLY.
 * It never modifies local or online databases.
 *
 * Detects three issue types:
 *   MISSING_ONLINE  – record exists locally but not in cloud
 *   OUT_OF_DATE     – record exists in both but fields differ (local wins)
 *   EXTRA_ONLINE    – record exists in cloud but NOT locally (will be deleted on sync)
 */

function diffFields(local: any, online: any, excludeFields: string[]): { key: string; localVal: string; onlineVal: string }[] {
  const diffs: { key: string; localVal: string; onlineVal: string }[] = []
  const allKeys = new Set([...Object.keys(local), ...Object.keys(online)])

  for (const key of allKeys) {
    if (excludeFields.includes(key)) continue

    const locVal = local[key]
    const onlVal = online[key]

    // Normalize for comparison
    const locStr = locVal === null || locVal === undefined ? '' : typeof locVal === 'object' ? JSON.stringify(locVal) : String(locVal).trim()
    const onlStr = onlVal === null || onlVal === undefined ? '' : typeof onlVal === 'object' ? JSON.stringify(onlVal) : String(onlVal).trim()

    if (locStr !== onlStr) {
      diffs.push({
        key,
        localVal: locStr || '—',
        onlineVal: onlStr || '—'
      })
    }
  }
  return diffs
}

function formatDiffSummary(diffs: { key: string; localVal: string; onlineVal: string }[]): string {
  if (diffs.length === 0) return 'Records match'
  return diffs.map(d => `${d.key}: ${d.localVal} (Local) vs ${d.onlineVal} (Cloud)`).join(' | ')
}

async function fetchAllRecords(supabase: any, tableName: string): Promise<any[]> {
  // Supabase returns max 1000 rows per request. Paginate to get all.
  const allRecords: any[] = []
  let from = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .range(from, from + pageSize - 1)
      .order('id', { ascending: true })

    if (error) {
      // Table might not exist on online — return empty
      console.error(`[Audit] Error fetching ${tableName}: ${error.message}`)
      return allRecords
    }

    if (!data || data.length === 0) break
    allRecords.push(...data)

    if (data.length < pageSize) break
    from += pageSize
  }

  return allRecords
}

export async function GET() {
  try {
    const role = await getUserRole()
    if (role !== 'SUPER_ADMIN') {
      return NextResponse.json({ success: false, error: 'Unauthorized: Super Admin access required' }, { status: 401 })
    }

    const localSupabase = await createClient()
    const onlineSupabase = createOnlineClient()

    // Audit every table in parallel
    const tableAudits = await Promise.all(
      SYNC_TABLES.map(async (config) => {
        const [localRecords, onlineRecords] = await Promise.all([
          fetchAllRecords(localSupabase, config.table),
          fetchAllRecords(onlineSupabase, config.table)
        ])

        const localMap = new Map(localRecords.map(r => [r.id, r]))
        const onlineMap = new Map(onlineRecords.map(r => [r.id, r]))

        const excludeFields = [...ALWAYS_EXCLUDE_FIELDS, ...(config.compareExcludeFields || [])]

        let missing = 0
        let outOfDate = 0
        let extraOnline = 0
        let synced = 0
        const items: any[] = []

        // Check local records against online
        for (const localRec of localRecords) {
          if (!localRec.id) continue
          const onlineRec = onlineMap.get(localRec.id)
          let identifier: string
          try {
            identifier = config.identifier(localRec)
          } catch {
            identifier = localRec.id
          }

          if (!onlineRec) {
            missing++
            items.push({
              id: localRec.id,
              table: config.table,
              identifier,
              issue: 'MISSING_ONLINE',
              diff_detail: 'Entire record missing in Online Cloud ERP',
              field_diffs: [],
              href: config.href(localRec),
              action_preview: 'CREATE on cloud'
            })
          } else {
            const fieldDiffs = diffFields(localRec, onlineRec, excludeFields)
            if (fieldDiffs.length > 0) {
              outOfDate++
              items.push({
                id: localRec.id,
                table: config.table,
                identifier,
                issue: 'OUT_OF_DATE',
                diff_detail: formatDiffSummary(fieldDiffs),
                field_diffs: fieldDiffs.slice(0, 10), // Cap at 10 fields for UI
                href: config.href(localRec),
                action_preview: `UPDATE ${fieldDiffs.length} field(s) on cloud`
              })
            } else {
              synced++
            }
          }
        }

        // Check for orphans (online-only records not in local master)
        for (const onlineRec of onlineRecords) {
          if (!onlineRec.id) continue
          if (!localMap.has(onlineRec.id)) {
            extraOnline++
            let identifier: string
            try {
              identifier = config.identifier(onlineRec)
            } catch {
              identifier = onlineRec.id
            }
            items.push({
              id: onlineRec.id,
              table: config.table,
              identifier,
              issue: 'EXTRA_ONLINE',
              diff_detail: 'Record exists in cloud but NOT in Master ERP — will be DELETED on sync',
              field_diffs: [],
              href: config.href(onlineRec),
              action_preview: 'DELETE from cloud'
            })
          }
        }

        return {
          table: config.table,
          displayName: config.displayName,
          module: config.module,
          total_local: localRecords.length,
          total_online: onlineRecords.length,
          missing,
          outOfDate,
          extraOnline,
          synced,
          items
        }
      })
    )

    // Group results by module
    const moduleMap: Record<string, {
      displayName: string
      tables: typeof tableAudits
      total_local: number
      total_online: number
      missing: number
      outOfDate: number
      extraOnline: number
      synced: number
      items: any[]
    }> = {}

    for (const mod of SYNC_MODULES) {
      const moduleTables = tableAudits.filter(t => t.module === mod.key)
      moduleMap[mod.key] = {
        displayName: mod.label,
        tables: moduleTables,
        total_local: moduleTables.reduce((s, t) => s + t.total_local, 0),
        total_online: moduleTables.reduce((s, t) => s + t.total_online, 0),
        missing: moduleTables.reduce((s, t) => s + t.missing, 0),
        outOfDate: moduleTables.reduce((s, t) => s + t.outOfDate, 0),
        extraOnline: moduleTables.reduce((s, t) => s + t.extraOnline, 0),
        synced: moduleTables.reduce((s, t) => s + t.synced, 0),
        items: moduleTables.flatMap(t => t.items)
      }
    }

    // Global summary
    const totalLocal = tableAudits.reduce((s, t) => s + t.total_local, 0)
    const totalOnline = tableAudits.reduce((s, t) => s + t.total_online, 0)
    const totalMissing = tableAudits.reduce((s, t) => s + t.missing, 0)
    const totalOutOfDate = tableAudits.reduce((s, t) => s + t.outOfDate, 0)
    const totalExtraOnline = tableAudits.reduce((s, t) => s + t.extraOnline, 0)
    const totalSynced = tableAudits.reduce((s, t) => s + t.synced, 0)
    const totalChanges = totalMissing + totalOutOfDate + totalExtraOnline

    return NextResponse.json({
      success: true,
      audited_at: new Date().toISOString(),
      destination_project_ref: 'aivcmkwclfipntadipec',
      destination_domain: 'the-workflows.com',
      summary: {
        total_local_records: totalLocal,
        total_online_records: totalOnline,
        total_missing_online: totalMissing,
        total_out_of_date: totalOutOfDate,
        total_extra_online: totalExtraOnline,
        total_synced: totalSynced,
        total_changes_required: totalChanges,
        is_fully_synced: totalChanges === 0
      },
      modules: moduleMap,
      tables: tableAudits.map(t => ({
        table: t.table,
        displayName: t.displayName,
        module: t.module,
        total_local: t.total_local,
        total_online: t.total_online,
        missing: t.missing,
        outOfDate: t.outOfDate,
        extraOnline: t.extraOnline,
        synced: t.synced
      }))
    })
  } catch (err: any) {
    console.error('[Audit] Fatal error:', err)
    return NextResponse.json({ success: false, error: err.message || 'Internal audit error' }, { status: 500 })
  }
}

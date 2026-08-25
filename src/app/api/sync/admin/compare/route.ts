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

function normalizeValue(val: any): string {
  if (val === null || val === undefined || val === '') return ''
  if (typeof val === 'number') {
    // Standardize numeric comparison (e.g. 100.00 vs 100)
    return String(Number(val))
  }
  if (typeof val === 'boolean') return String(val)
  if (typeof val === 'object') return JSON.stringify(val)

  const str = String(val).trim()
  // Check if string is a date / timestamp
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const d = new Date(str)
    if (!isNaN(d.getTime())) {
      // Compare calendar date part if time is 00:00:00 or compare timestamp ms
      return d.toISOString().split('T')[0]
    }
  }
  return str
}

function diffFields(
  local: any,
  online: any,
  excludeFields: Set<string>
): { key: string; localVal: string; onlineVal: string }[] {
  const diffs: { key: string; localVal: string; onlineVal: string }[] = []
  const allKeys = new Set([...Object.keys(local), ...Object.keys(online)])

  for (const key of allKeys) {
    if (excludeFields.has(key)) continue

    const locVal = normalizeValue(local[key])
    const onlVal = normalizeValue(online[key])

    if (locVal !== onlVal) {
      diffs.push({
        key,
        localVal: locVal || '—',
        onlineVal: onlVal || '—'
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

    // Audit every table
    const tableAudits = await Promise.all(
      SYNC_TABLES.map(async (config) => {
        // Test if table exists online
        const { error: testErr } = await onlineSupabase.from(config.table).select('id').limit(1)
        if (testErr && (testErr.code === 'PGRST205' || testErr.message.includes('schema cache'))) {
          return {
            table: config.table,
            displayName: config.displayName,
            module: config.module,
            total_local: 0,
            total_online: 0,
            missing: 0,
            outOfDate: 0,
            extraOnline: 0,
            synced: 0,
            items: []
          }
        }

        const [localRecords, onlineRecords] = await Promise.all([
          fetchAllRecords(localSupabase, config.table),
          fetchAllRecords(onlineSupabase, config.table)
        ])

        const localMap = new Map(localRecords.map(r => [r.id, r]))
        const onlineMap = new Map(onlineRecords.map(r => [r.id, r]))

        // Set of fields to exclude from diff comparison
        const excludeFields = new Set([
          ...ALWAYS_EXCLUDE_FIELDS,
          ...(config.compareExcludeFields || []),
          ...(config.authUserFields || []),
          ...(config.generatedColumns || [])
        ])

        // Also exclude columns that only exist locally and not in online schema
        if (onlineRecords.length > 0 && localRecords.length > 0) {
          const onlineKeySet = new Set(Object.keys(onlineRecords[0]))
          for (const k of Object.keys(localRecords[0])) {
            if (!onlineKeySet.has(k)) {
              excludeFields.add(k)
            }
          }
        }

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
                field_diffs: fieldDiffs.slice(0, 10),
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
              diff_detail: 'Record exists in Cloud ERP but NOT in Master ERP (orphan)',
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

    // Aggregate by module for UI tabs
    const moduleMap: Record<string, {
      module: string
      missing: number
      outOfDate: number
      extraOnline: number
      synced: number
      total_local: number
      total_online: number
      items: any[]
    }> = {}

    for (const mod of SYNC_MODULES) {
      moduleMap[mod.key] = {
        module: mod.key,
        missing: 0,
        outOfDate: 0,
        extraOnline: 0,
        synced: 0,
        total_local: 0,
        total_online: 0,
        items: []
      }
    }

    let totalMissing = 0
    let totalOutOfDate = 0
    let totalExtraOnline = 0
    let totalSynced = 0
    let totalLocalRecords = 0
    let totalOnlineRecords = 0

    for (const t of tableAudits) {
      totalMissing += t.missing
      totalOutOfDate += t.outOfDate
      totalExtraOnline += t.extraOnline
      totalSynced += t.synced
      totalLocalRecords += t.total_local
      totalOnlineRecords += t.total_online

      const m = moduleMap[t.module]
      if (m) {
        m.missing += t.missing
        m.outOfDate += t.outOfDate
        m.extraOnline += t.extraOnline
        m.synced += t.synced
        m.total_local += t.total_local
        m.total_online += t.total_online
        m.items.push(...t.items)
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        total_local_records: totalLocalRecords,
        total_online_records: totalOnlineRecords,
        total_missing_online: totalMissing,
        total_out_of_date: totalOutOfDate,
        total_extra_online: totalExtraOnline,
        total_synced: totalSynced,
        total_changes_required: totalMissing + totalOutOfDate + totalExtraOnline
      },
      modules: moduleMap,
      tables: tableAudits
    })
  } catch (err: any) {
    console.error('[FullSync Audit] Error:', err)
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to compare databases' },
      { status: 500 }
    )
  }
}

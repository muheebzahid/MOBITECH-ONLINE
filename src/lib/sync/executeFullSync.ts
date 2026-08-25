import { SupabaseClient } from '@supabase/supabase-js'
import { SYNC_TABLES, SyncTableConfig } from './syncTableConfig'

/**
 * Full Mirror Sync Engine
 *
 * Mirrors the entire local (master) ERP to the online cloud ERP.
 * - Upserts ALL local records to online (in FK-safe order)
 * - Deletes orphan records from online that don't exist locally (in reverse FK order)
 * - Sanitizes auth-user FK references that don't exist in cloud (maps matching emails)
 * - Strips PostgreSQL GENERATED ALWAYS columns (computed automatically by DB)
 * - Dynamically strips columns not present in online schema
 *
 * IMPORTANT: This engine NEVER modifies the local/master ERP.
 * All writes go to the online Supabase instance only.
 */

export interface SyncTableResult {
  table: string
  displayName: string
  upserted: number
  deleted: number
  skipped: number
  errors: string[]
}

export interface FullSyncResult {
  success: boolean
  started_at: string
  completed_at: string
  table_results: SyncTableResult[]
  total_upserted: number
  total_deleted: number
  total_errors: number
  error?: string
}

async function fetchAllRecords(supabase: SupabaseClient, tableName: string): Promise<any[]> {
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
      console.error(`[FullSync] Error fetching ${tableName}: ${error.message}`)
      return allRecords
    }

    if (!data || data.length === 0) break
    allRecords.push(...data)

    if (data.length < pageSize) break
    from += pageSize
  }

  return allRecords
}

async function batchUpsert(
  supabase: SupabaseClient,
  tableName: string,
  records: any[]
): Promise<{ count: number; errors: string[] }> {
  if (records.length === 0) return { count: 0, errors: [] }

  const batchSize = 250
  let totalCount = 0
  const errors: string[] = []

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize)
    const { error } = await supabase
      .from(tableName)
      .upsert(batch, { onConflict: 'id' })

    if (error) {
      errors.push(`Upsert batch ${Math.floor(i / batchSize) + 1} for ${tableName}: ${error.message}`)
    } else {
      totalCount += batch.length
    }
  }

  return { count: totalCount, errors }
}

async function batchDelete(
  supabase: SupabaseClient,
  tableName: string,
  ids: string[]
): Promise<{ count: number; errors: string[] }> {
  if (ids.length === 0) return { count: 0, errors: [] }

  const batchSize = 250
  let totalCount = 0
  const errors: string[] = []

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize)
    const { error } = await supabase
      .from(tableName)
      .delete()
      .in('id', batch)

    if (error) {
      errors.push(`Delete batch ${Math.floor(i / batchSize) + 1} for ${tableName}: ${error.message}`)
    } else {
      totalCount += batch.length
    }
  }

  return { count: totalCount, errors }
}

export async function executeFullMirrorSync(
  localSupabase: SupabaseClient,
  onlineSupabase: SupabaseClient
): Promise<FullSyncResult> {
  const startedAt = new Date().toISOString()
  const tableResults: SyncTableResult[] = []

  // ── AUTH USER MAPPING ──────────────────────────────────────────────
  // Fetch users from auth.admin on both sides to map local auth UUIDs to online auth UUIDs by email
  let mapLocalUserToOnline = (localId: string | null): string | null => null
  try {
    const [{ data: localAuth }, { data: onlineAuth }] = await Promise.all([
      localSupabase.auth.admin.listUsers({ perPage: 1000 }).catch(() => ({ data: null })),
      onlineSupabase.auth.admin.listUsers({ perPage: 1000 }).catch(() => ({ data: null }))
    ])

    const localIdToEmail = new Map<string, string>()
    if (localAuth?.users) {
      for (const u of localAuth.users) {
        if (u.id && u.email) localIdToEmail.set(u.id, u.email.toLowerCase())
      }
    }

    const emailToOnlineId = new Map<string, string>()
    const onlineUserIds = new Set<string>()
    if (onlineAuth?.users) {
      for (const u of onlineAuth.users) {
        if (u.id) {
          onlineUserIds.add(u.id)
          if (u.email) emailToOnlineId.set(u.email.toLowerCase(), u.id)
        }
      }
    }

    mapLocalUserToOnline = (localId: string | null): string | null => {
      if (!localId) return null
      // Already valid in online?
      if (onlineUserIds.has(localId)) return localId
      // Match by email
      const email = localIdToEmail.get(localId)
      if (email && emailToOnlineId.has(email)) {
        return emailToOnlineId.get(email)!
      }
      return null
    }
  } catch (err: any) {
    console.warn('[FullSync] Could not build auth user map:', err.message)
  }

  // ── PHASE 1: UPSERTS (in FK-safe order, parents first) ──────────
  const sortedForUpsert = [...SYNC_TABLES].sort((a, b) => a.upsertOrder - b.upsertOrder)

  for (const config of sortedForUpsert) {
    const result: SyncTableResult = {
      table: config.table,
      displayName: config.displayName,
      upserted: 0,
      deleted: 0,
      skipped: 0,
      errors: []
    }

    try {
      // 1. Check if table exists on online Supabase
      const { error: testTableErr } = await onlineSupabase.from(config.table).select('id').limit(1)
      if (testTableErr && (testTableErr.code === 'PGRST205' || testTableErr.message.includes('schema cache'))) {
        result.skipped = 1
        result.errors.push(`Table ${config.table} does not exist in Online Cloud database yet — skipping`)
        tableResults.push(result)
        continue
      }

      // 2. Fetch all local records (read-only from master)
      const localRecords = await fetchAllRecords(localSupabase, config.table)
      if (localRecords.length === 0) {
        tableResults.push(result)
        continue
      }

      // 3. Find valid columns on online target table
      const firstRec = localRecords[0]
      const validOnlineCols = new Set<string>()
      const genCols = new Set(config.generatedColumns || [])

      for (const col of Object.keys(firstRec)) {
        if (genCols.has(col)) continue
        const { error: colErr } = await onlineSupabase.from(config.table).select(col).limit(1)
        if (!colErr) {
          validOnlineCols.add(col)
        }
      }

      // 4. Sanitize records
      const authCols = new Set(config.authUserFields || [])
      const sanitizedRecords = localRecords.map(rec => {
        const clean: Record<string, any> = {}
        for (const col of Object.keys(rec)) {
          if (!validOnlineCols.has(col)) continue
          if (genCols.has(col)) continue

          let val = rec[col]
          if (authCols.has(col)) {
            val = mapLocalUserToOnline(val)
          }
          clean[col] = val
        }
        return clean
      })

      // 5. Upsert sanitized records
      const upsertResult = await batchUpsert(onlineSupabase, config.table, sanitizedRecords)
      result.upserted = upsertResult.count
      result.errors.push(...upsertResult.errors)

    } catch (err: any) {
      result.errors.push(`Upsert error for ${config.table}: ${err.message}`)
    }

    tableResults.push(result)
  }

  // ── PHASE 2: DELETIONS (in reverse FK order, children first) ────
  const sortedForDelete = [...SYNC_TABLES].sort((a, b) => b.upsertOrder - a.upsertOrder)

  for (const config of sortedForDelete) {
    const existingResult = tableResults.find(r => r.table === config.table)
    if (!existingResult || existingResult.skipped > 0) continue

    try {
      // Fetch IDs from both sides
      const [localRecords, onlineRecords] = await Promise.all([
        fetchAllRecords(localSupabase, config.table),
        fetchAllRecords(onlineSupabase, config.table)
      ])

      const localIdSet = new Set(localRecords.map(r => r.id))
      const orphanIds = onlineRecords
        .filter(r => r.id && !localIdSet.has(r.id))
        .map(r => r.id)

      if (orphanIds.length > 0) {
        const deleteResult = await batchDelete(onlineSupabase, config.table, orphanIds)
        existingResult.deleted = deleteResult.count
        existingResult.errors.push(...deleteResult.errors)
      }
    } catch (err: any) {
      existingResult.errors.push(`Delete error for ${config.table}: ${err.message}`)
    }
  }

  const completedAt = new Date().toISOString()
  const totalErrors = tableResults.reduce((s, r) => s + r.errors.length, 0)

  return {
    success: totalErrors === 0,
    started_at: startedAt,
    completed_at: completedAt,
    table_results: tableResults,
    total_upserted: tableResults.reduce((s, r) => s + r.upserted, 0),
    total_deleted: tableResults.reduce((s, r) => s + r.deleted, 0),
    total_errors: totalErrors,
    error: totalErrors > 0
      ? tableResults
          .filter(r => r.errors.length > 0)
          .map(r => `${r.displayName}: ${r.errors.join('; ')}`)
          .join('\n')
      : undefined
  }
}

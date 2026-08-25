import { SupabaseClient } from '@supabase/supabase-js'
import { SYNC_TABLES } from './syncTableConfig'

/**
 * Full Mirror Sync Engine
 *
 * Mirrors the entire local (master) ERP to the online cloud ERP.
 * - Upserts ALL local records to online (in FK-safe order)
 * - Deletes orphan records from online that don't exist locally (in reverse FK order)
 * - Sanitizes auth-user FK references that don't exist in cloud
 *
 * IMPORTANT: This engine NEVER modifies the local/master ERP.
 * All writes go to the online Supabase instance only.
 */

interface SyncTableResult {
  table: string
  displayName: string
  upserted: number
  deleted: number
  skipped: number
  errors: string[]
}

interface FullSyncResult {
  success: boolean
  started_at: string
  completed_at: string
  table_results: SyncTableResult[]
  total_upserted: number
  total_deleted: number
  total_errors: number
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

async function batchUpsert(supabase: SupabaseClient, tableName: string, records: any[]): Promise<{ count: number; errors: string[] }> {
  if (records.length === 0) return { count: 0, errors: [] }

  const batchSize = 500
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

async function batchDelete(supabase: SupabaseClient, tableName: string, ids: string[]): Promise<{ count: number; errors: string[] }> {
  if (ids.length === 0) return { count: 0, errors: [] }

  const batchSize = 500
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

  // Get cloud auth user IDs to sanitize auth-user FK fields
  let cloudUserIds = new Set<string>()
  try {
    const { data: cloudUsers } = await onlineSupabase.from('users').select('id')
    cloudUserIds = new Set((cloudUsers || []).map((u: any) => u.id))
  } catch {
    // If users table not accessible, we'll just null-ify all auth fields
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
      // Fetch all local records (read-only from master)
      const localRecords = await fetchAllRecords(localSupabase, config.table)

      // Sanitize auth-user FK fields
      const sanitizedRecords = localRecords.map(rec => {
        const copy = { ...rec }
        if (config.authUserFields) {
          for (const field of config.authUserFields) {
            if (copy[field] && !cloudUserIds.has(copy[field])) {
              copy[field] = null
            }
          }
        }
        // Handle file URLs pointing to local storage
        if (config.fileUrlFields) {
          for (const field of config.fileUrlFields) {
            // Keep URLs as-is for now; file upload is handled separately
            // Local URLs (127.0.0.1) will remain but won't break the sync
          }
        }
        return copy
      })

      // Upsert all local records to online
      const upsertResult = await batchUpsert(onlineSupabase, config.table, sanitizedRecords)
      result.upserted = upsertResult.count
      result.errors.push(...upsertResult.errors)

    } catch (err: any) {
      result.errors.push(`Upsert phase for ${config.table}: ${err.message}`)
    }

    tableResults.push(result)
  }

  // ── PHASE 2: DELETIONS (in reverse FK order, children first) ────
  const sortedForDelete = [...SYNC_TABLES].sort((a, b) => b.upsertOrder - a.upsertOrder)

  for (const config of sortedForDelete) {
    const existingResult = tableResults.find(r => r.table === config.table)
    if (!existingResult) continue

    try {
      // Fetch IDs from both sides
      const localRecords = await fetchAllRecords(localSupabase, config.table)
      const onlineRecords = await fetchAllRecords(onlineSupabase, config.table)

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
      existingResult.errors.push(`Delete phase for ${config.table}: ${err.message}`)
    }
  }

  const completedAt = new Date().toISOString()

  return {
    success: tableResults.every(r => r.errors.length === 0),
    started_at: startedAt,
    completed_at: completedAt,
    table_results: tableResults,
    total_upserted: tableResults.reduce((s, r) => s + r.upserted, 0),
    total_deleted: tableResults.reduce((s, r) => s + r.deleted, 0),
    total_errors: tableResults.reduce((s, r) => s + r.errors.length, 0)
  }
}

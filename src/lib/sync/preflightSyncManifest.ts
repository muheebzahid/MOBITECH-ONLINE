import { 
  SyncManifest, 
  DealDiscoveryPackage,
  PreflightResponse, 
  PreflightRecordResult, 
  PreflightFileResult,
  PreflightAction,
  FilePreflightAction
} from './types'
import { calculateRecordChecksum } from './calculateRecordChecksum'
import { createOnlineClient } from '../supabase/online-server'

export async function preflightSyncManifest(
  manifest: SyncManifest, 
  pkg: DealDiscoveryPackage, 
  localSupabase: any
): Promise<PreflightResponse> {
  if (manifest.status === 'BLOCKED') {
    return {
      success: false,
      status: 'BLOCKED',
      summary: { create: 0, update: 0, skip: 0, conflict: 0, blocked: manifest.counts.records.total_records },
      records: [],
      files: [],
      required_related_deals: manifest.required_related_deals,
      issues: manifest.issues,
      estimated_payload_bytes: manifest.estimated_payload_bytes,
      error: 'Manifest is locally BLOCKED. Cannot preflight.'
    }
  }

  const preflightRecords: PreflightRecordResult[] = []
  const preflightFiles: PreflightFileResult[] = []
  const summary = { create: 0, update: 0, skip: 0, conflict: 0, blocked: 0 }
  let hasConflict = false

  try {
    const tables = [
      { name: 'deals', records: pkg.deals },
      { name: 'deal_items', records: pkg.deal_items },
      { name: 'deal_status_history', records: pkg.deal_status_history },
      { name: 'deal_edit_history', records: pkg.deal_edit_history },
      { name: 'shipments', records: pkg.shipments },
      { name: 'shipment_deals', records: pkg.shipment_deals },
      { name: 'shipment_documents', records: pkg.shipment_documents },
      { name: 'invoices', records: pkg.invoices },
      { name: 'invoice_line_items', records: pkg.invoice_line_items },
      { name: 'clients', records: pkg.clients },
      { name: 'payments', records: pkg.payments },
      { name: 'inventory_items', records: pkg.inventory_items },
      { name: 'inventory_history', records: pkg.inventory_history },
      { name: 'online_orders', records: pkg.online_orders },
      { name: 'online_order_items', records: pkg.online_order_items }
    ]

    for (const tableObj of tables) {
      const { name: tableName, records } = tableObj
      if (!records || records.length === 0) continue

      const ids = records.map(r => r.id).filter(Boolean)
      if (ids.length === 0) continue

      // Fetch target records using localSupabase server client
      const { data: onlineData, error: onlineErr } = await localSupabase
        .from(tableName)
        .select('*')
        .in('id', ids)

      if (onlineErr) {
        console.warn('Target query notice for ' + tableName + ':', onlineErr.message)
      }
      
      const onlineMap = new Map((onlineData || []).map((r: any) => [r.id, r]))

      // Fetch local sync state
      const { data: syncStateData, error: syncStateErr } = await localSupabase
        .from('record_sync_state')
        .select('*')
        .eq('source_table', tableName)
        .in('source_record_id', ids)

      if (syncStateErr) {
        console.warn('Sync state query notice for ' + tableName + ':', syncStateErr.message)
      }

      const syncStateMap = new Map((syncStateData || []).map((s: any) => [s.source_record_id, s]))

      for (const localRecord of records) {
        const id = localRecord.id
        const onlineRecord = onlineMap.get(id)
        const syncState = syncStateMap.get(id)

        const localChecksum = calculateRecordChecksum(tableName, localRecord)
        const onlineChecksum = onlineRecord ? calculateRecordChecksum(tableName, onlineRecord) : null
        const lastSyncedOnlineChecksum = syncState ? (syncState as any).last_synced_online_checksum : null

        let action: PreflightAction = 'BLOCKED'
        let reason = ''

        if (!syncState) {
          // FIRST-SYNC RULE
          if (!onlineRecord) {
            action = 'CREATE'
          } else if (localChecksum === onlineChecksum) {
            action = 'SKIP'
          } else {
            action = 'CONFLICT'
            reason = 'Record exists online with different data, and no prior sync state exists locally.'
          }
        } else {
          // NORMAL SYNC RULES
          if (!onlineRecord) {
            // It was synced before, but now missing online!
            // According to our rules, we classify as CREATE (to re-push) or CONFLICT? 
            // The prompt says CREATE if UUID does not exist online. Let's stick to CREATE.
            action = 'CREATE'
          } else if (localChecksum === onlineChecksum) {
            action = 'SKIP'
          } else if (onlineChecksum === lastSyncedOnlineChecksum) {
            action = 'UPDATE'
          } else {
            action = 'CONFLICT'
            reason = 'Online record was independently modified since last sync.'
          }
        }

        if (action === 'CREATE') summary.create++
        else if (action === 'UPDATE') summary.update++
        else if (action === 'SKIP') summary.skip++
        else if (action === 'CONFLICT') { summary.conflict++; hasConflict = true }
        else if (action === 'BLOCKED') summary.blocked++

        preflightRecords.push({
          table: tableName,
          record_id: id,
          action,
          local_checksum: localChecksum,
          online_checksum: onlineChecksum,
          last_synced_online_checksum: lastSyncedOnlineChecksum,
          reason
        })
      }
    }

    // Process files
    for (const file of manifest.files) {
      let online_status: FilePreflightAction = 'UNVERIFIED'
      
      if (file.status === 'MISSING_REFERENCE') {
        online_status = 'BLOCKED'
      } else {
        try {
          let folder = ''
          let filename = file.objectPath
          if (file.objectPath.includes(`public/${file.bucket}/`)) {
            const relativePath = file.objectPath.split(`public/${file.bucket}/`)[1]
            if (relativePath) {
              const parts = relativePath.split('/')
              filename = parts.pop() || ''
              folder = parts.join('/')
            }
          } else if (file.objectPath.includes('/')) {
             const parts = file.objectPath.split('/')
             filename = parts.pop() || ''
             folder = parts.join('/')
          }

          const { data: fileList, error: fileErr } = await localSupabase.storage
            .from(file.bucket)
            .list(folder, { search: filename })

          if (fileErr || !fileList) {
            online_status = 'UNVERIFIED'
          } else {
            const found = fileList.find((f: any) => f.name === filename)
            if (found) {
              online_status = 'UNVERIFIED'
            } else {
              online_status = 'MISSING_ONLINE'
            }
          }
        } catch {
          online_status = 'UNVERIFIED'
        }
      }

      preflightFiles.push({
        ...file,
        online_status
      })
    }

    let finalStatus: any = manifest.status
    if (hasConflict) {
      finalStatus = 'CONFLICT'
    }

    return {
      success: true,
      status: finalStatus,
      summary,
      records: preflightRecords,
      files: preflightFiles,
      required_related_deals: manifest.required_related_deals,
      issues: manifest.issues,
      estimated_payload_bytes: manifest.estimated_payload_bytes
    }

  } catch (err: any) {
    console.error('PREFLIGHT CATCH ERROR:', err)
    return {
      success: false,
      status: 'BLOCKED',
      summary,
      records: [],
      files: [],
      required_related_deals: manifest.required_related_deals,
      issues: manifest.issues,
      estimated_payload_bytes: manifest.estimated_payload_bytes,
      error: err.message || 'Unknown preflight error'
    }
  }
}

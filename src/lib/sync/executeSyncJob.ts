import { createClient } from '@/lib/supabase/server'
import { createOnlineClient } from '@/lib/supabase/online-server'
import { discoverDealPackage } from './discoverDealPackage'
import { buildSyncManifest } from './buildSyncManifest'
import { preflightSyncManifest } from './preflightSyncManifest'
import { calculateRecordChecksum } from './calculateRecordChecksum'
import { createHash } from 'crypto'

export async function executeSyncJob(input: { dealIds: string[]; userRole?: string; localSupabase?: any } | string[]) {
  const dealIds = Array.isArray(input) ? input : input.dealIds
  const localSupabase = await createClient()
  const onlineSupabase = createOnlineClient()


// 1. Discover Package
  let discovery = await discoverDealPackage({ dealIds }, localSupabase)
  if (!discovery.success || !discovery.package) {
    return {
      success: false,
      status: 'FAILED',
      error: discovery.error || 'Failed to discover deal package'
    }
  }

  // ==> RESOLVE CLIENT NAME CONFLICTS <==
  if (discovery.package.clients && discovery.package.clients.length > 0) {
    const localClientNames = discovery.package.clients.map((c: any) => c.name);
    const { data: onlineClients } = await onlineSupabase
      .from('clients')
      .select('*')
      .in('name', localClientNames);
      
    if (onlineClients && onlineClients.length > 0) {
      const onlineClientMap = new Map(onlineClients.map((c: any) => [c.name, c]));
      let needsRediscovery = false;
      
      for (const client of discovery.package.clients) {
        if (onlineClientMap.has(client.name)) {
          const onlineClient = onlineClientMap.get(client.name);
          const onlineId = onlineClient.id;
          
          if (client.id !== onlineId) {
            const oldId = client.id;
            const originalName = client.name;
            
            // 1. Rename old client to free up the unique name constraint
            await localSupabase.from('clients').update({ name: `${originalName}_TEMP_SYNC_SWAP_${oldId}` }).eq('id', oldId);
            
            // 2. Insert new client with onlineId
            await localSupabase.from('clients').insert({ ...client, id: onlineId, name: originalName });
            
            // 3. Update invoices
            await localSupabase.from('invoices').update({ client_id: onlineId }).eq('client_id', oldId);
            
            // 4. Delete old client
            await localSupabase.from('clients').delete().eq('id', oldId);
            
            // 5. Force sync state
            const onlineChecksum = calculateRecordChecksum('clients', onlineClient);
            await localSupabase.from('record_sync_state').upsert({
              source_table: 'clients',
              source_record_id: onlineId,
              last_synced_local_checksum: onlineChecksum,
              last_synced_online_checksum: onlineChecksum,
              destination_project_id: 'aivcmkwclfipntadipec'
            }, { onConflict: 'source_table, source_record_id, destination_project_id' });
            
            needsRediscovery = true;
          }
        }
      }
      
      if (needsRediscovery) {
        discovery = await discoverDealPackage({ dealIds }, localSupabase)
        if (!discovery.success || !discovery.package) {
          return {
            success: false,
            status: 'FAILED',
            error: discovery.error || 'Failed to re-discover deal package after conflict resolution'
          }
        }
      }
    }
  }

  // 2. Build Manifest
  const manifest = buildSyncManifest(discovery)
  if (manifest.status === 'BLOCKED') {
    return {
      success: false,
      status: 'BLOCKED',
      error: 'Cannot execute sync job: Package is BLOCKED by missing dependencies or validation errors',
      manifest,
      blocking_issues: manifest.issues.filter(i => i.blocking)
    }
  }

  const manifestId = crypto.randomUUID()
  const syncJobId = crypto.randomUUID()
  const pkg = discovery.package

  // 3. Preflight Check
  const preflight = await preflightSyncManifest(manifest, pkg, localSupabase)

  // 3.5 Transfer Binary Files to Live Cloud
  for (const file of manifest.files) {
    if (file.objectPath && file.objectPath.includes('127.0.0.1')) {
      let filename = file.objectPath
      let folder = ''
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
      
      const storagePath = folder ? `${folder}/${filename}` : filename
      
      try {
        const { data: fileData, error: downloadErr } = await localSupabase.storage
          .from(file.bucket)
          .download(storagePath)

        if (fileData) {
          const { error: uploadErr } = await onlineSupabase.storage
            .from(file.bucket)
            .upload(storagePath, fileData, { upsert: true })

          if (!uploadErr) {
            const { data: { publicUrl } } = onlineSupabase.storage
              .from(file.bucket)
              .getPublicUrl(storagePath)

            // Rewrite the URL in the local payload pkg object
            if (file.sourceTable === 'shipment_documents') {
              const doc = pkg.shipment_documents.find((d: any) => d.id === file.sourceRecordId)
              if (doc) doc.file_url = publicUrl
            } else if (file.sourceTable === 'invoices') {
              const inv = pkg.invoices.find((i: any) => i.id === file.sourceRecordId)
              if (inv) inv.pdf_url = publicUrl
            }
          }
        }
      } catch (err) {
        console.error("File sync error:", err)
      }
    }
  }

  // 4. Assemble Sync Payload
  const payloadRecords = {
    clients: pkg.clients,
    deals: pkg.deals,
    deal_items: pkg.deal_items,
    shipments: pkg.shipments.map(s => ({
      ...s,
      handled_by: s.handled_by === undefined ? null : s.handled_by
    })),
    shipment_deals: pkg.shipment_deals,
    shipment_documents: pkg.shipment_documents,
    invoices: pkg.invoices,
    invoice_line_items: pkg.invoice_line_items,
    payments: pkg.payments,
    inventory_items: pkg.inventory_items,
    inventory_history: pkg.inventory_history,
    online_orders: pkg.online_orders,
    online_order_items: pkg.online_order_items
  }

  const payloadString = JSON.stringify(payloadRecords)
  const payloadChecksum = createHash('sha256').update(payloadString).digest('hex')

  const payload = {
    manifest_id: manifestId,
    sync_job_id: syncJobId,
    payload_checksum: payloadChecksum,
    schema_version: '1.0',
    source_system: 'MOBITECH-LOCAL-MASTER',
    generated_at: new Date().toISOString(),
    selected_deal_ids: dealIds,
    records: payloadRecords
  }

  // 5. Invoke Production RPC on ONLINE CLOUD SUPABASE (aivcmkwclfipntadipec)
  const { data: rpcData, error: rpcErr } = await onlineSupabase.rpc('execute_deal_sync_transaction', { payload })

  if (rpcErr || !rpcData?.success) {
    // Record failed job locally
    await localSupabase.from('sync_jobs').insert({
      id: syncJobId,
      status: 'FAILED',
      destination_project_id: 'aivcmkwclfipntadipec',
      error_summary: { message: rpcErr?.message || rpcData?.error || 'Cloud RPC transaction failed' }
    })

    return {
      success: false,
      status: 'FAILED',
      destination_project_ref: 'aivcmkwclfipntadipec',
      destination_domain: 'the-workflows.com',
      error: rpcErr?.message || rpcData?.error || 'Cloud RPC Execution Failed'
    }
  }

  // 6. MANDATORY CLOUD DATA VERIFICATION STAGE (VERIFYING_CLOUD_DATA)
  const verificationReport: Record<string, { expected: number; cloud_verified: number; missing_uuids: string[] }> = {}
  let totalExpectedCount = 0
  let totalCloudVerifiedCount = 0
  const missingRecords: { table: string; id: string }[] = []

  // A. Verify Cloud Execution Receipt
  const { data: cloudReceipt, error: receiptErr } = await onlineSupabase
    .from('sync_execution_receipts')
    .select('*')
    .eq('manifest_id', manifestId)
    .single()

  const receiptVerified = !receiptErr && cloudReceipt && cloudReceipt.status === 'COMPLETED'

  // B. Query each table from Cloud project aivcmkwclfipntadipec by exact UUID
  const tables = Object.keys(payloadRecords) as (keyof typeof payloadRecords)[]

  for (const tbl of tables) {
    const records = payloadRecords[tbl] || []
    const expectedIds = records.map((r: any) => r.id).filter(Boolean)
    totalExpectedCount += expectedIds.length

    if (expectedIds.length === 0) {
      verificationReport[tbl] = { expected: 0, cloud_verified: 0, missing_uuids: [] }
      continue
    }

    const { data: cloudRows, error: cloudQueryErr } = await onlineSupabase
      .from(tbl)
      .select('id')
      .in('id', expectedIds)

    const foundCloudIds = new Set((cloudRows || []).map((r: any) => r.id))
    const missingForTbl: string[] = []

    for (const expectedId of expectedIds) {
      if (!foundCloudIds.has(expectedId)) {
        missingForTbl.push(expectedId)
        missingRecords.push({ table: tbl, id: expectedId })
      }
    }

    const verifiedCount = foundCloudIds.size
    totalCloudVerifiedCount += verifiedCount
    verificationReport[tbl] = {
      expected: expectedIds.length,
      cloud_verified: verifiedCount,
      missing_uuids: missingForTbl
    }
  }

  const isFullyVerified = receiptVerified && totalCloudVerifiedCount === totalExpectedCount && missingRecords.length === 0

  // 7. Record local sync tracking state
  try {
    await localSupabase.from('sync_jobs').insert({
      id: syncJobId,
      status: isFullyVerified ? 'SUCCESS' : 'FAILED',
      destination_project_id: 'aivcmkwclfipntadipec',
      selected_deal_count: dealIds.length,
      records_discovered: totalExpectedCount,
      records_created: totalCloudVerifiedCount,
      error_summary: isFullyVerified ? null : { message: 'Cloud data verification failed', missingRecords }
    })

    if (isFullyVerified) {
      const syncStateRows: any[] = []
      for (const tbl of tables) {
        const records = payloadRecords[tbl] || []
        for (const rec of records) {
          if (!rec.id) continue
          const checksum = calculateRecordChecksum(tbl, rec)
          syncStateRows.push({
            source_table: tbl,
            source_record_id: rec.id,
            last_synced_local_checksum: checksum,
            last_synced_online_checksum: checksum,
            last_synced_at: new Date().toISOString(),
            destination_project_id: 'aivcmkwclfipntadipec'
          })
        }
      }

      if (syncStateRows.length > 0) {
        await localSupabase.from('record_sync_state').upsert(syncStateRows, {
          onConflict: 'source_table, source_record_id, destination_project_id'
        })
      }

      // Mark deals as uploaded with timestamp on both local and online cloud DBs
      const nowIso = new Date().toISOString()
      await localSupabase
        .from('deals')
        .update({ synced_to_online_at: nowIso, last_synced_at: nowIso })
        .in('id', dealIds)

      await onlineSupabase
        .from('deals')
        .update({ synced_to_online_at: nowIso, last_synced_at: nowIso })
        .in('id', dealIds)
    }
  } catch (localStateErr) {
    console.error('Local sync tracking record warning:', localStateErr)
  }

  if (!isFullyVerified) {
    return {
      success: false,
      status: 'VERIFICATION_FAILED',
      destination_project_ref: 'aivcmkwclfipntadipec',
      destination_domain: 'the-workflows.com',
      error: `Cloud Data Verification Failed: Expected ${totalExpectedCount} records, but only ${totalCloudVerifiedCount} verified in cloud project aivcmkwclfipntadipec.`,
      receipt_source: cloudReceipt ? 'CLOUD (aivcmkwclfipntadipec)' : 'MISSING_IN_CLOUD',
      expected_records: totalExpectedCount,
      verified_cloud_records: totalCloudVerifiedCount,
      missing_records_count: missingRecords.length,
      missing_records: missingRecords,
      verification_report: verificationReport,
      manifest_id: manifestId,
      sync_job_id: syncJobId
    }
  }

  return {
    success: true,
    status: 'COMPLETED',
    cloud_verified: true,
    destination_project_ref: 'aivcmkwclfipntadipec',
    destination_domain: 'the-workflows.com',
    receipt_source: 'CLOUD (aivcmkwclfipntadipec)',
    manifest_id: manifestId,
    sync_job_id: syncJobId,
    expected_records: totalExpectedCount,
    verified_cloud_records: totalCloudVerifiedCount,
    missing_records_count: 0,
    verification_report: verificationReport,
    rpcResult: rpcData
  }
}

'use server'

import { createClient } from '@/lib/supabase/server'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { revalidatePath } from 'next/cache'

export async function backupToDesktop() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    // Read all tables in parallel
    const tables = [
      'companies', 'roles', 'user_profiles', 'partners',
      'deals', 'deal_items', 'deal_status_history', 'deal_documents', 'deal_edit_history',
      'shipments', 'shipment_deals', 'invoices', 'invoice_line_items', 'payments',
      'inventory_items', 'inventory_history', 'operating_expenses', 'partner_transactions',
      'treasury_settings', 'wire_transfers', 'repayments', 'user_roles'
    ]

    const backupData: Record<string, any> = {}

    for (const table of tables) {
      const { data, error } = await supabase.from(table).select('*')
      if (error) {
        console.warn(`Failed to backup table ${table}:`, error.message)
        backupData[table] = []
      } else {
        backupData[table] = data || []
      }
    }

    // Determine Desktop path supporting OneDrive & fallbacks
    const homeDir = os.homedir()
    let desktopPath = path.join(/*turbopackIgnore: true*/ homeDir, 'Desktop')
    
    // Check OneDrive first since Windows often redirects there
    const oneDriveDesktop = path.join(/*turbopackIgnore: true*/ homeDir, 'OneDrive', 'Desktop')
    try {
      if (fs.existsSync(oneDriveDesktop) && fs.statSync(oneDriveDesktop).isDirectory()) {
        desktopPath = oneDriveDesktop
      } else if (!fs.existsSync(desktopPath) || !fs.statSync(desktopPath).isDirectory()) {
        // Fallback to Home if Desktop path exists but is a file
        desktopPath = homeDir
      }
    } catch (e) {
      desktopPath = homeDir
    }

    const backupDirName = 'Mobitech_ERP_Backups'
    const targetDir = path.join(/*turbopackIgnore: true*/ desktopPath, backupDirName)


    // Ensure the folder exists on the Desktop
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }

    // Generate filename with timestamp
    const date = new Date()
    const offset = date.getTimezoneOffset()
    const localDate = new Date(date.getTime() - (offset * 60 * 1000))
    const timestamp = localDate.toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-')
    const filename = `mobitech_backup_${timestamp}.json`
    const targetFilePath = path.join(/*turbopackIgnore: true*/ targetDir, filename)

    // Write full backup file
    fs.writeFileSync(targetFilePath, JSON.stringify(backupData, null, 2), 'utf-8')

    // Also write individual table files inside a subdirectory
    const tableSubdirName = `tables_${timestamp}`
    const tableSubdirPath = path.join(/*turbopackIgnore: true*/ targetDir, tableSubdirName)
    fs.mkdirSync(tableSubdirPath, { recursive: true })

    for (const table of tables) {
      if (backupData[table] && backupData[table].length > 0) {
        fs.writeFileSync(
          path.join(/*turbopackIgnore: true*/ tableSubdirPath, `${table}.json`),
          JSON.stringify(backupData[table], null, 2),
          'utf-8'
        )
      }
    }

    return { 
      success: true, 
      path: targetFilePath,
      folder: targetDir 
    }
  } catch (err: any) {
    return { error: err.message }
  }
}

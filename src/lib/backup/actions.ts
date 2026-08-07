'use server'
import { requireWriteAccess } from '@/lib/admin/actions'

import { createClient } from '@/lib/supabase/server'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { revalidatePath } from 'next/cache'

export async function generateOnlineBackup() {
  try {
    const supabase = await createClient()
    
    // Auth Check
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }
    
    // Enforce SUPER_ADMIN exactly like the admin/actions.ts logic
    const { data: userRole } = await supabase.from('user_roles').select('role').eq('user_id', user.id).single()
    if (userRole?.role !== 'SUPER_ADMIN' && user.email !== 'muheebzahid@gmail.com') {
      return { error: 'Unauthorized to create backups' }
    }

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

    // Generate filename with timestamp
    const date = new Date()
    const offset = date.getTimezoneOffset()
    const localDate = new Date(date.getTime() - (offset * 60 * 1000))
    const timestamp = localDate.toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-')
    const filename = `mobitech_online_backup_${timestamp}.json`

    return { 
      success: true, 
      filename,
      data: JSON.stringify(backupData, null, 2)
    }
  } catch (err: any) {
    return { error: err.message }
  }
}

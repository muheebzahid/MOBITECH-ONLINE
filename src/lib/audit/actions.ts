'use server'

import { createClient } from '@/lib/supabase/server'

export interface AuditLogItem {
  id: string
  created_at: string
  action: string
  table_name: string
  record_id: string | null
  old_data: any
  new_data: any
}

/**
 * Log an edit/action to the audit history with user email and role.
 */
export async function logAudit({
  tableName,
  recordId,
  action,
  oldData = null,
  newData = null,
  customEmail,
  customRole
}: {
  tableName: string
  recordId?: string | null
  action: string
  oldData?: any
  newData?: any
  customEmail?: string
  customRole?: string
}) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const email = customEmail || user?.email || 'system@mobitech.com'
    const role = customRole || user?.user_metadata?.role || (email.includes('admin') ? 'SUPER_ADMIN' : 'USER')

    const userMeta = { email, role }

    const finalOldData = oldData ? { _user: userMeta, ...oldData } : null
    const finalNewData = newData ? { _user: userMeta, ...newData } : null

    const { error } = await supabase.from('audit_logs').insert([{
      table_name: tableName,
      record_id: recordId || null,
      action: action,
      user_id: user?.id || null,
      old_data: finalOldData,
      new_data: finalNewData
    }])

    if (error) {
      console.error('Failed to insert audit log:', error.message)
    }
  } catch (err: any) {
    console.error('Audit log error:', err.message)
  }
}

/**
 * Retrieve audit history for a table, optionally filtered by record_id.
 */
export async function getAuditHistory(tableName?: string, recordId?: string) {
  try {
    const supabase = await createClient()
    let query = supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    if (tableName) {
      query = query.eq('table_name', tableName)
    }

    if (recordId) {
      query = query.eq('record_id', recordId)
    }

    const { data, error } = await query

    if (error) {
      console.error('Failed to fetch audit history:', error.message)
      return []
    }

    return data || []
  } catch (err: any) {
    console.error('Fetch audit history error:', err.message)
    return []
  }
}

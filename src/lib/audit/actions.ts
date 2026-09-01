'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

export interface AuditLogItem {
  id: string
  created_at: string
  action: string
  table_name: string
  record_id: string | null
  old_data: any
  new_data: any
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createSupabaseAdmin(url, key)
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

    let email = customEmail || user?.email || 'system@mobitech.com'
    let role = customRole

    if (!role && user) {
      try {
        const { getUserRole } = await import('@/lib/admin/actions')
        const r = await getUserRole()
        if (r) role = r
      } catch (e) {
        role = 'USER'
      }
    }
    if (!role) role = 'USER'

    const userMeta = { email, role }

    const finalOldData = oldData ? { _user: userMeta, ...oldData } : null
    const finalNewData = newData ? { _user: userMeta, ...newData } : null

    const adminClient = getAdminClient()

    const { error } = await adminClient.from('audit_logs').insert([{
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
    console.error('Audit log exception swallowed safely:', err.message)
  }
}

/**
 * Retrieve audit history for a table, optionally filtered by record_id.
 */
export async function getAuditHistory(tableName?: string, recordId?: string) {
  try {
    const adminClient = getAdminClient()
    let query = adminClient
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
    console.error('Fetch audit history exception swallowed safely:', err.message)
    return []
  }
}

/**
 * Retrieve notifications for Master ERP about changes/additions made by Sales role members.
 */
export async function getSalesMemberNotifications(limit: number = 50) {
  try {
    const adminClient = getAdminClient()
    const { data, error } = await adminClient
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    if (error || !data) return []

    // Filter audit logs performed by a user with role 'SALES' or containing SALES metadata
    const salesNotifications = data.filter(item => {
      const roleInNew = item.new_data?._user?.role
      const roleInOld = item.old_data?._user?.role
      return roleInNew === 'SALES' || roleInOld === 'SALES'
    }).slice(0, limit)

    return salesNotifications
  } catch (err: any) {
    console.error('getSalesMemberNotifications error:', err)
    return []
  }
}

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createOnlineClient } from '@/lib/supabase/online-server'
import { getUserRole } from '@/lib/admin/actions'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const role = await getUserRole()
    if (role !== 'SUPER_ADMIN' && role !== 'FINANCE' && role !== 'SALES') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const localSupabase = await createClient()
    const onlineSupabase = createOnlineClient()

    // 1. Fetch Local Operating Expenses
    const { data: localExpenses, error: locErr } = await localSupabase
      .from('operating_expenses')
      .select('*')

    if (locErr) {
      return NextResponse.json({ success: false, error: 'Failed to fetch local operating expenses: ' + locErr.message }, { status: 500 })
    }

    // 2. Fetch Local Treasury Settlements
    const { data: localTreasury } = await localSupabase
      .from('treasury_transactions')
      .select('*')

    // 3. Fetch cloud auth user IDs to prevent FK crashes
    const { data: cloudUsers } = await onlineSupabase
      .from('users')
      .select('id')

    const cloudUserIds = new Set((cloudUsers || []).map(u => u.id))

    // 4. Prepare sanitized expense records for cloud insertion/upsert
    const sanitizedExpenses = (localExpenses || []).map(exp => {
      const copy = { ...exp }
      if (copy.logged_by && !cloudUserIds.has(copy.logged_by)) {
        copy.logged_by = null
      }
      return copy
    })

    // 5. Upsert operating_expenses into online Supabase project aivcmkwclfipntadipec
    if (sanitizedExpenses.length > 0) {
      const { error: upsertErr } = await onlineSupabase
        .from('operating_expenses')
        .upsert(sanitizedExpenses, { onConflict: 'id' })

      if (upsertErr) {
        return NextResponse.json({ success: false, error: 'Failed to sync operating expenses to cloud: ' + upsertErr.message }, { status: 500 })
      }
    }

    // 6. Mirror & Upsert Treasury Settlements into Online Repayments table
    let syncedTreasuryCount = 0
    if (localTreasury && localTreasury.length > 0) {
      const repaymentsPayload = localTreasury.map(rec => ({
        id: rec.id,
        amount: rec.amount,
        source: rec.transaction_type, // 'TURBO_TO_SB' or 'SB_TO_AMEX'
        notes: `[Cycle: ${rec.month_cycle} | Date: ${rec.transaction_date}] ${rec.reference_notes}`,
        logged_by: null,
        created_at: rec.created_at || new Date().toISOString()
      }))

      const { error: repErr } = await onlineSupabase
        .from('repayments')
        .upsert(repaymentsPayload, { onConflict: 'id' })

      if (!repErr) {
        syncedTreasuryCount = repaymentsPayload.length
      }
    }

    // 7. Cloud Verification Read-back
    const { data: cloudExpenses } = await onlineSupabase
      .from('operating_expenses')
      .select('id')

    return NextResponse.json({
      success: true,
      synced_expenses_count: sanitizedExpenses.length,
      synced_treasury_count: syncedTreasuryCount,
      verified_online_expenses_count: cloudExpenses?.length || 0,
      destination_project_ref: 'aivcmkwclfipntadipec',
      destination_domain: 'the-workflows.com'
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Internal operating expense sync error' }, { status: 500 })
  }
}

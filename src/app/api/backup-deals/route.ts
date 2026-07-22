import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

// This API route exports all deals data to supabase/seed.sql so it
// survives any local db reset.
export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Fetch all deals
    const { data: deals, error: dealsError } = await supabase
      .from('deals')
      .select('*')
      .order('created_at', { ascending: true })

    if (dealsError) return NextResponse.json({ error: dealsError.message }, { status: 500 })

    if (!deals || deals.length === 0) {
      return NextResponse.json({ message: 'No deals to backup', count: 0 })
    }

    // Fetch all deal_items
    const { data: dealItems } = await supabase
      .from('deal_items')
      .select('*')
      .order('created_at', { ascending: true })

    // Build SQL seed file
    const lines: string[] = []
    lines.push('-- AUTO-GENERATED SEED FILE')
    lines.push('-- Generated at: ' + new Date().toISOString())
    lines.push('-- This file is automatically updated after every bulk upload.')
    lines.push('-- It will be re-applied on every `npx supabase db reset`.')
    lines.push('')
    lines.push('-- DEALS')

    for (const deal of deals) {
      const cols = Object.keys(deal).filter(k => deal[k] !== null && deal[k] !== undefined)
      const colList = cols.map(c => `"${c}"`).join(', ')
      const valList = cols.map(c => {
        const v = deal[c]
        if (v === null || v === undefined) return 'NULL'
        if (typeof v === 'boolean') return v ? 'true' : 'false'
        if (typeof v === 'number') return String(v)
        // Escape single quotes
        return `'${String(v).replace(/'/g, "''")}'`
      }).join(', ')

      lines.push(`INSERT INTO deals (${colList}) VALUES (${valList}) ON CONFLICT (deal_number) DO UPDATE SET ${cols.map(c => {
        const v = deal[c]
        if (v === null || v === undefined) return `"${c}" = NULL`
        if (typeof v === 'boolean') return `"${c}" = ${v}`
        if (typeof v === 'number') return `"${c}" = ${v}`
        return `"${c}" = '${String(v).replace(/'/g, "''")}'`
      }).join(', ')};`)
    }

    if (dealItems && dealItems.length > 0) {
      lines.push('')
      lines.push('-- DEAL ITEMS')
      for (const item of dealItems) {
        const cols = Object.keys(item).filter(k => item[k] !== null && item[k] !== undefined)
        const colList = cols.map(c => `"${c}"`).join(', ')
        const valList = cols.map(c => {
          const v = item[c]
          if (v === null || v === undefined) return 'NULL'
          if (typeof v === 'boolean') return v ? 'true' : 'false'
          if (typeof v === 'number') return String(v)
          return `'${String(v).replace(/'/g, "''")}'`
        }).join(', ')
        lines.push(`INSERT INTO deal_items (${colList}) VALUES (${valList}) ON CONFLICT (id) DO NOTHING;`)
      }
    }

    const sql = lines.join('\n')

    // Write to supabase/seed.sql
    const seedPath = path.join(process.cwd(), 'supabase', 'seed.sql')
    fs.writeFileSync(seedPath, sql, 'utf-8')

    return NextResponse.json({
      success: true,
      count: deals.length,
      message: `Backed up ${deals.length} deals to supabase/seed.sql`,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ info: 'POST to this endpoint to backup deals data to seed.sql' })
}

'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type AttClosingPrice = {
  id: string
  model: string
  storage: string
  grade: string
  carrier: string
  closing_price: number
  auction_date: string
  quantity: number
  notes?: string | null
  created_at: string
}

/**
 * Fetch all AT&T closing prices ordered by auction_date DESC
 */
export async function getAttClosingPrices(): Promise<AttClosingPrice[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('att_closing_prices')
    .select('*')
    .order('auction_date', { ascending: false })

  if (error) {
    console.error('Error fetching att_closing_prices:', error)
    return []
  }

  return (data || []).map(item => ({
    ...item,
    closing_price: Number(item.closing_price || 0),
    quantity: Number(item.quantity || 1)
  }))
}

/**
 * Manually add a single AT&T closing price record
 */
export async function addAttClosingPrice(formData: FormData) {
  const supabase = await createClient()

  const model = (formData.get('model') as string || '').trim()
  const storage = (formData.get('storage') as string || '').trim()
  const grade = (formData.get('grade') as string || '').trim()
  const carrier = (formData.get('carrier') as string || 'Unlocked').trim()
  const closing_price = parseFloat(formData.get('closing_price') as string) || 0
  const auction_date = (formData.get('auction_date') as string) || new Date().toISOString().split('T')[0]
  const quantity = parseInt(formData.get('quantity') as string) || 1
  const notes = (formData.get('notes') as string || '').trim()

  if (!model) return { error: 'Model is required.' }
  if (!storage) return { error: 'Storage is required.' }
  if (!grade) return { error: 'Grade is required.' }
  if (closing_price <= 0) return { error: 'Closing price must be greater than $0.' }

  const { data, error } = await supabase
    .from('att_closing_prices')
    .insert({
      model,
      storage,
      grade,
      carrier,
      closing_price,
      auction_date,
      quantity,
      notes: notes || null
    })
    .select()
    .single()

  if (error) {
    console.error('Error inserting att_closing_prices:', error)
    return { error: error.message }
  }

  revalidatePath('/dashboard/analytics')
  return { success: true, data }
}

/**
 * Bulk add multiple AT&T closing prices (parsed from Excel / CSV)
 */
export async function addAttClosingPricesBulk(items: Array<{
  model: string
  storage: string
  grade: string
  carrier?: string
  closing_price: number
  auction_date?: string
  quantity?: number
  notes?: string
}>) {
  const supabase = await createClient()

  if (!items || items.length === 0) {
    return { error: 'No items provided for import.' }
  }

  const defaultDate = new Date().toISOString().split('T')[0]

  const recordsToInsert = items.map(item => ({
    model: (item.model || '').trim(),
    storage: (item.storage || '').trim(),
    grade: (item.grade || '').trim(),
    carrier: (item.carrier || 'Unlocked').trim(),
    closing_price: Number(item.closing_price || 0),
    auction_date: item.auction_date ? item.auction_date : defaultDate,
    quantity: Number(item.quantity || 1),
    notes: item.notes ? item.notes.trim() : null
  })).filter(r => r.model && r.storage && r.grade && r.closing_price > 0)

  if (recordsToInsert.length === 0) {
    return { error: 'No valid records found in the import file. Ensure Model, Storage, Grade, and Closing Price are populated.' }
  }

  const { data, error } = await supabase
    .from('att_closing_prices')
    .insert(recordsToInsert)
    .select()

  if (error) {
    console.error('Error bulk inserting att_closing_prices:', error)
    return { error: error.message }
  }

  revalidatePath('/dashboard/analytics')
  return { success: true, count: data?.length || 0 }
}

/**
 * Delete an AT&T closing price record by ID
 */
export async function deleteAttClosingPrice(id: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('att_closing_prices')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting att_closing_price:', error)
    return { error: error.message }
  }

  revalidatePath('/dashboard/analytics')
  return { success: true }
}

/**
 * Update an existing AT&T closing price record
 */
export async function updateAttClosingPrice(id: string, formData: FormData) {
  const supabase = await createClient()

  const model = (formData.get('model') as string || '').trim()
  const storage = (formData.get('storage') as string || '').trim()
  const grade = (formData.get('grade') as string || '').trim()
  const carrier = (formData.get('carrier') as string || 'Unlocked').trim()
  const closing_price = parseFloat(formData.get('closing_price') as string) || 0
  const auction_date = (formData.get('auction_date') as string) || new Date().toISOString().split('T')[0]
  const quantity = parseInt(formData.get('quantity') as string) || 1
  const notes = (formData.get('notes') as string || '').trim()

  if (!model) return { error: 'Model is required.' }
  if (!storage) return { error: 'Storage is required.' }
  if (!grade) return { error: 'Grade is required.' }
  if (closing_price <= 0) return { error: 'Closing price must be greater than $0.' }

  const { error } = await supabase
    .from('att_closing_prices')
    .update({
      model,
      storage,
      grade,
      carrier,
      closing_price,
      auction_date,
      quantity,
      notes: notes || null,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)

  if (error) {
    console.error('Error updating att_closing_price:', error)
    return { error: error.message }
  }

  revalidatePath('/dashboard/analytics')
  return { success: true }
}

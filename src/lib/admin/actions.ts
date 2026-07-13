'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getUserRole() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  
  // Permanent override and auto-fix for Super Admin
  if (user.email === 'muheebzahid@gmail.com') {
    // Upsert to ensure the DB reflects SUPER_ADMIN so the dashboard reads it correctly
    await supabase.from('user_roles')
      .upsert({ user_id: user.id, email: user.email, role: 'SUPER_ADMIN' }, { onConflict: 'user_id' })
    return 'SUPER_ADMIN'
  }

  const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id).single()
  
  if (!data) {
    if (user.email === 'admin@example.com') { // Hardcoded bootstrap
      await supabase.from('user_roles').insert({ user_id: user.id, email: user.email, role: 'SUPER_ADMIN' })
      return 'SUPER_ADMIN'
    }
    // Default new users to SALES
    await supabase.from('user_roles').insert({ user_id: user.id, email: user.email, role: 'SALES' })
    return 'SALES'
  }
  return data.role as 'SUPER_ADMIN' | 'SALES' | 'LOGISTICS' | 'FINANCE'
}

export async function getAllUsers() {
  const supabase = await createClient()
  // Ensure only SUPER_ADMIN can fetch all users
  const role = await getUserRole()
  if (role !== 'SUPER_ADMIN') throw new Error('Unauthorized')

  const { data, error } = await supabase
    .from('user_roles')
    .select('*')
    .order('created_at', { ascending: false })
    
  if (error) throw error
  return data
}

export async function updateUserRole(id: string, newRole: 'SUPER_ADMIN' | 'SALES' | 'LOGISTICS' | 'FINANCE') {
  const supabase = await createClient()
  const role = await getUserRole()
  if (role !== 'SUPER_ADMIN') throw new Error('Unauthorized')

  const { error } = await supabase
    .from('user_roles')
    .update({ role: newRole })
    .eq('id', id)
    
  if (error) throw error
  revalidatePath('/dashboard/admin')
}

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export async function addMember(formData: FormData) {
  const role = await getUserRole()
  if (role !== 'SUPER_ADMIN') return { error: 'Unauthorized' }

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const userRole = formData.get('role') as string

  if (!email || !password || !userRole) return { error: 'Missing fields' }

  // Use Service Role Key to bypass Auth and create user
  const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true // Auto confirm so they can log in immediately
  })

  if (authError) return { error: authError.message }
  if (!authData.user) return { error: 'Failed to create user' }

  // Insert role
  const { error: dbError } = await supabaseAdmin.from('user_roles').insert({
    user_id: authData.user.id,
    email: authData.user.email,
    role: userRole
  })

  if (dbError) return { error: dbError.message }

  revalidatePath('/dashboard/admin')
  return { success: true }
}

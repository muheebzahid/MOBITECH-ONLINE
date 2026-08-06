'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getUserRole() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  
  // Permanent override and auto-fix for approved Super Admin
  if (user.email === 'muheebzahid@gmail.com') {
    // Upsert to ensure the DB reflects SUPER_ADMIN so the dashboard reads it correctly
    await supabase.from('user_roles')
      .upsert({ user_id: user.id, email: user.email, role: 'SUPER_ADMIN' }, { onConflict: 'user_id' })
    return 'SUPER_ADMIN'
  }

  // Fetch role from DB
  const { data: userRole } = await supabase.from('user_roles').select('role').eq('user_id', user.id).single()
  
  if (userRole) {
    return userRole.role as 'SUPER_ADMIN' | 'SALES' | 'LOGISTICS' | 'FINANCE' | 'VIEW_ONLY' | 'DENIED'
  }

  return 'DENIED' as 'SUPER_ADMIN' | 'SALES' | 'LOGISTICS' | 'FINANCE' | 'VIEW_ONLY' | 'DENIED'
}

export async function requireWriteAccess() {
  const role = await getUserRole()
  if (role === 'VIEW_ONLY' || role === 'DENIED' || !role) {
    throw new Error('Unauthorized: View Only mode is active.')
  }
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

export async function updateUserRole(id: string, newRole: 'SUPER_ADMIN' | 'SALES' | 'LOGISTICS' | 'FINANCE' | 'VIEW_ONLY') {
  await requireWriteAccess();

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
  await requireWriteAccess();

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

export async function deleteMember(authUserId: string) {
  await requireWriteAccess();

  const role = await getUserRole()
  if (role !== 'SUPER_ADMIN') return { error: 'Unauthorized' }

  const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const supabase = await createClient()
  const { data: { user: currentUser } } = await supabase.auth.getUser()
  if (currentUser?.id === authUserId) {
    return { error: 'You cannot remove yourself' }
  }

  // Double check it's not the primary admin
  const { data: userRole } = await supabaseAdmin.from('user_roles').select('email').eq('user_id', authUserId).single()
  if (userRole?.email === 'muheebzahid@gmail.com') {
    return { error: 'Cannot remove primary admin account' }
  }

  // 1. Ban the user in Auth to strictly prevent any login without destroying business records
  const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
    ban_duration: '876000h' // 100 years
  })
  if (banError) return { error: banError.message }

  // 2. Safely delete from user_roles to remove them from the ERP dashboard & role assignments
  const { error: dbError } = await supabaseAdmin.from('user_roles').delete().eq('user_id', authUserId)
  if (dbError) {
    // If it fails due to foreign key constraints (they created records), we just leave them banned
    // and maybe update their role to a non-active role if possible, but they are already banned from logging in.
    console.error('Could not delete from user_roles (likely FK constraint). User is banned instead.', dbError)
  }

  revalidatePath('/dashboard/admin')
  return { success: true }
}

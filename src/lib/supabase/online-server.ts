import { createClient } from '@supabase/supabase-js'

export function createOnlineClient() {
  let url = process.env.ONLINE_SUPABASE_URL
  let key = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key || key.includes('dummy')) {
    // Fallback to target local Supabase service role key
    url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
    key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

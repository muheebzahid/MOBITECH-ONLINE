import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // 1. Protect Server Actions globally
  const isServerAction = request.headers.has('next-action')
  const isAuthRoute = request.nextUrl.pathname.startsWith('/auth') || request.nextUrl.pathname.startsWith('/login')

  if (isServerAction && !isAuthRoute) {
    if (!user || user.email !== 'muheebzahid@gmail.com') {
      return new NextResponse(JSON.stringify({ error: 'Unauthorized - SUPER_ADMIN only' }), { 
        status: 403, 
        headers: { 'Content-Type': 'application/json' } 
      })
    }
  }

  // 2. Redirect unauthenticated users to login for protected routes
  // Assuming all routes except /login and /auth are protected
  if (!user && !isAuthRoute) {
    if (request.nextUrl.pathname.startsWith('/api')) {
      return new NextResponse(JSON.stringify({ success: false, error: 'Session expired. Please log in again.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // 3. Redirect authenticated users away from login
  if (user && isAuthRoute && request.nextUrl.pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

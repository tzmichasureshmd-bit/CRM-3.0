import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {
  isWhatsAppApiRequiringSession,
  protectedLoginFor,
} from '@/lib/auth/protected-routes'

/**
 * Next 16 renamed the `middleware` file convention to `proxy` (the
 * convention is deprecated as of v16.0.0 — it still runs, but warns on
 * every build and will be removed). Behaviour is unchanged: this runs
 * on the network boundary before the route renders, and is where
 * session refresh + protected-route redirects happen.
 */
export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error(
      '[PROXY] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Auth proxy is non-functional.',
    )
    return supabaseResponse
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options: cookieOptions }) =>
            supabaseResponse.cookies.set(name, value, cookieOptions)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // getUser() transparently refreshes an expired access token, which
  // ROTATES the refresh token and writes the new cookies onto
  // `supabaseResponse` via setAll() above. Any response we return in
  // place of `supabaseResponse` (every redirect / JSON branch below)
  // is a fresh object that does NOT carry those Set-Cookie headers, so
  // the rotated token never reaches the browser. The next request then
  // replays the old, now-consumed refresh token, the refresh fails, and
  // the session wedges — the user gets a broken reload after idling and
  // can only recover by manually clearing cookies (issue #288). Copy the
  // refreshed cookies onto whatever response we hand back to fix that.
  const withRefreshedCookies = <T extends NextResponse>(response: T): T => {
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie)
    })
    return response
  }

  // Server actions are POST requests with the Next-Action header.
  // They must never be redirected — a redirect would prevent the
  // server action from executing (e.g. verifySuperAdminRole after
  // signInWithPassword on /super-admin/login).
  const isServerAction = request.method === 'POST' && request.headers.has('Next-Action');

  // Auth pages - redirect to dashboard if already logged in.
  // Exception: when an invite token is in the query string we
  // send the already-signed-in user to /join/<token> instead so
  // they can accept the invitation in one click. Without this,
  // a forwarded invite link to someone who's already signed in
  // would silently drop them on /dashboard.
  if (user && !isServerAction && (
    request.nextUrl.pathname === '/login' ||
    request.nextUrl.pathname === '/signup' ||
    request.nextUrl.pathname === '/forgot-password'
  )) {
    const url = request.nextUrl.clone()
    const inviteToken = request.nextUrl.searchParams.get('invite')
    if (
      inviteToken &&
      (request.nextUrl.pathname === '/login' ||
        request.nextUrl.pathname === '/signup')
    ) {
      url.pathname = `/join/${encodeURIComponent(inviteToken)}`
      url.search = ''
    } else {
      url.pathname = '/dashboard'
      url.search = ''
    }
    return withRefreshedCookies(NextResponse.redirect(url))
  }

  // Super admin login page — redirect to /super-admin if already logged in
  // (skip for server actions — they must reach their handler)
  if (user && !isServerAction && request.nextUrl.pathname === '/super-admin/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/super-admin'
    url.search = ''
    return withRefreshedCookies(NextResponse.redirect(url))
  }

  // Protected pages - redirect to login if not authenticated.
  //
  // The route inventory lives in @/lib/auth/protected-routes so the
  // proxy and its drift-guard test read the same list. `/admin/*`
  // and `/super-admin/*` are separate consoles; each bounces to its own
  // login page, and both login pages stay reachable while logged out.
  if (!user) {
    const loginPath = protectedLoginFor(request.nextUrl.pathname)
    if (loginPath) {
      const url = request.nextUrl.clone()
      url.pathname = loginPath
      url.search = ''
      return withRefreshedCookies(NextResponse.redirect(url))
    }
  }

  // API routes that need auth. The webhook and the cron scheduler are
  // called by Meta / the scheduler with their own credentials, so they
  // are exempt — the cron path used to be caught by the old
  // `.includes('/webhook')` check, which made it unreachable in
  // practice: the proxy rejected it with 401 before the handler could
  // ever compare `x-cron-secret`.
  if (!user && isWhatsAppApiRequiringSession(request.nextUrl.pathname)) {
    return withRefreshedCookies(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )
  }

  // Super admin API routes — require authenticated user
  // (actual super_admin check happens in the route handler via requireSuperAdmin)
  if (request.nextUrl.pathname.startsWith('/api/admin/') && !user) {
    return withRefreshedCookies(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

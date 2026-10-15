import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let browserClient: SupabaseClient | undefined

export function createClient() {
  if (browserClient) return browserClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    console.error(
      '[SUPABASE] Missing environment variables. Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in your deployment environment.',
    )
    throw new Error(
      'Supabase is not configured. Please contact the administrator.',
    )
  }

  browserClient = createBrowserClient(url, key)

  return browserClient
}

/**
 * Pre-flight check: verify the Supabase auth endpoint is reachable and
 * returning JSON (not an HTML error/paused-project page).
 *
 * Call this BEFORE signInWithPassword to give users a specific,
 * actionable error instead of the opaque "unexpected response" from
 * supabase-js.
 */
export async function checkSupabaseConnection(): Promise<{
  ok: boolean
  reason?: 'missing_config' | 'paused_project' | 'network_error' | 'wrong_url'
}> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    return { ok: false, reason: 'missing_config' }
  }

  try {
    const res = await fetch(`${url}/auth/v1/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
      },
      body: JSON.stringify({ grant_type: 'password', email: 'x@x', password: 'x' }),
      signal: AbortSignal.timeout(10_000),
    })

    const text = await res.text()
    const isHtml =
      text.trimStart().startsWith('<!') ||
      text.trimStart().startsWith('<html') ||
      text.includes('This project is paused') ||
      text.includes('project has been paused')

    if (isHtml) {
      console.error(
        '[SUPABASE] Auth endpoint returned HTML instead of JSON. The Supabase project may be paused.',
      )
      return { ok: false, reason: 'paused_project' }
    }

    return { ok: true }
  } catch (err) {
    console.error('[SUPABASE] Connection check failed:', err)
    return { ok: false, reason: 'network_error' }
  }
}

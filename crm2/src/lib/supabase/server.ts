import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`[SUPABASE] Missing required environment variable: ${name}`)
    throw new Error(`Server configuration error: ${name} is not set.`)
  }
  return value
}

export async function createClient() {
  const cookieStore = await cookies()

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
  const supabaseKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have proxy refreshing sessions.
        }
      },
    },
  })
}

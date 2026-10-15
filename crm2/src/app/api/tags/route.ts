import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

// GET /api/tags — list the account's tag catalog. Used by the flows
// builder (condition/set_tag nodes) and other pickers that previously
// hit a missing endpoint and silently fell back to raw UUID input.
// RLS (tags_select) scopes the read to the caller's account.

export async function GET() {
  try {
    const { supabase } = await getCurrentAccount()
    const { data, error } = await supabase
      .from('tags')
      .select('id, name, color')
      .order('name', { ascending: true })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ tags: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

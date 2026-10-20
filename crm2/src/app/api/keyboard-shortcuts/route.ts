import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

export async function GET() {
  try {
    const { supabase, userId } = await getCurrentAccount()

    const { data, error } = await supabase
      .from('keyboard_shortcuts')
      .select('*')
      .eq('user_id', userId)
      .order('shortcut_key', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ shortcuts: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, userId } = await getCurrentAccount()

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const { shortcuts } = body
    if (!Array.isArray(shortcuts) || shortcuts.length === 0) {
      return NextResponse.json(
        { error: 'shortcuts must be a non-empty array' },
        { status: 400 },
      )
    }

    const rows = shortcuts.map(
      (s: { shortcut_key: string; action: string; label?: string }) => ({
        user_id: userId,
        shortcut_key: s.shortcut_key,
        action: s.action,
        label: s.label ?? null,
      }),
    )

    const { data, error } = await supabase
      .from('keyboard_shortcuts')
      .upsert(rows, { onConflict: 'user_id,shortcut_key' })
      .select()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ shortcuts: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

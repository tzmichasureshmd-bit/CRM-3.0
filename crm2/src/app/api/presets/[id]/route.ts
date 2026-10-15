import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const ctx = await getCurrentAccount()

    const { data, error } = await ctx.supabase
      .from('preset_campaigns')
      .select('*')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle()

    if (error) {
      console.error('Failed to fetch preset:', error)
      return NextResponse.json({ error: 'Failed to fetch preset' }, { status: 500 })
    }
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ preset: data })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const ctx = await requireRole('admin')

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const update: Record<string, unknown> = {}
    for (const k of [
      'name', 'category', 'description', 'template_name', 'template_language',
      'audience_filter', 'template_variables', 'header_media_url', 'is_active',
    ] as const) {
      if (k in body) update[k] = body[k]
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    update.updated_at = new Date().toISOString()

    const { data, error } = await ctx.supabase
      .from('preset_campaigns')
      .update(update)
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .select('*')
      .maybeSingle()

    if (error) {
      console.error('Failed to update preset:', error)
      return NextResponse.json({ error: 'Failed to update preset' }, { status: 500 })
    }
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ preset: data })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const ctx = await requireRole('admin')

    const { error } = await ctx.supabase
      .from('preset_campaigns')
      .delete()
      .eq('id', id)
      .eq('account_id', ctx.accountId)

    if (error) {
      console.error('Failed to delete preset:', error)
      return NextResponse.json({ error: 'Failed to delete preset' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}

import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'

const STATUSES = [
  'scheduled',
  'confirmed',
  'rescheduled',
  'cancelled',
  'completed',
  'no_show',
] as const

const TYPES = ['consultation', 'demo', 'follow_up', 'site_visit', 'other'] as const

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const ctx = await getCurrentAccount()

    const { data, error } = await ctx.supabase
      .from('appointments')
      .select('*')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle()

    if (error) {
      console.error('Failed to fetch appointment:', error)
      return NextResponse.json({ error: 'Failed to fetch appointment' }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ appointment: data })
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
    const ctx = await getCurrentAccount()

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const update: Record<string, unknown> = {}
    for (const k of [
      'title',
      'description',
      'service',
      'contact_id',
      'conversation_id',
      'agent_id',
      'appointment_date',
      'appointment_time',
      'duration_minutes',
      'notes',
      'appointment_type',
    ] as const) {
      if (k in body) update[k] = body[k]
    }

    if ('status' in body) {
      const status = body.status
      if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      update.status = status
      if (status === 'completed') update.completed_at = new Date().toISOString()
      if (status === 'cancelled') update.cancelled_at = new Date().toISOString()
    }

    if ('appointment_type' in body) {
      const type = body.appointment_type
      if (!TYPES.includes(type as (typeof TYPES)[number])) {
        return NextResponse.json({ error: 'Invalid appointment_type' }, { status: 400 })
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    update.updated_at = new Date().toISOString()

    const { data, error } = await ctx.supabase
      .from('appointments')
      .update(update)
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .select('*')
      .maybeSingle()

    if (error) {
      console.error('Failed to update appointment:', error)
      return NextResponse.json({ error: 'Failed to update appointment' }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ appointment: data })
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
      .from('appointments')
      .delete()
      .eq('id', id)
      .eq('account_id', ctx.accountId)

    if (error) {
      console.error('Failed to delete appointment:', error)
      return NextResponse.json({ error: 'Failed to delete appointment' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}

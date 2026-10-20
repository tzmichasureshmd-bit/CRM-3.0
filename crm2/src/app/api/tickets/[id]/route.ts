import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'
import type { TicketStatus } from '@/types'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const ctx = await getCurrentAccount()

    const { data, error } = await ctx.supabase
      .from('tickets')
      .select('*, ticket_comments(*)')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle()

    if (error) {
      console.error('Failed to fetch ticket:', error)
      return NextResponse.json({ error: 'Failed to fetch ticket' }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ ticket: data })
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
      'subject',
      'description',
      'status',
      'priority',
      'assigned_agent_id',
      'contact_id',
      'category',
    ] as const) {
      if (k in body) update[k] = body[k]
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    if (typeof update.status === 'string') {
      const newStatus = update.status as TicketStatus
      if (newStatus === 'resolved') {
        update.resolved_at = new Date().toISOString()
        update.closed_at = null
      } else if (newStatus === 'closed') {
        update.closed_at = new Date().toISOString()
        update.resolved_at = null
      } else {
        update.resolved_at = null
        update.closed_at = null
      }
    }

    if (typeof update.assigned_agent_id === 'string' && !update.assigned_agent_id) {
      update.assigned_agent_id = null
    }

    update.updated_at = new Date().toISOString()

    const { data, error } = await ctx.supabase
      .from('tickets')
      .update(update)
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .select('*')
      .maybeSingle()

    if (error) {
      console.error('Failed to update ticket:', error)
      return NextResponse.json({ error: 'Failed to update ticket' }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ ticket: data })
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
      .from('tickets')
      .delete()
      .eq('id', id)
      .eq('account_id', ctx.accountId)

    if (error) {
      console.error('Failed to delete ticket:', error)
      return NextResponse.json({ error: 'Failed to delete ticket' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}

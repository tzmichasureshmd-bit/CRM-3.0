import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

// Real `appointments` schema (see migration 051 / 068):
//   account_id, contact_id, conversation_id, agent_id, title, description,
//   service, appointment_date (DATE), appointment_time (TIME),
//   duration_minutes, status, notes, appointment_type, created_by
// The dashboard UI writes through Supabase directly, so these routes exist
// for API clients; they must mirror the table exactly.

const STATUSES = [
  'scheduled',
  'confirmed',
  'rescheduled',
  'cancelled',
  'completed',
  'no_show',
] as const

const TYPES = ['consultation', 'demo', 'follow_up', 'site_visit', 'other'] as const

export async function GET(request: NextRequest) {
  try {
    const ctx = await getCurrentAccount()

    const { searchParams } = request.nextUrl
    const status = searchParams.get('status')
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')

    let query = ctx.supabase
      .from('appointments')
      .select('*')
      .eq('account_id', ctx.accountId)
      .order('appointment_date', { ascending: true })
      .order('appointment_time', { ascending: true })

    if (status) {
      query = query.eq('status', status)
    }
    if (dateFrom) {
      query = query.gte('appointment_date', dateFrom)
    }
    if (dateTo) {
      query = query.lte('appointment_date', dateTo)
    }

    const { data, error } = await query

    if (error) {
      console.error('Failed to fetch appointments:', error)
      return NextResponse.json({ error: 'Failed to fetch appointments' }, { status: 500 })
    }

    return NextResponse.json({ appointments: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getCurrentAccount()

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const {
      contact_id,
      conversation_id,
      agent_id,
      title,
      description,
      service,
      appointment_date,
      appointment_time,
      duration_minutes,
      notes,
      appointment_type,
      status,
    } = body

    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'title is required' }, { status: 400 })
    }
    if (!appointment_date || typeof appointment_date !== 'string') {
      return NextResponse.json({ error: 'appointment_date is required' }, { status: 400 })
    }
    if (!appointment_time || typeof appointment_time !== 'string') {
      return NextResponse.json({ error: 'appointment_time is required' }, { status: 400 })
    }
    if (status !== undefined && !STATUSES.includes(status as (typeof STATUSES)[number])) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    if (
      appointment_type !== undefined &&
      !TYPES.includes(appointment_type as (typeof TYPES)[number])
    ) {
      return NextResponse.json({ error: 'Invalid appointment_type' }, { status: 400 })
    }

    const { data, error } = await ctx.supabase
      .from('appointments')
      .insert({
        account_id: ctx.accountId,
        created_by: ctx.userId,
        agent_id: typeof agent_id === 'string' ? agent_id : null,
        contact_id: typeof contact_id === 'string' ? contact_id : null,
        conversation_id: typeof conversation_id === 'string' ? conversation_id : null,
        title: title.trim(),
        description: typeof description === 'string' ? description.trim() || null : null,
        service: typeof service === 'string' ? service.trim() || null : null,
        appointment_date,
        appointment_time,
        duration_minutes: typeof duration_minutes === 'number' ? duration_minutes : 30,
        notes: typeof notes === 'string' ? notes.trim() || null : null,
        appointment_type:
          typeof appointment_type === 'string' ? appointment_type : 'consultation',
        status: typeof status === 'string' ? status : 'scheduled',
      })
      .select('*')
      .single()

    if (error) {
      console.error('Failed to create appointment:', error)
      return NextResponse.json({ error: 'Failed to create appointment' }, { status: 500 })
    }

    return NextResponse.json({ appointment: data }, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}

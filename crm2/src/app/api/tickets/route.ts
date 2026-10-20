import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

export async function GET(request: NextRequest) {
  try {
    const ctx = await getCurrentAccount()

    const { searchParams } = request.nextUrl
    const status = searchParams.get('status')
    const priority = searchParams.get('priority')
    const category = searchParams.get('category')
    const q = searchParams.get('q')
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '25', 10) || 25))
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = ctx.supabase
      .from('tickets')
      .select('*', { count: 'exact' })
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }
    if (priority) {
      query = query.eq('priority', priority)
    }
    if (category) {
      query = query.eq('category', category)
    }
    if (q) {
      query = query.or(`subject.ilike.%${q}%,description.ilike.%${q}%`)
    }

    query = query.range(from, to)

    const { data, error, count } = await query

    if (error) {
      console.error('Failed to fetch tickets:', error)
      return NextResponse.json({ error: 'Failed to fetch tickets' }, { status: 500 })
    }

    return NextResponse.json({
      tickets: data ?? [],
      total: count ?? 0,
      page,
      pageSize,
    })
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

    const { subject, description, contact_id, priority, assigned_agent_id, category } = body

    if (!subject || typeof subject !== 'string') {
      return NextResponse.json({ error: 'subject is required' }, { status: 400 })
    }

    const { data: nextNumber, error: rpcError } = await ctx.supabase
      .rpc('next_ticket_number', { p_account_id: ctx.accountId })

    if (rpcError) {
      console.error('Failed to get next ticket number:', rpcError)
      return NextResponse.json({ error: 'Failed to generate ticket number' }, { status: 500 })
    }

    const insertPayload: Record<string, unknown> = {
      account_id: ctx.accountId,
      created_by: ctx.userId,
      contact_id: contact_id || null,
      subject: subject.trim(),
      description: typeof description === 'string' ? description.trim() || null : null,
      ticket_number: nextNumber as number,
      priority: typeof priority === 'string' ? priority : 'medium',
      category: typeof category === 'string' ? category : 'general',
      assigned_agent_id: typeof assigned_agent_id === 'string' && assigned_agent_id ? assigned_agent_id : null,
      status: 'open',
    }

    const { data, error } = await ctx.supabase
      .from('tickets')
      .insert(insertPayload)
      .select('*')
      .single()

    if (error) {
      console.error('Failed to create ticket:', error)
      return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 })
    }

    return NextResponse.json({ ticket: data }, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}

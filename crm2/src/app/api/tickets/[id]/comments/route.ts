import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const ctx = await getCurrentAccount()

    // Verify the ticket belongs to this account
    const { data: ticket } = await ctx.supabase
      .from('tickets')
      .select('id')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle()

    if (!ticket) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const { data, error } = await ctx.supabase
      .from('ticket_comments')
      .select('*')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Failed to fetch comments:', error)
      return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 })
    }

    return NextResponse.json({ comments: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const ctx = await getCurrentAccount()

    // Verify the ticket belongs to this account
    const { data: ticket } = await ctx.supabase
      .from('tickets')
      .select('id')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle()

    if (!ticket) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { body: commentBody, content: rawContent, is_internal } = body
    const commentText = typeof rawContent === 'string' ? rawContent : typeof commentBody === 'string' ? commentBody : ''

    if (!commentText) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 })
    }

    const { data, error } = await ctx.supabase
      .from('ticket_comments')
      .insert({
        account_id: ctx.accountId,
        ticket_id: id,
        user_id: ctx.userId,
        content: commentText.trim(),
        is_internal: is_internal === true,
      })
      .select('*')
      .single()

    if (error) {
      console.error('Failed to create comment:', error)
      return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 })
    }

    return NextResponse.json({ comment: data }, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}

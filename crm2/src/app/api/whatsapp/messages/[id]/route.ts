import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

type Params = { params: Promise<{ id: string }> }

/**
 * PATCH /api/whatsapp/messages/[id]
 *
 * Soft-delete or star/unstar a message. Only agent-sent messages can be
 * soft-deleted (customer messages can't be removed from the thread for
 * audit integrity). Star toggle works on any message in the caller's
 * account.
 *
 * Body: { deleted?: boolean, is_starred?: boolean }
 *   - deleted: true  → set deleted_at = now()
 *   - deleted: false → clear deleted_at (un-delete)
 *   - is_starred: true/false → toggle bookmark
 */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { supabase, accountId } = await getCurrentAccount()
    const { id } = await params

    const body = await request.json().catch(() => ({}))

    const updates: Record<string, unknown> = {}

    if (typeof body.deleted === 'boolean') {
      updates.deleted_at = body.deleted ? new Date().toISOString() : null
    }

    if (typeof body.is_starred === 'boolean') {
      updates.is_starred = body.is_starred
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update (deleted, is_starred)' },
        { status: 400 }
      )
    }

    const { data: msg, error: lookupErr } = await supabase
      .from('messages')
      .select('sender_type, conversation_id, conversations!inner(account_id)')
      .eq('id', id)
      .single()

    if (lookupErr || !msg) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    // Verify the message belongs to the caller's account.
    const convAccountId = (msg.conversations as unknown as { account_id?: string })?.account_id
    if (convAccountId !== accountId) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    // Soft-delete: only allow deleting agent/bot-sent messages.
    if (body.deleted === true) {
      if (msg.sender_type !== 'agent' && msg.sender_type !== 'bot') {
        return NextResponse.json(
          { error: 'Only agent-sent messages can be deleted' },
          { status: 403 }
        )
      }
    }

    const { data, error } = await supabase
      .from('messages')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ message: data })
  } catch (err) {
    return toErrorResponse(err)
  }
}

import { NextResponse } from 'next/server'
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'

export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount()

    const { data: wallet, error: walletErr } = await supabase
      .from('wallets')
      .select('id')
      .eq('account_id', accountId)
      .single()

    if (walletErr || !wallet) {
      return NextResponse.json(
        { error: walletErr?.message ?? 'Wallet not found' },
        { status: 404 },
      )
    }

    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('wallet_id', wallet.id)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ transactions: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    // Crediting a wallet is a billing action, not a self-service one.
    // `getCurrentAccount()` accepted every member including `viewer`,
    // and `update_wallet_balance` is SECURITY DEFINER with no role
    // check of its own, so RLS could not backstop this route. A
    // read-only user could otherwise inflate the balance that gates
    // AI, voice and campaign usage.
    const { supabase, accountId, userId } = await requireRole('admin')

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const { amount_cents, description } = body
    if (typeof amount_cents !== 'number' || amount_cents <= 0) {
      return NextResponse.json(
        { error: 'amount_cents must be a positive number' },
        { status: 400 },
      )
    }

    const { data: wallet, error: walletErr } = await supabase
      .from('wallets')
      .select('id')
      .eq('account_id', accountId)
      .single()

    if (walletErr || !wallet) {
      return NextResponse.json(
        { error: walletErr?.message ?? 'Wallet not found' },
        { status: 404 },
      )
    }

    const { data, error } = await supabase.rpc('update_wallet_balance', {
      p_wallet_id: wallet.id,
      p_amount_cents: amount_cents,
      p_type: 'credit_purchase',
      p_description: description ?? 'Funds added',
      p_reference_type: null,
      p_reference_id: null,
      p_created_by: userId,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ transaction: data }, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}

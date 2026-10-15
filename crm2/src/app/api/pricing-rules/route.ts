import { NextResponse } from 'next/server'
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'

export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount()

    const { data, error } = await supabase
      .from('pricing_rules')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ pricing_rules: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin')
    const { supabase, accountId } = ctx

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const { id, name, type, config, is_active } = body
    if (!name || !type) {
      return NextResponse.json(
        { error: 'name and type are required' },
        { status: 400 },
      )
    }

    const rule = {
      account_id: accountId,
      name,
      type,
      config: config ?? {},
      is_active: is_active ?? true,
    }

    let result

    if (id) {
      const { data, error } = await supabase
        .from('pricing_rules')
        .update(rule)
        .eq('id', id)
        .eq('account_id', accountId)
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      result = data
    } else {
      const { data, error } = await supabase
        .from('pricing_rules')
        .insert(rule)
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      result = data
    }

    return NextResponse.json({ pricing_rule: result }, { status: id ? 200 : 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}

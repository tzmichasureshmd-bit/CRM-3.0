import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'

export async function GET(request: NextRequest) {
  try {
    const ctx = await getCurrentAccount()
    const { searchParams } = request.nextUrl
    const category = searchParams.get('category')
    const q = searchParams.get('q')
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '50', 10) || 50))
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = ctx.supabase
      .from('preset_campaigns')
      .select('*', { count: 'exact' })
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false })

    if (category) query = query.eq('category', category)
    if (q) query = query.ilike('name', `%${q}%`)
    query = query.range(from, to)

    const { data, error, count } = await query
    if (error) {
      console.error('Failed to fetch presets:', error)
      return NextResponse.json({ error: 'Failed to fetch presets' }, { status: 500 })
    }

    return NextResponse.json({ presets: data ?? [], total: count ?? 0, page, pageSize })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRole('admin')

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { name, category, description, template_name, template_language, audience_filter, template_variables, header_media_url } = body
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (!template_name || typeof template_name !== 'string') {
      return NextResponse.json({ error: 'template_name is required' }, { status: 400 })
    }

    const { data, error } = await ctx.supabase
      .from('preset_campaigns')
      .insert({
        account_id: ctx.accountId,
        created_by: ctx.userId,
        name: name.trim(),
        category: typeof category === 'string' ? category : 'general',
        description: typeof description === 'string' ? description.trim() || null : null,
        template_name: template_name.trim(),
        template_language: typeof template_language === 'string' ? template_language : 'en_US',
        audience_filter: (typeof audience_filter === 'object' && audience_filter !== null ? audience_filter : {}) as Record<string, unknown>,
        template_variables: (typeof template_variables === 'object' && template_variables !== null ? template_variables : {}) as Record<string, unknown>,
        header_media_url: typeof header_media_url === 'string' ? header_media_url : null,
      })
      .select('*')
      .single()

    if (error) {
      console.error('Failed to create preset:', error)
      return NextResponse.json({ error: 'Failed to create preset' }, { status: 500 })
    }

    return NextResponse.json({ preset: data }, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}

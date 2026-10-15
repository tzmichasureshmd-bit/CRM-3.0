import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/account'
import { encrypt } from '@/lib/whatsapp/encryption'
import { getMe, setWebhook, TelegramApiError } from '@/lib/telegram/telegram-api'

export const dynamic = 'force-dynamic'

/**
 * POST /api/telegram/connect
 * Body: { bot_token: string }
 *
 * Validates the bot token with Telegram, registers the webhook,
 * stores the encrypted token in telegram_bots.
 * Never returns the token to the frontend.
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin')

    const body = await request.json()
    const rawToken = (body.bot_token as string | undefined)?.trim()
    if (!rawToken) {
      return NextResponse.json({ error: 'bot_token is required' }, { status: 400 })
    }

    // Basic format check: should look like 123456789:ABCdef...
    if (!/^\d+:[A-Za-z0-9_-]{35,}$/.test(rawToken)) {
      return NextResponse.json(
        { error: 'Invalid bot token format. Get it from @BotFather on Telegram.' },
        { status: 400 },
      )
    }

    // 1. Validate token with Telegram
    let botInfo
    try {
      botInfo = await getMe(rawToken)
    } catch (err) {
      const msg = err instanceof TelegramApiError ? err.description ?? err.message : 'Invalid bot token'
      return NextResponse.json({ error: `Telegram rejected the token: ${msg}` }, { status: 400 })
    }

    if (!botInfo.is_bot) {
      return NextResponse.json({ error: 'The provided token is not a bot token.' }, { status: 400 })
    }

    // 2. Determine webhook URL
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
    if (!siteUrl) {
      return NextResponse.json(
        { error: 'NEXT_PUBLIC_SITE_URL is not configured. Set it to your production URL.' },
        { status: 500 },
      )
    }
    const webhookUrl = `${siteUrl.replace(/\/+$/, '')}/api/telegram/webhook`

    // 3. Generate a secret token for webhook verification (stored encrypted)
    const crypto = await import('node:crypto')
    const secretToken = crypto.randomBytes(32).toString('hex')

    // 4. Register webhook with Telegram
    try {
      await setWebhook({ botToken: rawToken, url: webhookUrl, secretToken })
    } catch (err) {
      const msg = err instanceof TelegramApiError ? err.description ?? err.message : String(err)
      return NextResponse.json({ error: `Failed to register webhook: ${msg}` }, { status: 502 })
    }

    // 5. Encrypt and store
    const encryptedToken = encrypt(rawToken)
    const encryptedSecret = encrypt(secretToken)

    const { supabase } = ctx
    const { error: upsertError } = await supabase
      .from('telegram_bots')
      .upsert(
        {
          account_id: ctx.accountId,
          user_id: ctx.userId,
          bot_token: encryptedToken,
          bot_id: botInfo.id,
          bot_username: botInfo.username ?? null,
          bot_name: botInfo.first_name,
          status: 'connected',
          webhook_url: webhookUrl,
          webhook_set_at: new Date().toISOString(),
          // Store encrypted webhook secret in dedicated column (migration 073)
          webhook_secret: encryptedSecret,
          last_error: null,
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'account_id' },
      )

    if (upsertError) {
      console.error('[telegram/connect] upsert error:', upsertError.message)
      return NextResponse.json({ error: 'Failed to save bot configuration.' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      bot: {
        id: botInfo.id,
        username: botInfo.username,
        name: botInfo.first_name,
        webhookUrl,
      },
    })
  } catch (err) {
    console.error('[telegram/connect] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/telegram/connect
 * Disconnects the Telegram bot: removes webhook from Telegram, marks disconnected.
 */
export async function DELETE() {
  try {
    const ctx = await requireRole('admin')

    const { data: bot } = await ctx.supabase
      .from('telegram_bots')
      .select('bot_token')
      .eq('account_id', ctx.accountId)
      .maybeSingle()

    if (bot?.bot_token) {
      try {
        const { decrypt } = await import('@/lib/whatsapp/encryption')
        const { deleteWebhook } = await import('@/lib/telegram/telegram-api')
        const token = decrypt(bot.bot_token as string)
        await deleteWebhook(token)
      } catch {
        // Best-effort — still mark disconnected
      }
    }

    await ctx.supabase
      .from('telegram_bots')
      .update({ status: 'disconnected', updated_at: new Date().toISOString() })
      .eq('account_id', ctx.accountId)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[telegram/connect] DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * GET /api/telegram/connect
 * Returns current bot status (no token exposed).
 */
export async function GET() {
  try {
    const ctx = await requireRole('viewer')

    const { data: bot } = await ctx.supabase
      .from('telegram_bots')
      .select('id, bot_id, bot_username, bot_name, status, webhook_url, webhook_set_at, last_webhook_at, last_inbound_at, connected_at')
      .eq('account_id', ctx.accountId)
      .maybeSingle()

    return NextResponse.json({ bot: bot ?? null })
  } catch (err) {
    console.error('[telegram/connect] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

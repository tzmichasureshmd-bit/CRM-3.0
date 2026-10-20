import { NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decrypt } from '@/lib/whatsapp/encryption'
import { processTelegramUpdate } from '@/lib/telegram/telegram-processor'
import type { TelegramUpdate } from '@/lib/telegram/telegram-api'
import crypto from 'node:crypto'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface TelegramBotRow {
  id: string
  account_id: string
  user_id: string
  bot_token: string
  bot_id: number | null
  bot_username: string | null
  webhook_secret: string | null
}

// Lazy admin client
let _admin: ReturnType<typeof createClient> | null = null
function supabaseAdmin(): ReturnType<typeof createClient> {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
  }
  return _admin
}

/**
 * POST /api/telegram/webhook
 *
 * Receives Telegram Bot API updates.
 * Telegram sends a X-Telegram-Bot-Api-Secret-Token header when a secret
 * was set during setWebhook — we verify it to prevent spoofed requests.
 *
 * Acks immediately (200) and processes in after() to stay within
 * Telegram's 60s timeout without blocking.
 */
export async function POST(request: Request) {
  const rawBody = await request.text()
  const secretHeader = request.headers.get('x-telegram-bot-api-secret-token')

  let update: TelegramUpdate
  try {
    update = JSON.parse(rawBody) as TelegramUpdate
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // We need to identify which bot this update belongs to.
  // Telegram doesn't send the bot id in the update body for webhook calls,
  // but we can identify it by the secret token header.
  // Fetch all connected bots and match by secret.
  const admin = supabaseAdmin()
  const { data: bots, error: botsError } = await admin
    .from('telegram_bots' as string)
    .select('*')
    .eq('status', 'connected') as unknown as { data: TelegramBotRow[] | null; error: unknown }

  if (botsError || !bots || bots.length === 0) {
    // No connected bots — ack anyway so Telegram doesn't retry
    return NextResponse.json({ status: 'no_bots' })
  }

  // Find the matching bot by verifying the secret token
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let matchedBot: any = null

  if (secretHeader) {
    for (const bot of bots) {
      // The encrypted secret is stored in the dedicated webhook_secret column
      const encryptedSecret = bot.webhook_secret as string | null
      if (!encryptedSecret) continue
      try {
        const storedSecret = decrypt(encryptedSecret)
        const a = Buffer.from(secretHeader)
        const b = Buffer.from(storedSecret)
        // timingSafeEqual requires equal-length buffers — if lengths differ
        // the secrets can't match, skip without throwing.
        if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
          matchedBot = bot
          break
        }
      } catch {
        // Decryption failed — skip
      }
    }
  }

  // NOTE: there is deliberately NO "single connected bot" fallback here.
  // `processTelegramUpdate` writes contacts/conversations/messages with
  // the service-role client and then fires the automation engine, so
  // accepting an update we could not authenticate would let anyone who
  // can reach this public endpoint inject inbound traffic into the
  // tenant and drive automations. A bot whose webhook_secret is missing
  // or unreadable must be re-connected from the UI, not silently trusted.

  if (!matchedBot) {
    // Could not identify bot — ack to prevent Telegram retries
    console.warn('[telegram/webhook] could not match bot for update', update.update_id)
    return NextResponse.json({ status: 'unmatched' })
  }

  // Update last_webhook_at diagnostics
  void (admin as unknown as { from: (t: string) => { update: (v: Record<string, unknown>) => { eq: (c: string, v: unknown) => Promise<unknown> } } })
    .from('telegram_bots')
    .update({ last_webhook_at: new Date().toISOString() })
    .eq('id', matchedBot.id)
    .then(() => { /* diagnostics */ })

  // Process after acking so Telegram doesn't retry on slow processing
  after(async () => {
    try {
      await processTelegramUpdate(update, matchedBot)
    } catch (err) {
      console.error('[telegram/webhook] processing error:', err instanceof Error ? err.message : err)
    }
  })

  return NextResponse.json({ status: 'ok' })
}

/**
 * GET /api/telegram/webhook
 * Health check — Telegram doesn't use GET for webhooks but useful for debugging.
 */
export async function GET() {
  return NextResponse.json({ status: 'telegram webhook active' })
}

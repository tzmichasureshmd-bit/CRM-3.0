/**
 * Telegram Bot API client.
 * Official API only: https://core.telegram.org/bots/api
 * No unofficial APIs, no scraping, no browser automation.
 * Bot token is always decrypted server-side, never sent to frontend.
 */

const TELEGRAM_API_BASE = 'https://api.telegram.org'

export class TelegramApiError extends Error {
  readonly code: number | null
  readonly description: string | null
  readonly operation: string

  constructor(opts: {
    code?: number | null
    description?: string | null
    message: string
    operation: string
  }) {
    super(`${opts.operation}: ${opts.message}`)
    this.code = opts.code ?? null
    this.description = opts.description ?? null
    this.operation = opts.operation
    this.name = 'TelegramApiError'
  }
}

interface TelegramResponse<T> {
  ok: boolean
  result?: T
  error_code?: number
  description?: string
}

async function call<T>(
  botToken: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const url = `${TELEGRAM_API_BASE}/bot${botToken}/${method}`
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = (await res.json()) as TelegramResponse<T>
  if (!data.ok) {
    throw new TelegramApiError({
      code: data.error_code ?? null,
      description: data.description ?? null,
      message: data.description ?? `Telegram API error (HTTP ${res.status})`,
      operation: method,
    })
  }
  return data.result as T
}

// ── Bot identity ──────────────────────────────────────────────

export interface TelegramBotInfo {
  id: number
  is_bot: boolean
  first_name: string
  username?: string
}

export async function getMe(botToken: string): Promise<TelegramBotInfo> {
  return call<TelegramBotInfo>(botToken, 'getMe')
}

// ── Webhook ───────────────────────────────────────────────────

export interface SetWebhookArgs {
  botToken: string
  url: string
  secretToken?: string
}

export async function setWebhook(args: SetWebhookArgs): Promise<void> {
  const { botToken, url, secretToken } = args
  await call<boolean>(botToken, 'setWebhook', {
    url,
    allowed_updates: ['message'],
    drop_pending_updates: false,
    ...(secretToken ? { secret_token: secretToken } : {}),
  })
}

export async function deleteWebhook(botToken: string): Promise<void> {
  await call<boolean>(botToken, 'deleteWebhook', { drop_pending_updates: false })
}

export interface WebhookInfo {
  url: string
  has_custom_certificate: boolean
  pending_update_count: number
  last_error_date?: number
  last_error_message?: string
}

export async function getWebhookInfo(botToken: string): Promise<WebhookInfo> {
  return call<WebhookInfo>(botToken, 'getWebhookInfo')
}

// ── Message types ─────────────────────────────────────────────

export interface TelegramUser {
  id: number
  is_bot: boolean
  first_name: string
  last_name?: string
  username?: string
}

export interface TelegramChat {
  id: number
  type: 'private' | 'group' | 'supergroup' | 'channel'
  first_name?: string
  last_name?: string
  username?: string
  title?: string
}

export interface TelegramPhotoSize {
  file_id: string
  file_unique_id: string
  width: number
  height: number
  file_size?: number
}

export interface TelegramDocument {
  file_id: string
  file_unique_id: string
  file_name?: string
  mime_type?: string
  file_size?: number
}

export interface TelegramAudio {
  file_id: string
  file_unique_id: string
  duration: number
  mime_type?: string
}

export interface TelegramVideo {
  file_id: string
  file_unique_id: string
  width: number
  height: number
  duration: number
  mime_type?: string
}

export interface TelegramVoice {
  file_id: string
  file_unique_id: string
  duration: number
  mime_type?: string
}

export interface TelegramLocation {
  longitude: number
  latitude: number
}

export interface TelegramMessage {
  message_id: number
  from?: TelegramUser
  chat: TelegramChat
  date: number
  text?: string
  caption?: string
  photo?: TelegramPhotoSize[]
  document?: TelegramDocument
  audio?: TelegramAudio
  video?: TelegramVideo
  voice?: TelegramVoice
  location?: TelegramLocation
  sticker?: { file_id: string; file_unique_id: string }
  reply_to_message?: TelegramMessage
}

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  edited_message?: TelegramMessage
}

// ── Sending ───────────────────────────────────────────────────

export async function sendText(args: {
  botToken: string
  chatId: number | string
  text: string
  replyToMessageId?: number
}): Promise<TelegramMessage> {
  const { botToken, chatId, text, replyToMessageId } = args
  return call<TelegramMessage>(botToken, 'sendMessage', {
    chat_id: chatId,
    text,
    ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
  })
}

export async function sendPhoto(args: {
  botToken: string
  chatId: number | string
  photoUrl: string
  caption?: string
}): Promise<TelegramMessage> {
  return call<TelegramMessage>(args.botToken, 'sendPhoto', {
    chat_id: args.chatId,
    photo: args.photoUrl,
    ...(args.caption ? { caption: args.caption } : {}),
  })
}

export async function sendDocument(args: {
  botToken: string
  chatId: number | string
  documentUrl: string
  caption?: string
}): Promise<TelegramMessage> {
  return call<TelegramMessage>(args.botToken, 'sendDocument', {
    chat_id: args.chatId,
    document: args.documentUrl,
    ...(args.caption ? { caption: args.caption } : {}),
  })
}

export async function sendAudio(args: {
  botToken: string
  chatId: number | string
  audioUrl: string
}): Promise<TelegramMessage> {
  return call<TelegramMessage>(args.botToken, 'sendAudio', {
    chat_id: args.chatId,
    audio: args.audioUrl,
  })
}

export async function sendVideo(args: {
  botToken: string
  chatId: number | string
  videoUrl: string
  caption?: string
}): Promise<TelegramMessage> {
  return call<TelegramMessage>(args.botToken, 'sendVideo', {
    chat_id: args.chatId,
    video: args.videoUrl,
    ...(args.caption ? { caption: args.caption } : {}),
  })
}

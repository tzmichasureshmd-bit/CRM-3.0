import {
  getTokenInfo,
  getPhoneNumber,
  getWaba,
  getSubscribedApps,
  getWebhookSubscriptions,
  probeRegistrationState,
  MetaApiError,
} from './meta-api'
import type { RegistrationState } from './meta-api'

/**
 * Shared WhatsApp Cloud API verification suite.
 *
 * Runs the real "Verified with Meta" checks against the Graph API and
 * returns a structured, per-check result the UI can render honestly —
 * never claiming a step passed that the actual API did not confirm, and
 * never leaking secrets (tokens / app secrets) into the response.
 */

export type CheckStatus = 'ok' | 'fail' | 'warning' | 'skipped'

export interface CheckResult {
  status: CheckStatus
  label: string
  detail: string | null
  /** Machine-readable key for the diagnostics UI. */
  key: string
  /** Safe error info (no secrets). */
  error?: {
    status?: number
    code?: string
    type?: string
    message?: string
    operation?: string
  } | null
}

export interface VerificationResult {
  checks: CheckResult[]
  /** True when every required check passes. */
  ready: boolean
  /** True when credentials / registry lookups succeeded but something is not wired. */
  partial: boolean
  /** Local registration timestamp (from a prior successful /register), if any. */
  registeredAt: string | null
  /** True when inbound configuration (registration) is incomplete and needs a PIN/action. */
  requiresRegistration: boolean
  /** Real registration state determined by live Meta probe. */
  registrationState: RegistrationState | null
}

export interface VerifyInput {
  phoneNumberId: string
  wabaId: string | null
  accessToken: string
  /** When provided, used to probe live registration state via /register. */
  pin?: string | null
  /** Locally recorded registration success timestamp (registered_at). */
  registeredAt?: string | null
  /** Locally recorded WABA-subscribe success timestamp. */
  subscribedAppsAt?: string | null
  /** Meta App id (env META_APP_ID) — optional; enables webhook-subscription checks. */
  metaAppId?: string | null
  verifyToken?: string | null
}

/** Turn a thrown error into a safe, redacted diagnostic object. */
export function redactError(err: unknown): CheckResult['error'] {
  if (err instanceof MetaApiError) {
    return {
      status: err.status,
      code: err.code != null ? String(err.code) : undefined,
      type: err.type ?? undefined,
      message: err.metasMessage ?? err.message,
      operation: err.operation,
    }
  }
  const message = err instanceof Error ? err.message : String(err)
  return { message }
}

function check(
  key: string,
  label: string,
  status: CheckStatus,
  detail: string | null,
  error?: CheckResult['error'],
): CheckResult {
  return { key, label, status, detail, error: error ?? null }
}

export async function runVerification(input: VerifyInput): Promise<VerificationResult> {
  const checks: CheckResult[] = []

  // 1. Access token — GET /me
  try {
    const info = await getTokenInfo({ accessToken: input.accessToken })
    checks.push(
      check(
        'credentials',
        'Meta Credentials',
        'ok',
        info.name ? `Verified (${info.name})` : 'Access token verified',
      ),
    )
  } catch (err) {
    checks.push(
      check(
        'credentials',
        'Meta Credentials',
        'fail',
        'Access token could not be verified with Meta.',
        redactError(err),
      ),
    )
    // If the token is invalid there's nothing else we can reliably check.
    return { checks, ready: false, partial: false, registeredAt: input.registeredAt ?? null, requiresRegistration: true, registrationState: null }
  }

  // 2. WABA — GET /{waba_id}
  if (input.wabaId) {
    try {
      const waba = await getWaba({ wabaId: input.wabaId, accessToken: input.accessToken })
      const detail = [
        waba.name ? waba.name : null,
        waba.account_status ? `status ${waba.account_status}` : null,
        waba.business_verification_status ? `verification ${waba.business_verification_status}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
      checks.push(
        check('waba', 'WABA', 'ok', detail || 'WhatsApp Business Account verified'),
      )
    } catch (err) {
      checks.push(
        check(
          'waba',
          'WABA',
          'fail',
          'WhatsApp Business Account could not be verified.',
          redactError(err),
        ),
      )
    }
  } else {
    checks.push(
      check(
        'waba',
        'WABA',
        'warning',
        'No WABA ID on file — inbound webhooks can\'t be wired without it.',
      ),
    )
  }

  // 3. Phone number — GET /{phone_number_id}
  try {
    const phone = await getPhoneNumber({
      phoneNumberId: input.phoneNumberId,
      accessToken: input.accessToken,
    })
    const detail = [
      phone.display_phone_number ? phone.display_phone_number : null,
      phone.verified_name ? phone.verified_name : null,
      phone.quality_rating ? `quality ${phone.quality_rating}` : null,
    ]
      .filter(Boolean)
      .join(' · ')
    checks.push(check('phone_number', 'Phone Number', 'ok', detail || 'Phone number found'))
  } catch (err) {
    checks.push(
      check(
        'phone_number',
        'Phone Number',
        'fail',
        'Phone Number ID could not be verified against this token.',
        redactError(err),
      ),
    )
  }

  // 4. Registration — the make-or-break check for inbound routing.
  //    Live-probes Meta (/register) so we never guess. A provided PIN is
  //    used to complete registration; without one, a placeholder elicits
  //    Meta's real status ("already registered"/"PIN required").
  const reg = await probeRegistrationState({
    phoneNumberId: input.phoneNumberId,
    accessToken: input.accessToken,
    pin: input.pin ?? null,
  })
  if (reg.state === 'REGISTERED') {
    checks.push(
      check(
        'registration',
        'Phone Registration',
        'ok',
        reg.freshlyRegistered
          ? 'Phone number registered to this app.'
          : 'Phone number is already registered to this app.',
      ),
    )
  } else if (reg.state === 'REGISTRATION_REQUIRED') {
    checks.push(
      check(
        'registration',
        'Phone Registration',
        'warning',
        'Registration requires the two-step verification PIN.',
        { message: reg.message ?? undefined },
      ),
    )
  } else if (reg.state === 'REGISTERED_ELSEWHERE') {
    checks.push(
      check(
        'registration',
        'Phone Registration',
        'fail',
        'Phone number is registered under another WABA/app — it must be registered to THIS app to receive inbound here.',
        { message: reg.message ?? undefined },
      ),
    )
  } else {
    checks.push(
      check(
        'registration',
        'Phone Registration',
        'warning',
        'Registration state could not be confirmed.',
        { message: reg.message ?? undefined },
      ),
    )
  }

  // 5. WABA subscribed to app — GET /{waba_id}/subscribed_apps
  if (input.wabaId) {
    try {
      const subs = await getSubscribedApps({
        wabaId: input.wabaId,
        accessToken: input.accessToken,
      })
      if (subs.length > 0) {
        checks.push(
          check(
            'waba_subscription',
            'WABA Subscription',
            'ok',
            'WABA is subscribed to an app.',
          ),
        )
      } else {
        checks.push(
          check(
            'waba_subscription',
            'WABA Subscription',
            'warning',
            'WABA has no subscribed apps. Re-save to subscribe.',
          ),
        )
      }
    } catch (err) {
      checks.push(
        check(
          'waba_subscription',
          'WABA Subscription',
          'fail',
          'Could not confirm the WABA app subscription.',
          redactError(err),
        ),
      )
    }
  }

  // 6. Webhook subscription + messages field — GET /{app_id}/subscriptions
  if (input.metaAppId) {
    try {
      const subs = await getWebhookSubscriptions({
        appId: input.metaAppId,
        accessToken: input.accessToken,
      })
      const wa = subs.find((s) => s.object === 'whatsapp_business_account')
      const fields = wa?.fields ?? []
      const hasMessages = fields.includes('messages')
      if (wa && wa.active !== false && hasMessages) {
        checks.push(
          check(
            'webhook',
            'Webhook',
            'ok',
            wa.callback_url ? `Subscribed ${wa.object} (messages)` : 'Webhook subscribed (messages)',
          ),
        )
      } else if (wa) {
        checks.push(
          check(
            'webhook',
            'Webhook',
            'warning',
            `Webhook or messages field not configured. Fields: ${fields.join(', ') || 'none'}`,
          ),
        )
      } else {
        checks.push(
          check(
            'webhook',
            'Webhook',
            'warning',
            'No whatsapp_business_account webhook subscription found on this app.',
          ),
        )
      }
    } catch (err) {
      checks.push(
        check(
          'webhook',
          'Webhook',
          'warning',
          'Could not confirm the app-level webhook subscription (add META_APP_ID to enable this check).',
          redactError(err),
        ),
      )
    }
  } else {
    checks.push(
      check(
        'webhook',
        'Webhook',
        'skipped',
        'App-level webhook subscription check skipped (META_APP_ID not configured). WABA-to-app subscription is checked above.',
      ),
    )
  }

  // 7. Webhook GET verify-token — local config sanity (no external call needed).
  checks.push(
    check(
      'webhook_verify',
      'Webhook Verify',
      input.verifyToken ? 'ok' : 'warning',
      input.verifyToken
        ? 'A webhook verify token is configured for the /api/whatsapp/webhook endpoint.'
        : 'No webhook verify token on file — set one so Meta can complete the GET challenge.',
    ),
  )

  // 7b. Webhook POST signature — the inbound endpoint FAILS CLOSED when
  //     META_APP_SECRET is unset (rejects every POST), silently dropping
  //     messages even though Meta "receives" them. Surface it as a hard
  //     failure so operators can see why inbound is dead.
  const metaAppSecretConfigured = Boolean(process.env.META_APP_SECRET)
  checks.push(
    check(
      'webhook_signature',
      'Webhook Signature',
      metaAppSecretConfigured ? 'ok' : 'fail',
      metaAppSecretConfigured
        ? 'META_APP_SECRET is configured — inbound signatures will verify.'
        : 'META_APP_SECRET is NOT set. The webhook rejects every inbound request (401), so messages will never appear.',
    ),
  )

  // 8. Inbound messaging readiness
  const inboundOk =
    checks.find((c) => c.key === 'registration')?.status === 'ok' &&
    checks.find((c) => c.key === 'phone_number')?.status === 'ok' &&
    (checks.find((c) => c.key === 'waba_subscription')?.status === 'ok' ||
      checks.find((c) => c.key === 'waba_subscription')?.status === 'warning')
  checks.push(
    check(
      'inbound',
      'Inbound Messages',
      inboundOk ? 'ok' : 'warning',
      inboundOk
        ? 'Ready to receive inbound WhatsApp messages.'
        : 'Inbound messaging is not ready — resolve the failing checks above.',
    ),
  )

  const requiredFails = checks.filter(
    (c) =>
      c.status === 'fail' &&
      ['credentials', 'waba', 'phone_number', 'registration', 'waba_subscription', 'webhook_signature'].includes(c.key),
  )
  const anyWarning = checks.some((c) => c.status === 'warning')
  const ready = requiredFails.length === 0 && !anyWarning
  const requiresRegistration =
    checks.find((c) => c.key === 'registration')?.status !== 'ok'

  return {
    checks,
    ready,
    partial: requiredFails.length === 0 && anyWarning,
    registeredAt: input.registeredAt ?? null,
    requiresRegistration,
    registrationState: reg.state,
  }
}

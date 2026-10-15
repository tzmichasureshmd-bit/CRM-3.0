import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Tests for POST /api/whatsapp/register — the dedicated backend registration
// endpoint. The browser sends ONLY a PIN; the route resolves the tenant's
// config server-side, decrypts the stored token, and calls Meta. These tests
// verify PIN validation, tenant scoping, credential handling, and the
// safe error / success contract (no secrets in responses).
// ---------------------------------------------------------------------------

let configRow: Record<string, unknown> | null
let profileAccountId: string | null
let supabaseMock: ReturnType<typeof makeSupabaseMock>

// Records every UPDATE the route issued against whatsapp_config so we can
// assert local status is refreshed with the right registration state.
const configWrites: Array<Record<string, unknown>> = []

function builder(table: string) {
  const resultFor = () => {
    if (table === 'profiles') {
      return { data: profileAccountId ? { account_id: profileAccountId } : null, error: null }
    }
    if (table === 'whatsapp_config') {
      return { data: configRow, error: null }
    }
    return { data: null, error: null }
  }

  const b: Record<string, unknown> = {}
  const chain = () => b
  for (const m of ['select', 'eq', 'order', 'limit']) {
    b[m] = vi.fn(chain)
  }
  b.update = vi.fn((payload: Record<string, unknown>) => {
    configWrites.push(payload)
    return b
  })
  b.maybeSingle = vi.fn(async () => resultFor())
  b.then = (resolve: (v: unknown) => unknown) => resolve(resultFor())
  return b
}

function makeSupabaseMock() {
  return {
    auth: {
      getUser: vi.fn(async (): Promise<{
        data: { user: { id: string } | null }
        error: null
      }> => ({
        data: { user: { id: 'user-1' } },
        error: null,
      })),
    },
    from: vi.fn((table: string) => builder(table)),
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => supabaseMock),
}))

vi.mock('@/lib/whatsapp/encryption', () => ({
  decrypt: vi.fn(() => 'decrypted-token'),
}))

const registerPhoneNumber = vi.hoisted(() => vi.fn())
vi.mock('@/lib/whatsapp/meta-api', () => ({
  registerPhoneNumber,
  probeRegistrationState: vi.fn(),
}))

import { POST } from './route'

function postRegister(pin?: unknown) {
  return POST(
    new Request('http://localhost/api/whatsapp/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pin === undefined ? {} : { pin }),
    }),
  )
}

describe('POST /api/whatsapp/register', () => {
  beforeEach(() => {
    configWrites.length = 0
    profileAccountId = 'acct-1'
    configRow = {
      id: 'cfg-1',
      account_id: 'acct-1',
      phone_number_id: 'PNID-1',
      waba_id: 'WABA-1',
      access_token: 'encrypted-token',
      registered_at: null,
      registration_state: null,
      last_registration_error: null,
    }
    supabaseMock = makeSupabaseMock()
    registerPhoneNumber.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('rejects a non-6-digit PIN before any Meta call', async () => {
    const res = await postRegister('123')
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.message).toMatch(/6-digit whatsapp two-step verification pin/i)
    expect(registerPhoneNumber).not.toHaveBeenCalled()
  })

  it('rejects a PIN that contains non-numeric characters', async () => {
    // Even though the client strips non-digits, the server must enforce it.
    const res = await postRegister('12a456')
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.message).toMatch(/6-digit/i)
    expect(registerPhoneNumber).not.toHaveBeenCalled()
  })

  it('resolves the config for the authenticated user account and calls Meta with the decrypted token', async () => {
    registerPhoneNumber.mockResolvedValue({ success: true, alreadyRegistered: false })

    const res = await postRegister('123456')
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.registered).toBe(true)

    // Meta was called with the DeCRYPTED server-side token and the PIN —
    // the response must never contain the raw / encrypted token.
    const args = (registerPhoneNumber.mock.calls[0] as unknown[])[0] as Record<
      string,
      unknown
    >
    expect(args.accessToken).toBe('decrypted-token')
    expect(args.pin).toBe('123456')

    const body = JSON.stringify(json)
    expect(body).not.toContain('encrypted-token')
    expect(body).not.toContain('decrypted-token')
    expect(body).not.toContain('123456')
  })

  it('marks local status as registered on success', async () => {
    registerPhoneNumber.mockResolvedValue({ success: true, alreadyRegistered: false })

    await postRegister('123456')

    const write = configWrites[configWrites.length - 1]
    expect(write).toMatchObject({
      registration_state: 'REGISTERED',
      registered_at: expect.any(String),
      last_registration_error: null,
      status: 'connected',
      connection_status: 'connected',
    })
  })

  it('treats an already-registered number as success and marks it REGISTERED', async () => {
    registerPhoneNumber.mockResolvedValue({ success: true, alreadyRegistered: true })

    const res = await postRegister('123456')
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.registered).toBe(true)
    expect(json.already_registered).toBe(true)
    expect(json.message).toMatch(/already registered/i)

    const write = configWrites[configWrites.length - 1]
    expect(write).toMatchObject({ registration_state: 'REGISTERED' })
  })

  it('returns a useful, safe message when Meta rejects an incorrect PIN', async () => {
    registerPhoneNumber.mockRejectedValue(new Error('Incorrect PIN.'))

    const res = await postRegister('000000')
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.registered).toBe(false)
    expect(json.message).toMatch(/rejected the registration pin/i)
    expect(JSON.stringify(json)).not.toContain('decrypted-token')
  })

  it('maps an invalid/expired token error to a useful message', async () => {
    registerPhoneNumber.mockRejectedValue(new Error('The user access token is expired.'))

    const res = await postRegister('123456')
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.message).toMatch(/access token is invalid or expired/i)
  })

  it('returns 404 when no config exists yet', async () => {
    configRow = null
    const res = await postRegister('123456')
    expect(res.status).toBe(404)
    expect(registerPhoneNumber).not.toHaveBeenCalled()
  })

  it('returns 403 when the profile is not linked to an account', async () => {
    profileAccountId = null
    const res = await postRegister('123456')
    expect(res.status).toBe(403)
    expect(registerPhoneNumber).not.toHaveBeenCalled()
  })

  it('returns 401 when unauthenticated', async () => {
    supabaseMock = makeSupabaseMock()
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await postRegister('123456')
    expect(res.status).toBe(401)
    expect(registerPhoneNumber).not.toHaveBeenCalled()
  })
})

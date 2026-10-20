import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Tests for POST /api/whatsapp/test — the "Test API Connection" backend
// endpoint. It performs a REAL Meta Cloud API round-trip using the tenant's
// STORED (encrypted) credentials, so the UI can show "Connected" only when
// Meta actually validates them. These tests verify auth, tenant scoping,
// decryption, Meta verification, and the safe success/error contract (no
// secrets in responses, no fake success).
// ---------------------------------------------------------------------------

let configRow: Record<string, unknown> | null
let profileAccountId: string | null
let supabaseMock: ReturnType<typeof makeSupabaseMock>

const verifyPhoneNumber = vi.hoisted(() => vi.fn())
vi.mock('@/lib/whatsapp/meta-api', () => ({
  verifyPhoneNumber,
  MetaApiError: class MetaApiError extends Error {
    status: number
    code: number | null
    type: string | null
    subcode: number | null
    operation: string
    metasMessage: string | null
    constructor(opts: {
      status: number
      code?: number | null
      type?: string | null
      subcode?: number | null
      message?: string | null
      operation: string
    }) {
      super(opts.message || `Meta API error (HTTP ${opts.status})`)
      this.status = opts.status
      this.code = opts.code ?? null
      this.type = opts.type ?? null
      this.subcode = opts.subcode ?? null
      this.operation = opts.operation
      this.metasMessage = opts.message ?? null
    }
  },
}))

vi.mock('@/lib/whatsapp/encryption', () => ({
  decrypt: vi.fn(() => 'decrypted-token'),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => supabaseMock),
}))

function builder(table: string) {
  const resultFor = () => {
    if (table === 'profiles') {
      return { data: profileAccountId ? { account_id: profileAccountId } : null, error: null }
    }
    if (table === 'whatsapp_config') {
      return { data: configRow ? [configRow] : null, error: null }
    }
    return { data: null, error: null }
  }
  const b: Record<string, unknown> = {}
  const chain = () => b
  for (const m of ['select', 'eq', 'order', 'limit', 'maybeSingle']) {
    b[m] = vi.fn(chain)
  }
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

import { POST } from './route'

function postTest() {
  return POST(new Request('http://localhost/api/whatsapp/test', { method: 'POST' }))
}

const META_PHONE = {
  id: 'PNID-1',
  display_phone_number: '+15550001234',
  verified_name: 'ACME Corp',
  quality_rating: 'GREEN',
}

describe('POST /api/whatsapp/test', () => {
  beforeEach(() => {
    profileAccountId = 'acct-1'
    configRow = {
      id: 'cfg-1',
      account_id: 'acct-1',
      phone_number_id: 'PNID-1',
      waba_id: 'WABA-1',
      access_token: 'encrypted-token',
      business_name: 'ACME Corp',
    }
    supabaseMock = makeSupabaseMock()
    verifyPhoneNumber.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('verifies the stored number against Meta with the DECRYPTED server-side token', async () => {
    verifyPhoneNumber.mockResolvedValue(META_PHONE)

    const res = await postTest()
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.connected).toBe(true)
    expect(json.message).toMatch(/connection is working/i)

    const args = (verifyPhoneNumber.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    expect(args.accessToken).toBe('decrypted-token')
    expect(args.phoneNumberId).toBe('PNID-1')
  })

  it('never exposes the access token in the success response', async () => {
    verifyPhoneNumber.mockResolvedValue(META_PHONE)

    const res = await postTest()
    const body = JSON.stringify(await res.json())
    expect(body).not.toContain('encrypted-token')
    expect(body).not.toContain('decrypted-token')
  })

  it('returns a safe, human-readable reason when Meta rejects an invalid/expired token', async () => {
    const { MetaApiError } = await import('@/lib/whatsapp/meta-api')
    verifyPhoneNumber.mockRejectedValue(
      new MetaApiError({ status: 400, message: 'The user access token is expired.', operation: 'verify_phone_number' }),
    )

    const res = await postTest()
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(false)
    expect(json.connected).toBe(false)
    expect(json.reason).toMatch(/access token is invalid or expired/i)
  })

  it('translates an invalid Phone Number ID error', async () => {
    const { MetaApiError } = await import('@/lib/whatsapp/meta-api')
    verifyPhoneNumber.mockRejectedValue(
      new MetaApiError({ status: 400, message: 'Invalid parameter: phone number ID does not belong.', operation: 'verify_phone_number' }),
    )

    const res = await postTest()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.connected).toBe(false)
    expect(json.reason).toMatch(/phone number id is invalid/i)
  })

  it('returns not_configured with 200 when no config row exists', async () => {
    configRow = null
    const res = await postTest()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.success).toBe(false)
    expect(json.connected).toBe(false)
    expect(json.reason).toBe('not_configured')
    expect(verifyPhoneNumber).not.toHaveBeenCalled()
  })

  it('returns token_corrupted when the stored token cannot be decrypted', async () => {
    // Re-point decrypt to throw for this case.
    const encryption = await import('@/lib/whatsapp/encryption')
    ;(encryption.decrypt as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('bad decrypt')
    })

    const res = await postTest()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.success).toBe(false)
    expect(json.connected).toBe(false)
    expect(json.reason).toBe('token_corrupted')
    expect(verifyPhoneNumber).not.toHaveBeenCalled()
  })

  it('returns a reason when a stored token is absent', async () => {
    configRow = { ...configRow!, access_token: null }
    const res = await postTest()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.connected).toBe(false)
    expect(json.reason).toBe('missing_access_token')
    expect(verifyPhoneNumber).not.toHaveBeenCalled()
  })

  it('returns 403-style not_configured when the profile is not linked to an account', async () => {
    profileAccountId = null
    const res = await postTest()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.connected).toBe(false)
    expect(json.reason).toBe('no_account')
    expect(verifyPhoneNumber).not.toHaveBeenCalled()
  })

  it('returns 401 when unauthenticated', async () => {
    supabaseMock = makeSupabaseMock()
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await postTest()
    expect(res.status).toBe(401)
    expect(verifyPhoneNumber).not.toHaveBeenCalled()
  })
})

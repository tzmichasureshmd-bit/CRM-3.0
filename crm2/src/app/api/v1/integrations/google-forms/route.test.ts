import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireApiKey: vi.fn(),
  resolveAuditUserId: vi.fn(),
  sanitizeSubmission: vi.fn(),
  ingest: vi.fn(),
}));

vi.mock('@/lib/auth/api-context', () => ({
  requireApiKey: mocks.requireApiKey,
}));

vi.mock('@/lib/api/v1/contacts', () => ({
  resolveAuditUserId: mocks.resolveAuditUserId,
}));

vi.mock('@/lib/google-forms/ingest', () => ({
  sanitizeSubmission: mocks.sanitizeSubmission,
  ingestGoogleFormSubmission: mocks.ingest,
}));

import { POST } from './route';

const ctx = {
  authType: 'api_key' as const,
  supabase: { name: 'service-role-client' },
  accountId: 'account-1',
  keyId: 'key-1',
  scopes: ['contacts:write'],
  createdBy: null,
};

function request(body: unknown) {
  return new Request('http://localhost/api/v1/integrations/google-forms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.requireApiKey.mockReset();
  mocks.resolveAuditUserId.mockReset();
  mocks.sanitizeSubmission.mockReset();
  mocks.ingest.mockReset();
  mocks.requireApiKey.mockResolvedValue(ctx);
  mocks.resolveAuditUserId.mockResolvedValue('user-1');
});

describe('POST /api/v1/integrations/google-forms', () => {
  it('authenticates with the contacts:write scope and ingests a submission', async () => {
    mocks.sanitizeSubmission.mockReturnValue({ phone: '+14155550123', submission_id: 'resp-1' });
    mocks.ingest.mockResolvedValue({ action: 'created', contactId: 'c1', duplicate: false });

    const response = await POST(request({ phone: '+14155550123', submission_id: 'resp-1' }));

    expect(mocks.requireApiKey).toHaveBeenCalledWith(
      expect.anything(),
      'contacts:write',
    );
    expect(mocks.ingest).toHaveBeenCalledWith(
      ctx.supabase,
      'account-1',
      'user-1',
      expect.objectContaining({ phone: '+14155550123', submission_id: 'resp-1' }),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data).toEqual({ action: 'created', contact_id: 'c1', duplicate: false });
  });

  it('returns 200 (not 201) when the submission was a duplicate', async () => {
    mocks.sanitizeSubmission.mockReturnValue({ phone: '+14155550123', submission_id: 'resp-1' });
    mocks.ingest.mockResolvedValue({ action: 'duplicate', contactId: 'c1', duplicate: true });

    const response = await POST(request({ phone: '+14155550123', submission_id: 'resp-1' }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.duplicate).toBe(true);
  });

  it('rejects a missing phone before writing', async () => {
    mocks.sanitizeSubmission.mockImplementation(() => {
      const err = new Error("'phone' is required");
      (err as unknown as { status: number }).status = 400;
      throw err;
    });

    const response = await POST(request({ name: 'No phone' }));

    expect(response.status).toBe(400);
    expect(mocks.ingest).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body.error.code).toBe('bad_request');
  });

  it('rejects malformed JSON', async () => {
    const response = await POST(request('not-json{'));
    expect(response.status).toBe(400);
    expect(mocks.ingest).not.toHaveBeenCalled();
  });

  it('rejects a non-object body', async () => {
    const response = await POST(request([1, 2, 3]));
    expect(response.status).toBe(400);
  });
});
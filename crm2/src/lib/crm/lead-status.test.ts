import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  LEAD_STATUSES,
  LEAD_STATUS_OPTIONS,
  isLeadStatus,
  leadStatusBadgeClassName,
  leadStatusLabel,
  parseLeadStatus,
  setContactLeadStatus,
} from './lead-status';

function mockClient(error: unknown = null) {
  const eq = vi.fn().mockResolvedValue({ error });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });
  const client = { from, update, eq } as unknown as SupabaseClient;
  return { client, from, update, eq };
}

describe('LEAD_STATUSES', () => {
  it('mirrors the migration 038 CHECK constraint exactly', () => {
    expect([...LEAD_STATUSES]).toEqual([
      'new',
      'contacted',
      'qualified',
      'proposal',
      'negotiation',
      'won',
      'lost',
    ]);
  });

  it('offers one labelled option per status, in vocabulary order', () => {
    expect(LEAD_STATUS_OPTIONS.map((option) => option.value)).toEqual([
      ...LEAD_STATUSES,
    ]);
    expect(LEAD_STATUS_OPTIONS.find((o) => o.value === 'new')?.label).toBe(
      'New Lead'
    );
    expect(LEAD_STATUS_OPTIONS.find((o) => o.value === 'lost')?.label).toBe(
      'Lost'
    );
    expect(LEAD_STATUS_OPTIONS).toHaveLength(LEAD_STATUSES.length);
  });
});

describe('isLeadStatus', () => {
  it('accepts every canonical value', () => {
    for (const status of LEAD_STATUSES) {
      expect(isLeadStatus(status)).toBe(true);
    }
  });

  it('rejects anything the database would reject', () => {
    expect(isLeadStatus('lead')).toBe(false);
    expect(isLeadStatus('QUALIFIED')).toBe(false);
    expect(isLeadStatus('')).toBe(false);
    expect(isLeadStatus(null)).toBe(false);
    expect(isLeadStatus(42)).toBe(false);
    expect(isLeadStatus({ status: 'new' })).toBe(false);
  });
});

describe('parseLeadStatus', () => {
  it('normalises case and surrounding whitespace from legacy/imported data', () => {
    expect(parseLeadStatus('WON')).toBe('won');
    expect(parseLeadStatus('  Negotiation  ')).toBe('negotiation');
    expect(parseLeadStatus('New')).toBe('new');
  });

  it('returns null instead of throwing on junk', () => {
    expect(parseLeadStatus('enterprise')).toBeNull();
    expect(parseLeadStatus(undefined)).toBeNull();
    expect(parseLeadStatus(['new'])).toBeNull();
    expect(parseLeadStatus(0)).toBeNull();
  });
});

describe('leadStatusLabel', () => {
  it('uses the spec labels for canonical values', () => {
    expect(leadStatusLabel('new')).toBe('New Lead');
    expect(leadStatusLabel('contacted')).toBe('Contacted');
    expect(leadStatusLabel('qualified')).toBe('Qualified');
    expect(leadStatusLabel('proposal')).toBe('Proposal');
    expect(leadStatusLabel('negotiation')).toBe('Negotiation');
    expect(leadStatusLabel('won')).toBe('Won');
    expect(leadStatusLabel('lost')).toBe('Lost');
  });

  it('capitalises unknown legacy values rather than hiding them', () => {
    expect(leadStatusLabel('enterprise')).toBe('Enterprise');
  });

  it('renders an em dash for missing values', () => {
    expect(leadStatusLabel(null)).toBe('—');
    expect(leadStatusLabel(undefined)).toBe('—');
    expect(leadStatusLabel('')).toBe('—');
    expect(leadStatusLabel('   ')).toBe('—');
  });
});

describe('leadStatusBadgeClassName', () => {
  it('always carries the shared pill geometry', () => {
    expect(leadStatusBadgeClassName('won')).toContain('rounded-full');
    expect(leadStatusBadgeClassName('won')).toContain('border');
    expect(leadStatusBadgeClassName(null)).toContain('rounded-full');
  });

  it('picks the status colour for canonical values', () => {
    expect(leadStatusBadgeClassName('won')).toContain('bg-[#EDFAF4]');
    expect(leadStatusBadgeClassName('lost')).toContain('bg-[#FEF2F2]');
    expect(leadStatusBadgeClassName('new')).toContain('bg-[#EEF4FF]');
  });

  it('falls back to a neutral pill for unknown values', () => {
    expect(leadStatusBadgeClassName('enterprise')).toContain(
      'bg-muted text-muted-foreground'
    );
  });

  it('gives every status its own colour', () => {
    const classNames = LEAD_STATUSES.map((status) =>
      leadStatusBadgeClassName(status)
    );
    expect(new Set(classNames).size).toBe(LEAD_STATUSES.length);
  });
});

describe('setContactLeadStatus', () => {
  it('writes the canonical status and stamps updated_at', async () => {
    const { client, from, update, eq } = mockClient();

    const result = await setContactLeadStatus(client, 'contact-1', 'qualified');

    expect(result).toEqual({ ok: true, status: 'qualified' });
    expect(from).toHaveBeenCalledWith('contacts');
    expect(update).toHaveBeenCalledTimes(1);
    expect(eq).toHaveBeenCalledWith('id', 'contact-1');

    const payload = update.mock.calls[0][0] as {
      lead_status: string;
      updated_at: string;
    };
    expect(payload.lead_status).toBe('qualified');
    expect(Number.isNaN(Date.parse(payload.updated_at))).toBe(false);
  });

  it('normalises sloppy input before it reaches the database', async () => {
    const { client, update } = mockClient();

    const result = await setContactLeadStatus(client, 'contact-1', ' WON ');

    expect(result).toEqual({ ok: true, status: 'won' });
    expect(
      (update.mock.calls[0][0] as { lead_status: string }).lead_status
    ).toBe('won');
  });

  it('rejects an unknown status without touching the network', async () => {
    const { client, from } = mockClient();

    const result = await setContactLeadStatus(
      client,
      'contact-1',
      'enterprise'
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('enterprise');
    }
    expect(from).not.toHaveBeenCalled();
  });

  it('rejects a missing contact id without touching the network', async () => {
    const { client, from } = mockClient();

    const result = await setContactLeadStatus(client, '', 'won');

    expect(result).toEqual({ ok: false, error: 'Missing contact id.' });
    expect(from).not.toHaveBeenCalled();
  });

  it('keeps the database reason (RLS) in the error', async () => {
    const { client } = mockClient({
      code: '42501',
      message: 'permission denied for table contacts',
    });

    const result = await setContactLeadStatus(client, 'contact-1', 'lost');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('row-level security');
    }
  });

  it('falls back to a full sentence when the driver gives no reason', async () => {
    const { client } = mockClient({});

    const result = await setContactLeadStatus(client, 'contact-1', 'lost');

    expect(result).toEqual({
      ok: false,
      error: 'Could not save the lead status.',
    });
  });
});

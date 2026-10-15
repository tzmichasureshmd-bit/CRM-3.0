import { describe, it, expect } from 'vitest';

import { sanitizeSubmission, normalizePhone } from './ingest';

describe('sanitizeSubmission', () => {
  it('requires a phone (phone or phone_number)', () => {
    expect(() => sanitizeSubmission({})).toThrowError("'phone' is required");
    expect(() => sanitizeSubmission({ email: 'a@b.c' })).toThrowError(
      "'phone' is required",
    );
    const ok = sanitizeSubmission({ phone: '+14155550123' });
    expect(ok.phone).toBe('+14155550123');
    const alt = sanitizeSubmission({ phone_number: '+14155550123' });
    expect(alt.phone).toBe('+14155550123');
  });

  it('trims and nulls empty optional fields, keeps non-empty', () => {
    const out = sanitizeSubmission({
      phone: ' +14155550123 ',
      name: ' Sai ',
      email: '',
      location: 'New York',
      utm_campaign: 'summer',
    });
    expect(out.phone).toBe('+14155550123');
    expect(out.name).toBe('Sai');
    // Empty optional fields collapse to null so we never clobber an
    // existing contact value with a blank.
    expect(out.email).toBeNull();
    expect(out.location).toBe('New York');
    expect(out.utm_campaign).toBe('summer');
  });

  it('falls back to utm_campaign for campaign when not provided', () => {
    const out = sanitizeSubmission({
      phone: '+14155550123',
      utm_campaign: 'summer_campaign',
      utm_source: 'facebook',
    });
    expect(out.campaign).toBe('summer_campaign');
    expect(out.utm_source).toBe('facebook');
  });
});

describe('normalizePhone', () => {
  it('accepts a valid number (digits normalized)', () => {
    expect(normalizePhone('+14155550123')).toBe('14155550123');
    expect(normalizePhone('14155550123')).toBe('14155550123');
  });
  it('rejects an invalid number', () => {
    expect(normalizePhone('not-a-number')).toBeNull();
  });
  it('rejects empty input', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('   ')).toBeNull();
  });
});

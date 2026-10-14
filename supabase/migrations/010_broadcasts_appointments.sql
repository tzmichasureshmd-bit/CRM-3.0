-- ============================================================
-- Migration 010: Broadcasts & Appointments tables
-- Safe to run multiple times (idempotent).
-- ============================================================

-- ── Broadcasts ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS broadcasts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name                text NOT NULL,
  platform            text NOT NULL DEFAULT 'whatsapp',
  message             text,
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','sending','sent','failed','cancelled')),
  total_recipients    integer DEFAULT 0,
  sent_count          integer DEFAULT 0,
  delivered_count     integer DEFAULT 0,
  read_count          integer DEFAULT 0,
  failed_count        integer DEFAULT 0,
  segment_id          uuid,
  scheduled_at        timestamptz,
  sent_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS broadcasts_account_idx ON broadcasts(account_id);
CREATE INDEX IF NOT EXISTS broadcasts_status_idx  ON broadcasts(account_id, status);

ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS broadcasts_rls ON broadcasts;
CREATE POLICY broadcasts_rls ON broadcasts
  USING (account_id = get_my_account_id());

-- ── Appointments ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id          uuid REFERENCES contacts(id) ON DELETE SET NULL,
  user_id             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title               text NOT NULL,
  notes               text,
  location            text,
  scheduled_at        timestamptz NOT NULL,
  duration_minutes    integer DEFAULT 60,
  status              text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled','no_show')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS appointments_account_idx    ON appointments(account_id);
CREATE INDEX IF NOT EXISTS appointments_scheduled_idx  ON appointments(account_id, scheduled_at);
CREATE INDEX IF NOT EXISTS appointments_contact_idx    ON appointments(contact_id);
CREATE INDEX IF NOT EXISTS appointments_status_idx     ON appointments(account_id, status);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS appointments_rls ON appointments;
CREATE POLICY appointments_rls ON appointments
  USING (account_id = get_my_account_id());

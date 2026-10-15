-- 059_contact_messaging_preferences.sql
-- Add per-contact WhatsApp messaging preference controls.
--
-- Opt-out: a contact can be marked as opted out of WhatsApp messaging
-- (e.g. they replied "STOP", or the business records a standing opt-out).
-- The CRM must then NOT include the contact in bulk broadcasts, and
-- should surface a clear reason when a user tries to message them.
--
-- We also record when a contact was last messaged so the Contacts page
-- can show "Already contacted / last contacted" filtering (Part 6).
--
-- RLS is unchanged — the existing per-account `contacts` policies
-- (viewer select, agent+ write) already govern every column, so no
-- policy changes are needed here. We DO add an index on the opt-out
-- flag for fast filtering.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS messaging_opt_out BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS opted_out_reason  TEXT,
  ADD COLUMN IF NOT EXISTS opted_out_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_contacts_messaging_opt_out
  ON contacts(account_id, messaging_opt_out);

CREATE INDEX IF NOT EXISTS idx_contacts_last_contacted_at
  ON contacts(account_id, last_contacted_at);

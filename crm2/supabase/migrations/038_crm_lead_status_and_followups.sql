-- ============================================================
-- 038_crm_lead_status_and_followups.sql
--
-- Adds:
--   - lead_status column on contacts
--   - follow_ups table for CRM follow-up management
--   - realtime support for follow_ups
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- LEAD STATUS on contacts
-- ============================================================
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS lead_status TEXT
    DEFAULT 'new'
    CHECK (lead_status IN ('new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'));

CREATE INDEX IF NOT EXISTS idx_contacts_lead_status ON contacts(lead_status);

-- ============================================================
-- FOLLOW_UPS
-- ============================================================
CREATE TABLE IF NOT EXISTS follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ,
  reminder_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'cancelled')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_follow_ups_contact ON follow_ups(contact_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_account ON follow_ups(account_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_user ON follow_ups(user_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_status ON follow_ups(status);
CREATE INDEX IF NOT EXISTS idx_follow_ups_due_date ON follow_ups(due_date);

ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;

-- SELECT: any account member can view follow-ups
DROP POLICY IF EXISTS "follow_ups_select" ON follow_ups;
CREATE POLICY "follow_ups_select" ON follow_ups FOR SELECT
  USING (is_account_member(account_id));

-- INSERT: agent+ can create
DROP POLICY IF EXISTS "follow_ups_insert" ON follow_ups;
CREATE POLICY "follow_ups_insert" ON follow_ups FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

-- UPDATE: agent+ can update
DROP POLICY IF EXISTS "follow_ups_update" ON follow_ups;
CREATE POLICY "follow_ups_update" ON follow_ups FOR UPDATE
  USING (is_account_member(account_id, 'agent'));

-- DELETE: agent+ can delete
DROP POLICY IF EXISTS "follow_ups_delete" ON follow_ups;
CREATE POLICY "follow_ups_delete" ON follow_ups FOR DELETE
  USING (is_account_member(account_id, 'agent'));

-- ============================================================
-- UPDATED_AT trigger for follow_ups
-- ============================================================
DROP TRIGGER IF EXISTS set_updated_at ON follow_ups;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON follow_ups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- REALTIME for follow_ups
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'follow_ups'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE follow_ups;
  END IF;
END $$;

-- ============================================================
-- 027_notifications.sql — In-app notifications (groundwork)
--
-- Adds the `notifications` table backing the Notifications page
-- (`src/app/(dashboard)/notifications/page.tsx`) and the unread-count
-- badge in the sidebar (`src/hooks/use-unread-notifications.ts`).
--
-- Design notes
--   - Account-scoped. A notification belongs to one account and is
--     delivered to a single user (`user_id` = the intended recipient).
--   - `type` is a text column, not an enum — new notification kinds are
--     a code change (new icon in the TYPE_ICON map), not a migration.
--   - `read_at` IS NULL = unread. The hook counts via head:true +
--     `.is("read_at", null)`.
--   - `conversation_id` and `contact_id` are denormalised on the row so
--     the notifications page can deep-link (`/inbox?c=<id>`) without a
--     join. Both are nullable — some notification types are account-level.
--
-- RLS
--   - SELECT: any member of the account can see all notifications
--     addressed to their account (so admins can audit). This mirrors
--     the `broadcast_recipients_read` visibility pattern in 017.
--   - UPDATE (mark read) and DELETE: only the intended recipient
--     (`auth.uid() = user_id`), so one teammate can't mark another's
--     notifications read.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  actor_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_account_id  ON notifications(account_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id     ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read_at     ON notifications(read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_conversation ON notifications(conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at  ON notifications(account_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- SELECT: any member of the account.
DROP POLICY IF EXISTS notifications_select ON notifications;
CREATE POLICY notifications_select ON notifications FOR SELECT
  USING (is_account_member(account_id));

-- INSERT: agent+ of the account (assignment, mentions, etc.).
-- Recipients can't insert their own notifications (they'd bypass the
-- actor/recipient split), but agents+ can create notifications for
-- teammates.
DROP POLICY IF EXISTS notifications_insert ON notifications;
CREATE POLICY notifications_insert ON notifications FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

-- UPDATE/DELETE: only the recipient themselves.
DROP POLICY IF EXISTS notifications_update ON notifications;
CREATE POLICY notifications_update ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS notifications_delete ON notifications;
CREATE POLICY notifications_delete ON notifications FOR DELETE
  USING (auth.uid() = user_id);

-- Realtime — let the notifications page subscribe to new rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;

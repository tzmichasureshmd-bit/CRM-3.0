-- ============================================================
-- Migration 050: Customer-facing account activity log
--
-- Mirrors the recently-added Super Admin audit capability into the
-- customer CRM, without touching any admin surface:
--
--   1. Lets ACCOUNT ADMINS+ read their own account's audit_log rows
--      (a strictly narrower addition — the existing super_admin
--      policy is left exactly as it is).
--   2. Adds AFTER triggers on the domain tables so key business
--      events (contact created, broadcast created, member invited,
--      role changed, WhatsApp connected/disconnected) are recorded
--      to audit_log from EVERY write path — dashboard UI, public
--      API, and webhooks alike — with no changes to app code.
--
-- The trigger writes minimal metadata only (names / roles / ids).
-- No message content, no tokens, no phone numbers beyond what is
-- already implied by the row id. Fully additive and idempotent.
-- ============================================================

BEGIN;

-- -------------------------------------------------------
-- 1. Account-scoped read policy for admins+ of the owning account.
--    `account_id IS NOT NULL` keeps platform-level entries
--    (actor = super admin, no owning account) invisible here —
--    those remain super-admin-only via the existing policy.
-- -------------------------------------------------------
DROP POLICY IF EXISTS audit_log_select_account ON audit_log;
CREATE POLICY audit_log_select_account ON audit_log
  FOR SELECT USING (
    account_id IS NOT NULL
    AND is_account_member(account_id, 'admin')
  );

-- -------------------------------------------------------
-- 2. Shared trigger function. SECURITY DEFINER so events fired by
--    service-role contexts (webhooks, public API) still land even
--    though they run without an authenticated uid; RLS on the
--    source tables has already authorized the write by the time
--    this fires, and we only ever INSERT into audit_log.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION wacrm_log_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
  v_actor UUID := auth.uid();
  v_action TEXT;
  v_resource_type TEXT := TG_TABLE_NAME;
  v_details JSONB;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'contacts' THEN
      IF TG_OP = 'INSERT' THEN
        v_account_id := NEW.account_id;
        v_action := 'contact.created';
        v_details := jsonb_build_object('name', NEW.name);
      ELSE
        RETURN NULL;
      END IF;

    WHEN 'broadcasts' THEN
      IF TG_OP = 'INSERT' THEN
        v_account_id := NEW.account_id;
        v_action := 'broadcast.created';
        v_details := jsonb_build_object(
          'name', NEW.name,
          'recipients', NEW.total_recipients,
          'scheduled_at', NEW.scheduled_at
        );
      ELSE
        RETURN NULL;
      END IF;

    WHEN 'account_invitations' THEN
      IF TG_OP = 'INSERT' THEN
        v_account_id := NEW.account_id;
        v_action := 'invitation.created';
        v_details := jsonb_build_object('role', NEW.role, 'label', NEW.label);
      ELSE
        RETURN NULL;
      END IF;

    WHEN 'profiles' THEN
      -- Only fire when membership or role actually changed (the
      -- WHEN clause guards most noise; double-check here because
      -- INSERTs route through UPDATE-shaped logic in some tools).
      IF TG_OP = 'UPDATE'
         AND OLD.account_id IS NOT DISTINCT FROM NEW.account_id
         AND OLD.account_role IS NOT DISTINCT FROM NEW.account_role THEN
        RETURN NULL;
      END IF;
      v_account_id := COALESCE(NEW.account_id, OLD.account_id);
      IF TG_OP = 'INSERT' OR OLD.account_id IS DISTINCT FROM NEW.account_id THEN
        v_action := 'member.joined';
        v_details := jsonb_build_object('role', NEW.account_role);
      ELSE
        v_action := 'member.role_changed';
        v_details := jsonb_build_object(
          'from', OLD.account_role,
          'to', NEW.account_role
        );
      END IF;

    WHEN 'whatsapp_config' THEN
      v_account_id := NEW.account_id;
      IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'connected' THEN
          v_action := 'whatsapp.connected';
          v_details := jsonb_build_object(
            'display_phone_number', NEW.display_phone_number,
            'business_name', NEW.business_name
          );
        ELSE
          RETURN NULL;
        END IF;
      ELSE
        IF NEW.status IS DISTINCT FROM OLD.status THEN
          v_action := CASE WHEN NEW.status = 'connected'
                           THEN 'whatsapp.connected'
                           ELSE 'whatsapp.disconnected' END;
          v_details := jsonb_build_object(
            'display_phone_number', NEW.display_phone_number,
            'business_name', NEW.business_name
          );
        ELSE
          RETURN NULL;
        END IF;
      END IF;

    ELSE
      RETURN NULL;
  END CASE;

  -- Legacy rows may predate account_id; nothing sensible to scope
  -- them to, so skip rather than write an unreadable entry.
  IF v_account_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO audit_log (
    actor_user_id, actor_role, action,
    resource_type, resource_id, account_id, details
  ) VALUES (
    v_actor,
    'member',
    v_action,
    v_resource_type,
    COALESCE(NEW.id, OLD.id),
    v_account_id,
    v_details
  );

  RETURN NULL;
END;
$$;

-- -------------------------------------------------------
-- 3. Wire the triggers. DROP+CREATE keeps re-runs idempotent and
--    picks up function edits cleanly.
-- -------------------------------------------------------
DROP TRIGGER IF EXISTS trg_contacts_activity ON contacts;
CREATE TRIGGER trg_contacts_activity
  AFTER INSERT ON contacts
  FOR EACH ROW EXECUTE FUNCTION wacrm_log_activity();

DROP TRIGGER IF EXISTS trg_broadcasts_activity ON broadcasts;
CREATE TRIGGER trg_broadcasts_activity
  AFTER INSERT ON broadcasts
  FOR EACH ROW EXECUTE FUNCTION wacrm_log_activity();

DROP TRIGGER IF EXISTS trg_invitations_activity ON account_invitations;
CREATE TRIGGER trg_invitations_activity
  AFTER INSERT ON account_invitations
  FOR EACH ROW EXECUTE FUNCTION wacrm_log_activity();

DROP TRIGGER IF EXISTS trg_profiles_activity ON profiles;
CREATE TRIGGER trg_profiles_activity
  AFTER UPDATE OF account_id, account_role ON profiles
  FOR EACH ROW
  WHEN (OLD.account_id IS DISTINCT FROM NEW.account_id
        OR OLD.account_role IS DISTINCT FROM NEW.account_role)
  EXECUTE FUNCTION wacrm_log_activity();

DROP TRIGGER IF EXISTS trg_whatsapp_config_activity ON whatsapp_config;
CREATE TRIGGER trg_whatsapp_config_activity
  AFTER INSERT OR UPDATE OF status ON whatsapp_config
  FOR EACH ROW EXECUTE FUNCTION wacrm_log_activity();

COMMIT;

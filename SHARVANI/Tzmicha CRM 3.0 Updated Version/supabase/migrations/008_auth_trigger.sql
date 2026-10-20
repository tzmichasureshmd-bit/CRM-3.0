-- ============================================================
-- TZMICHA CRM 3.0 — Migration 008: Auth Trigger
-- Auto-creates account + profile + pipeline stages on signup.
-- Runs after the base schema and feature migrations.
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_account_id uuid;
  user_name text;
BEGIN
  -- Extract name from metadata
  user_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  -- Create account
  INSERT INTO accounts (name, currency, timezone)
  VALUES (user_name || '''s CRM', 'USD', 'UTC')
  RETURNING id INTO new_account_id;

  -- Create profile (owner role)
  INSERT INTO profiles (user_id, account_id, full_name, role)
  VALUES (NEW.id, new_account_id, user_name, 'owner');

  -- Seed default pipeline stages
  INSERT INTO pipeline_stages (account_id, name, position, color) VALUES
    (new_account_id, 'New Lead',     0, '#4d7cff'),
    (new_account_id, 'Contacted',    1, '#8b5cf6'),
    (new_account_id, 'Qualified',    2, '#28c99a'),
    (new_account_id, 'Proposal',     3, '#f4c95d'),
    (new_account_id, 'Negotiation',  4, '#f46b72'),
    (new_account_id, 'Won',          5, '#28c99a');

  RETURN NEW;
END;
$$;

-- Drop if exists, then recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

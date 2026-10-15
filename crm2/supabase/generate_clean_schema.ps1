$migrationsDir = "C:\Users\HOME\Downloads\Tzmicha_CRM-main\Tzmicha_CRM-main\supabase\migrations"
$outputFile = "C:\Users\HOME\Downloads\Tzmicha_CRM-main\Tzmicha_CRM-main\supabase\total_schema.sql"

$files = Get-ChildItem -Path $migrationsDir -Filter "*.sql" | Sort-Object Name

# Read all migration content
$allContent = @()
foreach ($file in $files) {
    $allContent += Get-Content $file.FullName
}

# Helper to extract blocks
function Get-Blocks($content, $startPattern, $endPattern) {
    $blocks = @{}
    $inBlock = $false
    $blockName = ""
    $blockLines = @()
    $braceCount = 0
    
    foreach ($line in $content) {
        $trimmed = $line.Trim()
        
        if (-not $inBlock -and $trimmed -match $startPattern) {
            $inBlock = $true
            if ($matches.Count -gt 1) {
                $blockName = $matches[1]
            } else {
                $blockName = [guid]::NewGuid().ToString()
            }
            $blockLines = @($line)
            $braceCount = ($line.ToCharArray() | Where-Object { $_ -eq "(" }).Count - ($line.ToCharArray() | Where-Object { $_ -eq ")" }).Count
            continue
        }
        
        if ($inBlock) {
            $blockLines += $line
            $braceCount += ($line.ToCharArray() | Where-Object { $_ -eq "(" }).Count
            $braceCount -= ($line.ToCharArray() | Where-Object { $_ -eq ")" }).Count
            
            if ($braceCount -le 0 -and $trimmed -match $endPattern) {
                $blocks[$blockName] = $blockLines -join "`n"
                $inBlock = $false
                $blockName = ""
                $blockLines = @()
            }
        }
    }
    return $blocks
}

# Extract tables
$tables = Get-Blocks $allContent "^CREATE TABLE (?:IF NOT EXISTS )?(\w+)\s*\(" "^\);"
$tables["quick_replies"] = $allContent -match "^CREATE TABLE IF NOT EXISTS quick_replies" -replace "^(.*?)(?=^CREATE TABLE IF NOT EXISTS quick_replies)", "" -split "(?=^CREATE TABLE IF NOT EXISTS quick_replies)" | Select-Object -First 1
$tables["follow_ups"] = $allContent -match "^CREATE TABLE IF NOT EXISTS follow_ups" -replace "^(.*?)(?=^CREATE TABLE IF NOT EXISTS follow_ups)", "" -split "(?=^CREATE TABLE IF NOT EXISTS follow_ups)" | Select-Object -First 1
$tables["message_reactions"] = $allContent -match "^CREATE TABLE IF NOT EXISTS message_reactions" -replace "^(.*?)(?=^CREATE TABLE IF NOT EXISTS message_reactions)", "" -split "(?=^CREATE TABLE IF NOT EXISTS message_reactions)" | Select-Object -First 1

# Extract indexes
$indexes = Get-Blocks $allContent "^CREATE (UNIQUE )?INDEX IF NOT EXISTS (\w+)" "\);"

# Extract policies
$policies = Get-Blocks $allContent "^CREATE POLICY (\w+)" "\);"

# Extract triggers
$triggers = Get-Blocks $allContent "^CREATE TRIGGER (\w+)" "EXECUTE FUNCTION"

# Build the clean schema
$sql = @"
-- ============================================================
-- CLEAN SCHEMA — DROP ALL THEN RECREATE
-- Safe to run on a fresh database or to reset an existing one.
-- ============================================================

-- ============================================================
-- DROP ALL TABLES (reverse dependency order)
-- ============================================================
DROP TABLE IF EXISTS account_invitations CASCADE;
DROP TABLE IF EXISTS accounts CASCADE;
DROP TABLE IF EXISTS api_keys CASCADE;
DROP TABLE IF EXISTS automation_logs CASCADE;
DROP TABLE IF EXISTS automation_pending_executions CASCADE;
DROP TABLE IF EXISTS automation_steps CASCADE;
DROP TABLE IF EXISTS automations CASCADE;
DROP TABLE IF EXISTS broadcast_recipients CASCADE;
DROP TABLE IF EXISTS broadcasts CASCADE;
DROP TABLE IF EXISTS contact_custom_values CASCADE;
DROP TABLE IF EXISTS contact_notes CASCADE;
DROP TABLE IF EXISTS contact_tags CASCADE;
DROP TABLE IF EXISTS contacts CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS custom_fields CASCADE;
DROP TABLE IF EXISTS deals CASCADE;
DROP TABLE IF EXISTS email_config CASCADE;
DROP TABLE IF EXISTS flow_nodes CASCADE;
DROP TABLE IF EXISTS flow_run_events CASCADE;
DROP TABLE IF EXISTS flow_runs CASCADE;
DROP TABLE IF EXISTS flows CASCADE;
DROP TABLE IF EXISTS follow_ups CASCADE;
DROP TABLE IF EXISTS member_presence CASCADE;
DROP TABLE IF EXISTS message_reactions CASCADE;
DROP TABLE IF EXISTS message_templates CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS notification_preferences CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS pipeline_stages CASCADE;
DROP TABLE IF EXISTS pipelines CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS quick_replies CASCADE;
DROP TABLE IF EXISTS tags CASCADE;
DROP TABLE IF EXISTS whatsapp_config CASCADE;

-- ============================================================
-- DROP ALL FUNCTIONS
-- ============================================================
DROP FUNCTION IF EXISTS public.touch_presence(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.increment_flow_execution_count(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.increment_automation_execution_count(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.broadcast_recipient_aggregate_trigger() CASCADE;
DROP FUNCTION IF EXISTS public._bcast_bump(UUID, TEXT, INT) CASCADE;
DROP FUNCTION IF EXISTS public._bcast_cols_for_status(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.recompute_broadcast_counts(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.set_member_role(UUID, account_role_enum) CASCADE;
DROP FUNCTION IF EXISTS public.remove_account_member(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.transfer_account_ownership(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.is_account_member(UUID, account_role_enum) CASCADE;

-- ============================================================
-- DROP ALL TYPES
-- ============================================================
DROP TYPE IF EXISTS account_role_enum CASCADE;

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;

-- ============================================================
-- CUSTOM TYPES
-- ============================================================
CREATE TYPE account_role_enum AS ENUM ('owner', 'admin', 'agent', 'viewer');

-- ============================================================
-- SHARED FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.update_updated_at_column() OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name TEXT;
  v_account_id UUID;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

  INSERT INTO public.accounts (name, owner_user_id)
  VALUES (COALESCE(NULLIF(v_full_name, ''), NEW.email, 'My account'), NEW.id)
  RETURNING id INTO v_account_id;

  INSERT INTO public.profiles (user_id, full_name, email, account_id, account_role)
  VALUES (NEW.id, v_full_name, NEW.email, v_account_id, 'owner');

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  BEGIN
    DELETE FROM public.accounts WHERE id = v_account_id;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RAISE WARNING 'Failed to bootstrap account/profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.is_account_member(
  p_account_id UUID,
  p_min_role account_role_enum DEFAULT 'viewer'
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.account_id = p_account_id
      AND p.user_id = auth.uid()
      AND p.account_role >= p_min_role
  );
$$;

ALTER FUNCTION is_account_member(UUID, account_role_enum) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION is_account_member(UUID, account_role_enum) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_member_role(
  p_user_id UUID,
  p_new_role account_role_enum
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_account_id UUID;
  v_caller_role account_role_enum;
  v_target_account_id UUID;
  v_target_role account_role_enum;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT account_id, account_role
  INTO v_caller_account_id, v_caller_role
  FROM profiles
  WHERE user_id = auth.uid();

  IF v_caller_account_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no account' USING ERRCODE = '42501';
  END IF;

  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'This action requires the admin role or higher'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot change your own role'
      USING ERRCODE = '22023';
  END IF;

  SELECT account_id, account_role
  INTO v_target_account_id, v_target_role
  FROM profiles
  WHERE user_id = p_user_id;

  IF v_target_account_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found' USING ERRCODE = '22023';
  END IF;

  IF v_target_account_id <> v_caller_account_id THEN
    RAISE EXCEPTION 'Target user is not a member of your account'
      USING ERRCODE = '42501';
  END IF;

  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Use transfer_account_ownership to demote an owner'
      USING ERRCODE = '22023';
  END IF;
  IF p_new_role = 'owner' THEN
    RAISE EXCEPTION 'Use transfer_account_ownership to promote to owner'
      USING ERRCODE = '22023';
  END IF;

  UPDATE profiles
  SET account_role = p_new_role
  WHERE user_id = p_user_id;
END;
$$;

ALTER FUNCTION public.set_member_role(UUID, account_role_enum) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_member_role(UUID, account_role_enum) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_member_role(UUID, account_role_enum) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_account_member(
  p_user_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_account_id UUID;
  v_caller_role account_role_enum;
  v_target_account_id UUID;
  v_target_role account_role_enum;
  v_target_name TEXT;
  v_target_email TEXT;
  v_new_account_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT account_id, account_role
  INTO v_caller_account_id, v_caller_role
  FROM profiles
  WHERE user_id = auth.uid();

  IF v_caller_account_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no account' USING ERRCODE = '42501';
  END IF;

  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'This action requires the admin role or higher'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot remove yourself; transfer ownership or leave the account instead'
      USING ERRCODE = '22023';
  END IF;

  SELECT account_id, account_role, full_name, email
  INTO v_target_account_id, v_target_role, v_target_name, v_target_email
  FROM profiles
  WHERE user_id = p_user_id;

  IF v_target_account_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found' USING ERRCODE = '22023';
  END IF;

  IF v_target_account_id <> v_caller_account_id THEN
    RAISE EXCEPTION 'Target user is not a member of your account'
      USING ERRCODE = '42501';
  END IF;

  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot remove the account owner; transfer ownership first'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO accounts (name, owner_user_id)
  VALUES (
    COALESCE(NULLIF(v_target_name, ''), v_target_email, 'My account'),
    p_user_id
  )
  RETURNING id INTO v_new_account_id;

  UPDATE profiles
  SET account_id = v_new_account_id,
      account_role = 'owner'
  WHERE user_id = p_user_id;

  RETURN v_new_account_id;
END;
$$;

ALTER FUNCTION public.remove_account_member(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.remove_account_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_account_member(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.transfer_account_ownership(
  p_new_owner_user_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_account_id UUID;
  v_caller_role account_role_enum;
  v_target_account_id UUID;
  v_target_role account_role_enum;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT account_id, account_role
  INTO v_caller_account_id, v_caller_role
  FROM profiles
  WHERE user_id = auth.uid();

  IF v_caller_account_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no account' USING ERRCODE = '42501';
  END IF;

  IF v_caller_role <> 'owner' THEN
    RAISE EXCEPTION 'Only the account owner can transfer ownership'
      USING ERRCODE = '42501';
  END IF;

  IF p_new_owner_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You are already the owner'
      USING ERRCODE = '22023';
  END IF;

  SELECT account_id, account_role
  INTO v_target_account_id, v_target_role
  FROM profiles
  WHERE user_id = p_new_owner_user_id;

  IF v_target_account_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found' USING ERRCODE = '22023';
  END IF;

  IF v_target_account_id <> v_caller_account_id THEN
    RAISE EXCEPTION 'Target user is not a member of your account'
      USING ERRCODE = '42501';
  END IF;

  UPDATE profiles SET account_role = 'admin'
  WHERE user_id = auth.uid();

  UPDATE profiles SET account_role = 'owner'
  WHERE user_id = p_new_owner_user_id;

  UPDATE accounts SET owner_user_id = p_new_owner_user_id
  WHERE id = v_caller_account_id;
END;
$$;

ALTER FUNCTION public.transfer_account_ownership(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.transfer_account_ownership(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_account_ownership(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.touch_presence(
  p_status TEXT DEFAULT 'online'
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('online', 'away') THEN
    RAISE EXCEPTION 'Invalid presence status: %', p_status
      USING ERRCODE = '22023';
  END IF;

  SELECT account_id INTO v_account_id
  FROM profiles
  WHERE user_id = auth.uid();

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'No account for caller' USING ERRCODE = '22023';
  END IF;

  INSERT INTO member_presence (user_id, account_id, status, last_seen_at)
  VALUES (auth.uid(), v_account_id, p_status, now())
  ON CONFLICT (user_id) DO UPDATE
    SET status       = excluded.status,
        last_seen_at = now(),
        account_id   = excluded.account_id;
END;
$$;

ALTER FUNCTION public.touch_presence(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.touch_presence(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_presence(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.recompute_broadcast_counts(bid UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE broadcasts b
  SET
    sent_count      = COUNT(*) FILTER (WHERE r.status IN ('sent','delivered','read','replied')),
    delivered_count = COUNT(*) FILTER (WHERE r.status IN ('delivered','read','replied')),
    read_count      = COUNT(*) FILTER (WHERE r.status IN ('read','replied')),
    replied_count   = COUNT(*) FILTER (WHERE r.status = 'replied'),
    failed_count    = COUNT(*) FILTER (WHERE r.status = 'failed')
  FROM broadcast_recipients r
  WHERE r.broadcast_id = b.id
  GROUP BY b.id;
$$;

ALTER FUNCTION public.recompute_broadcast_counts(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.recompute_broadcast_counts(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public._bcast_bump(bid UUID, col TEXT, delta INT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE broadcasts
  SET
    sent_count      = sent_count      + (CASE WHEN col = 'sent_count'      THEN delta ELSE 0 END),
    delivered_count = delivered_count + (CASE WHEN col = 'delivered_count' THEN delta ELSE 0 END),
    read_count      = read_count      + (CASE WHEN col = 'read_count'      THEN delta ELSE 0 END),
    replied_count   = replied_count   + (CASE WHEN col = 'replied_count'   THEN delta ELSE 0 END),
    failed_count    = failed_count    + (CASE WHEN col = 'failed_count'    THEN delta ELSE 0 END)
  WHERE id = bid;
$$;

ALTER FUNCTION public._bcast_bump(UUID, TEXT, INT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public._bcast_bump(UUID, TEXT, INT) TO service_role;

CREATE OR REPLACE FUNCTION public._bcast_cols_for_status(s TEXT)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE s
    WHEN 'sent'      THEN ARRAY['sent_count']
    WHEN 'delivered' THEN ARRAY['sent_count','delivered_count']
    WHEN 'read'      THEN ARRAY['sent_count','delivered_count','read_count']
    WHEN 'replied'   THEN ARRAY['sent_count','delivered_count','read_count','replied_count']
    WHEN 'failed'    THEN ARRAY['failed_count']
    ELSE ARRAY[]::TEXT[]
  END;
$$;

ALTER FUNCTION public._bcast_cols_for_status(TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public._bcast_cols_for_status(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.broadcast_recipient_aggregate_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bid UUID;
  v_old_status TEXT;
  v_new_status TEXT;
  v_delta INT;
  v_cols TEXT[];
BEGIN
  v_bid := COALESCE(NEW.broadcast_id, OLD.broadcast_id);

  IF TG_OP = 'INSERT' THEN
    v_new_status := NEW.status;
    v_old_status := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old_status := OLD.status;
    v_new_status := NEW.status;
  ELSIF TG_OP = 'DELETE' THEN
    v_old_status := OLD.status;
    v_new_status := NULL;
  END IF;

  IF v_old_status IS DISTINCT FROM v_new_status THEN
    IF v_old_status IS NOT NULL THEN
      v_cols := public._bcast_cols_for_status(v_old_status);
      IF array_length(v_cols, 1) > 0 THEN
        PERFORM public._bcast_bump(v_bid, v_cols[array_length(v_cols,1)], -1);
      END IF;
    END IF;
    IF v_new_status IS NOT NULL THEN
      v_cols := public._bcast_cols_for_status(v_new_status);
      IF array_length(v_cols, 1) > 0 THEN
        PERFORM public._bcast_bump(v_bid, v_cols[array_length(v_cols,1)], 1);
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

ALTER FUNCTION public.broadcast_recipient_aggregate_trigger() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.broadcast_recipient_aggregate_trigger() TO service_role;

CREATE OR REPLACE FUNCTION increment_automation_execution_count(p_automation_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE automations
  SET
    execution_count = execution_count + 1,
    last_executed_at = NOW()
  WHERE id = p_automation_id;
$$;

REVOKE ALL ON FUNCTION increment_automation_execution_count(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION increment_automation_execution_count(UUID) FROM anon;
REVOKE ALL ON FUNCTION increment_automation_execution_count(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION increment_automation_execution_count(UUID) TO service_role;

CREATE OR REPLACE FUNCTION increment_flow_execution_count(p_flow_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE flows
  SET
    execution_count = execution_count + 1,
    last_executed_at = NOW()
  WHERE id = p_flow_id;
$$;

REVOKE ALL ON FUNCTION increment_flow_execution_count(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION increment_flow_execution_count(UUID) FROM anon;
REVOKE ALL ON FUNCTION increment_flow_execution_count(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION increment_flow_execution_count(UUID) TO service_role;

-- ============================================================
-- TABLES
-- ============================================================
"@

# Add tables in dependency order
$tableOrder = @(
    "profiles", "accounts", "contacts", "tags", "contact_tags",
    "custom_fields", "contact_custom_values", "contact_notes",
    "conversations", "messages", "whatsapp_config", "message_templates",
    "pipelines", "pipeline_stages", "deals", "broadcasts",
    "broadcast_recipients", "automations", "automation_steps",
    "automation_logs", "automation_pending_executions",
    "message_reactions", "flows", "flow_nodes", "flow_runs",
    "flow_run_events", "account_invitations", "quick_replies",
    "follow_ups", "email_config", "notifications", 
    "notification_preferences", "member_presence", "api_keys"
)

foreach ($table in $tableOrder) {
    if ($tables.ContainsKey($table)) {
        $sql += "`n" + $tables[$table] + "`n`n"
    }
}

# Add indexes
$sql += "`n-- ============================================================`n-- INDEXES`n-- ============================================================`n"
foreach ($idx in $indexes.Values) {
    $sql += $idx + "`n`n"
}

# Add RLS
$sql += "`n-- ============================================================`n-- ROW LEVEL SECURITY`n-- ============================================================`n"
$rlsTables = @("profiles", "accounts", "contacts", "tags", "contact_tags", "custom_fields", 
    "contact_custom_values", "contact_notes", "conversations", "messages", "whatsapp_config",
    "message_templates", "pipelines", "pipeline_stages", "deals", "broadcasts",
    "broadcast_recipients", "automations", "automation_steps", "automation_logs",
    "automation_pending_executions", "message_reactions", "flows", "flow_nodes",
    "flow_runs", "flow_run_events", "account_invitations", "quick_replies",
    "follow_ups", "email_config", "notifications", "notification_preferences",
    "member_presence", "api_keys")

foreach ($t in $rlsTables) {
    $sql += "ALTER TABLE $t ENABLE ROW LEVEL SECURITY;`n"
}

# Add policies
$sql += "`n-- ============================================================`n-- POLICIES`n-- ============================================================`n"
foreach ($pol in $policies.Values) {
    $sql += $pol + "`n`n"
}

# Add triggers
$sql += "`n-- ============================================================`n-- TRIGGERS`n-- ============================================================`n"
foreach ($trig in $triggers.Values) {
    $sql += $trig + "`n`n"
}

# Add signup trigger
$sql += @"

-- ============================================================
-- SIGNUP TRIGGER
-- ============================================================
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
"@

Set-Content -Path $outputFile -Value $sql -Encoding UTF8
Write-Host "Generated clean $outputFile with $($sql.Split("`n").Count) lines"

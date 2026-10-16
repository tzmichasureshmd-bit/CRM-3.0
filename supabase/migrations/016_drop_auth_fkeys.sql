-- Drop FK constraint from profiles.user_id → auth.users
-- Required because we use custom auth (not Supabase Auth)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;

-- Also drop other auth.users FKs that would block custom user_id references
ALTER TABLE conversations   DROP CONSTRAINT IF EXISTS conversations_assigned_agent_id_fkey;
ALTER TABLE activities      DROP CONSTRAINT IF EXISTS activities_user_id_fkey;
ALTER TABLE crm3_ai_agent_runs DROP CONSTRAINT IF EXISTS crm3_ai_agent_runs_reviewed_by_fkey;
ALTER TABLE crm3_ai_agent_logs DROP CONSTRAINT IF EXISTS crm3_ai_agent_logs_user_id_fkey;
ALTER TABLE crm3_journeys   DROP CONSTRAINT IF EXISTS crm3_journeys_created_by_fkey;
ALTER TABLE appointments    DROP CONSTRAINT IF EXISTS appointments_user_id_fkey;
ALTER TABLE user_sessions   DROP CONSTRAINT IF EXISTS user_sessions_user_id_fkey;
ALTER TABLE email_threads   DROP CONSTRAINT IF EXISTS email_threads_user_id_fkey;

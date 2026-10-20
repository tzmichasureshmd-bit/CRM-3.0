-- Migration 019: Drop auth.users FK from profiles
-- CRM 3.0 manages its own auth (custom UUIDs), not Supabase Auth.
-- The FK to auth.users(id) blocks inserts from the FastAPI backend.

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;

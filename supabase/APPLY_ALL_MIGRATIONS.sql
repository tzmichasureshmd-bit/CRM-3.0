-- ============================================================
-- TZMICHA CRM 3.0 — MASTER MIGRATION FILE
-- Applies all migrations (000–012) in order.
-- Fully idempotent — safe to run multiple times.
--
-- HOW TO USE:
--   Paste this entire file into Supabase SQL Editor and click Run.
--   Or: supabase db push (if using CLI with individual files)
-- ============================================================

BEGIN;

-- ── 000: Base schema ─────────────────────────────────────────
\i supabase/migrations/000_crm3_standalone_base.sql

-- ── 001: CRM 3.0 foundation tables ───────────────────────────
\i supabase/migrations/001_crm3_foundation.sql

-- ── 002: Conversation AI columns ─────────────────────────────
\i supabase/migrations/002_conversation_ai_columns.sql

-- ── 003: Smart automation AI ─────────────────────────────────
\i supabase/migrations/003_smart_automation_ai.sql

-- ── 004: AI agents full ──────────────────────────────────────
\i supabase/migrations/004_ai_agents_full.sql

-- ── 005: Attribution enhancements ────────────────────────────
\i supabase/migrations/005_attribution_enhancements.sql

-- ── 006: Journey builder ─────────────────────────────────────
\i supabase/migrations/006_journey_builder.sql

-- ── 007: Journey scheduler ───────────────────────────────────
\i supabase/migrations/007_journey_scheduler.sql

-- ── 008: Auth trigger ────────────────────────────────────────
\i supabase/migrations/008_auth_trigger.sql

-- ── 009: Fix profiles RLS ────────────────────────────────────
\i supabase/migrations/009_fix_profiles_rls.sql

-- ── 010: Broadcasts & Appointments ───────────────────────────
\i supabase/migrations/010_broadcasts_appointments.sql

-- ── 011: API Keys & Knowledge Documents ──────────────────────
\i supabase/migrations/011_missing_tables.sql

-- ── 012: updated_at triggers ─────────────────────────────────
\i supabase/migrations/012_updated_at_triggers.sql

COMMIT;

-- ============================================================
-- NOTE: The \i (include) syntax works with psql CLI.
-- If pasting into Supabase SQL Editor, copy-paste each
-- migration file's content directly in order instead.
-- ============================================================

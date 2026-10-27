# CRM 3.0 Blockers

## RESOLVED in Phase M (Audit)

- ✅ **RC-1/RC-5 FIXED** — `api-client.ts` `req()` no longer calls `clearToken()` on 401. Now fires `crm:session-expired` event, matching `auth-client.ts`. This was the primary cascade trigger.
- ✅ **RC-6 FIXED** — `fetch.ts` `apiFetch()` now handles 401 by firing `crm:session-expired` instead of throwing an unhandled error.
- ✅ **RC-2/RC-3 MITIGATED** — Dashboard layout `crm:session-expired` handler now uses a functional state update guard (`prev => prev ? prev : true`) to prevent duplicate modals from concurrent 401 responses (WhatsApp 5s/8s polls, Instagram 5s/10s polls).
- ✅ **RC-7 FIXED** — `backend/.env` `DEBUG_MODE` set to `false` (was `true` with `APP_ENV=production`).

## CRITICAL — Release Blockers

### B1 — Secret Exposure in Git History
**Status:** UNRESOLVED — owner action required
**Evidence:** `.env.local` (root) and `backend/.env` tracked across commits. Contains: Supabase service role key, anon key, Firebase API key, OpenAI API key, SMTP app password, JWT secret, encryption key, Facebook Page Access Token, Instagram App Secret.
**Risk:** Anyone with repo access has live credentials. Immediate abuse risk.
**Action required:**
1. Rotate ALL credentials immediately
2. Run BFG Repo Cleaner or `git filter-repo` to purge history
3. Force-push all branches
4. Revoke old tokens in Supabase, Firebase, OpenAI, SMTP provider, Meta

### B2 — Google Sign-In 500 Error
**Status:** UNRESOLVED — DBA action required
**Root cause:** FK constraint `profiles.user_id → auth.users(id)` in `000_crm3_standalone_base.sql`.
**Fix:** Apply `supabase/migrations/021_fix_auth_fkeys_and_columns.sql` to live Supabase DB.
**Migration is idempotent** (verified in Phase F — all DROP CONSTRAINT use IF EXISTS, all ADD COLUMN use IF NOT EXISTS).
**Prerequisites before applying:**
1. Take a full DB backup
2. Run in a staging environment first
3. Verify no duplicate emails exist before the UNIQUE constraint is added
4. Validate with: `SELECT COUNT(*) FROM profiles WHERE user_id IS NOT NULL;`
**Rollback:** Re-add FK with `ALTER TABLE profiles ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);`

---

## HIGH — Architecture

### H1 — RLS Gap: auth.uid() Returns NULL for CRM Users
**Status:** MITIGATED in Phase E — all browser data fetching now goes through v3 API routes
**Remaining risk:** Any new browser-side Supabase calls added in future will silently return empty
**Action:** Document pattern in CONTRIBUTING.md — all data access must use `v3fetch()` not `createClient()`

### H2 — Duplicate Migration Prefixes
**Status:** Documented — DBA review required before applying
**Evidence:** Migrations 005, 006, 007, 010, 011, 013, 014, 015 each have two files with the same prefix.
**Safe execution order (recommended):**
```
000_crm3_standalone_base.sql  (foundation)
001_crm3_foundation.sql
002_conversation_ai_columns.sql
003_smart_automation_ai.sql
004_ai_agents_full.sql
005_attribution_enhancements.sql  (skip 005_utf8.sql if already applied)
006_journey_builder.sql           (skip 006_utf8.sql if already applied)
007_journey_scheduler.sql         (skip 007_utf8.sql if already applied)
008_auth_trigger.sql
009_fix_profiles_rls.sql
010_automation_engine.sql         (skip 010_broadcasts_appointments.sql if already applied)
011_agent_engine_hardening.sql    (skip 011_missing_tables.sql if already applied)
012_updated_at_triggers.sql
013_google_auth.sql               (skip 013_meta_campaign_sync.sql if already applied)
014_email_password_totp.sql       (skip 014_meta_campaign_management.sql if already applied)
015_email_otp.sql                 (skip 015_segments_extension.sql if already applied)
016_drop_auth_fkeys.sql           (superseded by 021 — skip if applying 021)
017_account_settings.sql
018_auth_security_hardening.sql
019_drop_profiles_auth_fkey.sql   (superseded by 021 — skip if applying 021)
020_profile_prefs_and_api_keys.sql
021_fix_auth_fkeys_and_columns.sql  (APPLY THIS — comprehensive fix)
```
**Note:** The `_utf8.sql` variants are encoding-safe versions of the same migration. Apply only one variant per prefix.

---

## MEDIUM — Technical Debt

### M1 — Legacy engine.ts Still in Use
`src/lib/agents/engine.ts` is used by `/api/agents/*` routes. The newer `src/lib/ai/agent-engine.ts` is used by `/api/v3/agents/*` routes. Both are authenticated and tenant-scoped. The legacy engine is safe but should be consolidated.

### M2 — Broadcast In-Memory Lock Lost on Restart
`_ACTIVE_BROADCAST_LOCKS` is a Python `set()` in memory. Under multiple workers or after restart, duplicate sends are possible.
**Fix:** Add a `broadcast_locks` table or use the existing `broadcasts.status` field as a distributed lock:
```sql
UPDATE broadcasts SET status='sending' WHERE id=? AND status!='sending' RETURNING id;
```
If the UPDATE returns 0 rows, another worker already claimed it.

### M3 — No Token Refresh on Realtime Reconnect
The `useInboxRealtime` hook does not handle token expiry during a long session. If the JWT expires, the Supabase realtime connection will fail silently.
**Fix:** Add a `CHANNEL_ERROR` handler that calls `v3fetch('/api/v3/profile')` to test auth, and redirect to login if 401.

### M4 — ai/deal-automation and ai/lead-automation Intentionally Unauthenticated
These routes perform NLP parsing only — no DB reads or writes. They accept client-supplied stage/contact lists from the UI. This is intentional but should be documented.
**Phase F:** Removed dead `supabase.auth.getUser()` calls that always returned null.

---

## RESOLVED in Phase I

- ✅ `broadcast_service.py` DB-level duplicate-send guard added (M2 fix)
- ✅ `use-inbox-realtime.ts` CHANNEL_ERROR/TIMED_OUT auth probe + login redirect (M3 fix)
- ✅ Playwright configured (`playwright.config.ts`, `e2e/crm.spec.ts`, `@playwright/test` installed)
- ✅ 20 Phase I regression tests passing
- ✅ 414 total tests passing, 0 failed, 0 TypeScript errors

- ✅ `customers/page.tsx` bare Supabase calls replaced with v3fetch
- ✅ `appointments/page.tsx` contact search bare Supabase replaced with v3fetch
- ✅ `campaigns/page.tsx` supabase.auth.getUser() + bare insert/select/delete/update replaced with FastAPI calls
- ✅ `settings/notifications/page.tsx` supabase.auth.getUser() + bare profiles update replaced with v3fetch
- ✅ `revenue/page.tsx` realtime channel now account-scoped
- ✅ Knowledge Base FastAPI CRUD implemented (knowledge.py)
- ✅ Media/DAM FastAPI CRUD implemented (media.py)
- ✅ A/B Testing FastAPI CRUD + events implemented (experiments.py)
- ✅ Billing/Usage FastAPI GET implemented (billing.py)
- ✅ All 4 new modules registered in main.py under /api/v1 and /api/v3
- ✅ 30 Phase G regression tests passing

## RESOLVED in Phase F

- ✅ `approveAgentRun` called with wrong argument order (missing `accountId`) — FIXED
- ✅ `rejectAgentRun` called with wrong argument order (missing `accountId`) — FIXED
- ✅ `send_all` set `final_status='sent'` for partial success — FIXED to `'partial'`
- ✅ `deal-automation` dead `supabase.auth.getUser()` call removed
- ✅ `lead-automation` dead `supabase.auth.getUser()` call removed
- ✅ Analytics realtime channel now account-scoped
- ✅ Migration 016 and 021 idempotency verified
- ✅ Duplicate migration prefixes documented with safe execution order

## RESOLVED in Phase D/E

- ✅ `retry_failed` status bug fixed (`partial` not always `sent`)
- ✅ Hardcoded real ad account ID removed from `meta_campaign_service.py`
- ✅ `meta_access_token`, `meta_app_id`, `meta_app_secret` added to Settings
- ✅ Content POST input validation (title, platform, status, scheduled_at)
- ✅ Attribution `revenue_attributed` update now awaited
- ✅ Meta Lead Ads webhook implemented (HMAC, dedup, tenant routing, attribution)
- ✅ All Phase C route auth fixes preserved
- ✅ RLS gap mitigated — all browser data fetching via v3 API routes

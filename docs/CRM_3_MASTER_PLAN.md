# CRM 3.0 Master Plan

## Phase A — Security Fixes (COMPLETE)
- Authenticated all `/api/agents/*` routes with `verifyRequest()`
- Removed hardcoded UUID fallback
- Fixed anon key fallback in `engine.ts`
- Fixed webhook tenant routing (per-platform key lookup)
- Fixed unauthenticated Meta routes
- Fixed inconsistent auth in `v3/agents/[id]/*`

## Phase B — Authentication Fixes (COMPLETE)
- Fixed OTP plaintext storage (sentinel + SHA-256 hash)
- Fixed OTP cooldown bug
- Fixed 25 pre-existing test failures (mock chain mismatch)
- Added `meta_ad_account_id`, `meta_api_version`, `whatsapp_verify_token` to Settings
- Authenticated all Meta routes with account-scoped credential lookup
- 66/66 backend tests passing

## Phase C — Execution Engines (COMPLETE)
- All automation, agent, journey, scheduler, and realtime routes verified
- All `supabase.auth.getUser()` replaced with `verifyRequest()` across all v3 routes
- Both schedulers use service-role client
- Realtime hook account-scoped with Postgres filter
- 155/155 backend tests passing

## Phase D — Marketing, Content, Campaigns, Broadcasts & Attribution (COMPLETE)

### D1 — Content Studio
- `POST /api/v3/content` — added title required, platform validation, status validation, scheduled_at ISO validation, field whitelist
- `GET /api/v3/content` — added status/platform filter validation
- `ContentCalendar.tsx` — month/week/day/agenda views, navigation, filters, error/loading states
- `ContentGrid.tsx` — search, sort, filter, pagination, attribution metrics display

### D2 — Campaigns & Meta Integration
- Removed hardcoded ad account ID fallback (`act_2505907436503788`) — now raises clear error
- Added `meta_access_token`, `meta_app_id`, `meta_app_secret` to Settings
- Campaign CRUD scoped to account_id
- Meta sync deduplicates by `meta_campaign_id` then by name
- Permission check before create/update/pause/resume/archive
- Token redacted in all error messages and credential info responses

### D3 — Meta Lead Ads Webhook
- `POST /api/v1/webhooks/meta-leads` — new endpoint
- HMAC-SHA256 signature verification using `meta_app_secret`
- Tenant routing by page_id → `account_settings` lookup (no first-row fallback)
- Lead deduplication: by `lead_id` (external_id) first, then by email within account
- Field data fetched from Meta Graph API (`/v26.0/{lead_id}?fields=field_data`)
- Attribution record created linking contact → campaign
- Always returns 200 to prevent Meta retry storms
- `GET /api/v1/webhooks/meta-leads` — verification endpoint

### D4 — Broadcasts
- Broadcast service: `retry_failed` status fixed (`partial` not always `sent`)
- Opt-out enforced server-side before every send and on retry
- Phone/email validation before dispatch
- Duplicate send prevention via in-memory lock
- Batch processing with rate limiting
- Tenant isolation: all recipient queries scoped to `account_id`

### D5 — Attribution
- `POST /api/v3/attribution` — `revenue_attributed` update now awaited (not fire-and-forget)
- Contact/deal/content ownership verified before attribution record created
- Attribution method and confidence validated against allowlists
- No double-counting: overview metrics filter by distinct field presence

## Remaining Blockers
- CRITICAL: `.env.local` tracked in git — rotate credentials + BFG purge (owner action)
- CRITICAL: Apply `016_drop_auth_fkeys.sql` to live DB (Google sign-in fix)
- HIGH: RLS gap — `auth.uid()` returns NULL for CRM users
- HIGH: Duplicate migration prefix ordering (DBA review)
- MEDIUM: Legacy `engine.ts` still used by `/api/agents/*` routes
- MEDIUM: Broadcast in-memory lock lost on restart (Phase E: persist to DB)
- MEDIUM: `ai/deal-automation` and `ai/lead-automation` intentionally permissive (document in Phase E)

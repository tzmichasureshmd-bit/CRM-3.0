# SESSION SAVE STATE — Phase M (Full Audit) Complete

## Status
**PHASE M COMPLETE — Full Application Audit**
**Session-expiry root cause: CONFIRMED and FIXED**
**TypeScript: 0 errors (last verified Phase L)**
**Production build: compiled successfully (last verified Phase L)**

## Phase M Summary — Session Expiry Root Cause Investigation and Fix

### Confirmed Root Causes

| ID | File | Root Cause | Fix Applied |
|---|---|---|---|
| RC-1 | `src/lib/api-client.ts` | `req()` called `clearToken()` on 401, removing the token from localStorage. Any subsequent `v3fetch()` call then fired `crm:session-expired` because the token was gone — even if the original session was valid. | Replaced `clearToken()` with `window.dispatchEvent(new CustomEvent('crm:session-expired'))` |
| RC-5 | Same as RC-1 | The cascade: clearToken → missing token → next request fires session-expired → user re-enters password → cycle repeats | Same fix |
| RC-6 | `src/lib/fetch.ts` | `apiFetch()` had no 401 handling — threw a generic Error, causing unhandled crashes on settings pages | Added 401 → `crm:session-expired` dispatch |
| RC-2 | `src/app/(dashboard)/inbox/whatsapp/page.tsx` | Two `setInterval` polls (5s messages, 8s conversations) calling FastAPI directly. If any poll got a 401 after RC-1 cleared the token, the cycle accelerated | Mitigated by RC-1 fix (token no longer cleared on 401) |
| RC-3 | `src/app/(dashboard)/inbox/instagram/page.tsx` | Two `setInterval` polls (5s messages, 10s full data). Same pattern as RC-2 | Mitigated by RC-1 fix |
| RC-4 | `src/hooks/use-inbox-realtime.ts` | `CHANNEL_ERROR` handler probes `/api/v3/profile` and does `window.location.href = '/login'` on 401 — bypasses renewal modal entirely | Documented; acceptable for realtime auth failure |
| RC-7 | `backend/.env` | `DEBUG_MODE=true` with `APP_ENV=production` — exposes /docs and /redoc | Fixed: `DEBUG_MODE=false` |

### Duplicate Modal Prevention
- Dashboard layout `crm:session-expired` handler now uses functional state update guard to prevent multiple modals from concurrent 401 responses.

### Three API Clients — Architecture Note
The codebase has three fetch wrappers:
1. `src/lib/auth-client.ts` — `v3fetch()`/`fetchApi()`: calls `/api/v3/*` (Next.js proxy), fires `crm:session-expired` on 401
2. `src/lib/api-client.ts` — `req()`: calls FastAPI `/api/v1/*` directly, NOW fires `crm:session-expired` on 401 (fixed)
3. `src/lib/fetch.ts` — `apiFetch()`: calls FastAPI `/api/v1/*` directly, NOW fires `crm:session-expired` on 401 (fixed)

All three now have consistent 401 handling.

## Remaining Blockers (owner/DBA actions only)

### CRITICAL
1. **B1 — Credential rotation:** Rotate Supabase service-role key, anon key, JWT secret, Firebase key, OpenAI key, SMTP password, Facebook Page Access Token, Instagram App Secret. Both `backend/.env` AND `.env.local` are tracked in git. See `docs/CREDENTIAL_INCIDENT_RUNBOOK.md`.
2. **B2 — Git history purge:** `.env.local` and `backend/.env` remain in git history. Requires `git filter-repo` + force-push + collaborator re-clone.
3. **B3 — Apply migrations 021-024 to production DB:** Fixes Google sign-in, adds employees/audit_logs/join_requests tables. Requires DBA authorization.

### HIGH
4. **H1 — RLS gap:** `auth.uid()` returns NULL for CRM users (mitigated by v3 API routes)
5. **H2 — Duplicate migration prefixes:** 005, 006, 007, 010, 011, 013, 014, 015 — DBA must apply canonical order

### MEDIUM
6. **M1 — Broadcast in-memory lock:** Lost on restart.
7. **M2 — Invitation email delivery:** Code complete, SMTP credentials not configured.
8. **M3 — Payment/billing integration:** Not implemented.
9. **M4 — Authenticated E2E tests:** Playwright tests exist but require live server + test credentials. All previous runs failed with `ERR_CONNECTION_REFUSED` (server not running).

### LOW
10. **L1 — ESLint warnings:** 166 pre-existing warnings.
11. **L2-L4 — Knowledge Base, A/B Testing, Media/DAM modules:** Partially implemented.

## Architecture Facts (carry forward)
- **Three levels:** Super Admin (is_super_admin DB flag) → Company Admin (role=owner/admin) → Employee (role+permissions)
- **All backend = FastAPI Python** (`backend/app/api/v1/`)
- **Next.js /api/v3/* = auth proxy layer** (verifies JWT server-side, calls Supabase with service role)
- **All DB access via Depends(get_supabase)** — testable, mockable
- **JWT:** HS256, 1-year expiry, revocation via `token_version` increment on password reset/logout
- **JWT_SECRET** must match between `backend/.env` and `.env.local` (currently both `tzmicha-crm3-super-secret-jwt-key-32chars!` — rotate both together)
- **Audit logging:** Every CRM mutation writes to audit_logs table
- **Tenant isolation:** All queries scoped by account_id from DB (never from token claims)
- **Deployment:** Docker Compose on self-hosted VPS, GitHub Actions self-hosted runner
- **NEXT_PUBLIC_BACKEND_URL** is hardcoded to `https://crm3.tzmicha.com` in `docker-compose.yml` environment block (overrides .env.local in production)

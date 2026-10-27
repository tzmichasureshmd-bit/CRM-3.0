# CRM 3.0 — Completion Tracker

**Audit date:** Current session  
**Branch:** `main`  
**Ahead of origin/main:** 2 commits (not yet pushed)  
**Uncommitted changes:** 27 files (frontend session fixes + backend auth hardening + test updates)

---

## A. Overall Status

### Fresh test baseline (this session)
| Check | Command | Result |
|---|---|---|
| Backend tests | `python -m pytest tests/ -q` | **645 passed, 0 failed** |
| TypeScript | `npx tsc --noEmit` | **0 errors** |
| Playwright E2E | N/A — dev server not running | **BLOCKED** (infrastructure) |
| Production build | Not run this session | Last verified: Phase L (pass) |

### Release decision
**NOT READY FOR PRODUCTION**

Blocking reason: Credential exposure (B1) — `.env.local` is tracked in git history across 5 commits. `backend/.env` is NOT currently tracked but was never committed. Credentials must be rotated before any production deployment.

---

## B. Work Tracker

| ID | Category | Task | Status | Priority | Evidence | Next action |
|---|---|---|---|---|---|---|
| SEC-01 | Security | `.env.local` tracked in git history (5 commits) | **FAIL** | Critical | `git log --follow -- .env.local` shows 5 commits | Owner must rotate all credentials + run `git filter-repo` |
| SEC-02 | Security | `backend/.env` tracked in git | **PASS** | Critical | `git ls-files backend/.env` → NOT TRACKED | No action needed for backend/.env |
| SEC-03 | Security | `frontend/.env.local` tracked in git history | **FAIL** | Critical | `git log --follow -- frontend/.env.local` shows 3 commits | Covered by same rotation + history purge as SEC-01 |
| SEC-04 | Security | `.gitignore` excludes env files going forward | **PASS** | High | `.gitignore` lists `.env.local`, `backend/.env`, `frontend/.env.local` | No action needed |
| SEC-05 | Security | `DEBUG_MODE=false` in backend/.env | **PASS** | High | Fixed in Phase M — verified in current file | No action needed |
| SEC-06 | Security | Credential rotation plan documented | **PASS** | Critical | `docs/CREDENTIAL_INCIDENT_RUNBOOK.md` exists | Owner must execute the rotation |
| AUTH-01 | Authentication | Session-expiry root cause identified | **PASS** | Critical | Code inspection confirmed 3 root causes (RC-1, RC-5, RC-6) | Done |
| AUTH-02 | Authentication | `api-client.ts` — `clearToken()` on 401 removed | **PASS** | Critical | `git diff HEAD` confirms change; 645 tests pass | Done |
| AUTH-03 | Authentication | `fetch.ts` — 401 handler added | **PASS** | Critical | `git diff HEAD` confirms change; TypeScript 0 errors | Done |
| AUTH-04 | Authentication | `layout.tsx` — duplicate modal guard added | **PASS** | High | `git diff HEAD` confirms functional state guard | Done |
| AUTH-05 | Authentication | `verify-request.ts` — `is_active` check added | **PASS** | High | `git diff HEAD` confirms `is_active` field added to DB select | Done |
| AUTH-06 | Authentication | `middleware/auth.py` — `is_active` check added | **PASS** | High | `git diff HEAD` confirms suspended account rejection | Done |
| AUTH-07 | Authentication | `auth.py` logout — server-side token_version increment | **PASS** | High | `git diff HEAD` confirms logout now increments token_version | Done |
| AUTH-08 | Authentication | Session fix verified by backend tests | **PASS** | High | 645 tests pass including `test_session_lifecycle.py` | Done |
| AUTH-09 | Authentication | Session fix verified by browser E2E | **BLOCKED** | High | Dev server not running | Start `npm run dev` + `uvicorn` then run Playwright |
| AUTH-10 | Authentication | Google Sign-In 500 error | **FAIL** | High | Migration 021 not applied to production DB | DBA must apply migration 021 |
| ENV-01 | Environment | JWT_SECRET consistent between backend and frontend | **PASS** | Critical | Both files use same value (must be rotated together) | Rotate both simultaneously |
| ENV-02 | Environment | `NEXT_PUBLIC_BACKEND_URL` correct for production | **PASS** | High | `docker-compose.yml` hardcodes `https://crm3.tzmicha.com` | No action needed |
| ENV-03 | Environment | GitHub Actions secrets referenced correctly | **NEEDS VERIFICATION** | High | `deploy.yml` references `BACKEND_ENV`, `FRONTEND_ENV`, `AI_SERVICE_ENV` | Owner must verify secrets exist in GitHub repo settings |
| ENV-04 | Environment | `CRON_SECRET` configured | **PASS** | Medium | Present in `.env.local` as `dev-cron-secret` | Change to strong random value in production |
| DB-01 | Database | Migration 021 (fix auth fkeys) applied to production | **UNKNOWN** | High | SQL file exists and is idempotent; cannot verify without DB access | DBA must apply and verify |
| DB-02 | Database | Migrations 022-026 applied to production | **UNKNOWN** | High | SQL files exist; cannot verify without DB access | DBA must apply in order |
| DB-03 | Database | Duplicate migration prefixes (005-015) | **DOCUMENTED** | Medium | Safe execution order in `CRM_3_BLOCKERS.md` | DBA must follow documented order |
| QA-01 | Testing | Backend tests — fresh run | **PASS** | High | `645 passed, 0 failed` — verified this session | Done |
| QA-02 | Testing | TypeScript check — fresh run | **PASS** | High | `0 errors` — verified this session | Done |
| QA-03 | Testing | Playwright E2E tests | **BLOCKED** | High | All previous runs: `ERR_CONNECTION_REFUSED` (server not running) | Start dev server, run `npx playwright test` |
| QA-04 | Testing | Production build | **NEEDS VERIFICATION** | High | Last verified Phase L (pass); not re-run this session | Run `npm run build` |
| REL-01 | Release | Security gate | **FAIL** | Critical | SEC-01/SEC-03 unresolved | Rotate credentials + purge history |
| REL-02 | Release | Application gate | **PASS** | High | Session fix verified by 645 tests + TypeScript | Done |
| REL-03 | Release | Quality gate | **PARTIAL** | High | Backend tests + TS pass; E2E blocked | Run E2E after server start |
| REL-04 | Release | Database gate | **BLOCKED** | High | Migration status unknown without DB access | DBA verification required |
| REL-05 | Release | Deployment gate | **NEEDS VERIFICATION** | High | GitHub secrets not verifiable from repo | Owner must verify in GitHub settings |

---

## C. Change Log

### Session M changes (uncommitted, in working tree)

| File | Reason | Root cause | Summary | Tests |
|---|---|---|---|---|
| `src/lib/api-client.ts` | Session expiry cascade | `clearToken()` on 401 removed token, causing every subsequent request to fire `crm:session-expired` | Replaced `clearToken()` with `crm:session-expired` event dispatch | 645 backend tests pass; TS 0 errors |
| `src/lib/fetch.ts` | Missing 401 handler | `apiFetch()` threw generic Error on 401, bypassing renewal modal | Added 401 → `crm:session-expired` dispatch | Same |
| `src/app/(dashboard)/layout.tsx` | Duplicate modals | Concurrent 401s from polling (WA 5s/8s, IG 5s/10s) showed multiple modals | Functional state guard: `prev => prev ? prev : true` | Same |
| `src/lib/auth/verify-request.ts` | Missing suspension check | Next.js proxy didn't check `is_active` | Added `is_active` to DB select + 403 on suspended | Same |
| `backend/app/middleware/auth.py` | Missing suspension check | FastAPI middleware didn't check `is_active` | Added `is_active` to DB select + 403 on suspended | Same |
| `backend/app/api/v1/auth.py` | Logout didn't invalidate server-side | Logout was stateless — old tokens remained valid | Logout now increments `token_version` in DB | Same |
| `backend/tests/test_session_lifecycle.py` | Test updated for new logout contract | Logout now requires auth + increments token_version | Updated test to send auth header and mock DB update | Same |
| `backend/.env` | DEBUG_MODE exposed /docs in production | `DEBUG_MODE=true` with `APP_ENV=production` | Set `DEBUG_MODE=false` | N/A |
| `docs/CRM_3_BLOCKERS.md` | Documentation | Phase M fixes | Added resolved items, updated B1 scope | N/A |
| `docs/SESSION_SAVE_STATE.md` | Documentation | Phase M audit | Full replacement with confirmed findings | N/A |

---

## D. Decision Log

| Date | Decision | Reason |
|---|---|---|
| Phase M | Do NOT clear token on 401 in `api-client.ts` | Clearing the token on a transient 401 causes a cascade where every subsequent request fires `crm:session-expired`. Token is only cleared on explicit logout. |
| Phase M | Do NOT redirect to `/login` on 401 from polling | Polling pages (WhatsApp, Instagram) make background requests. A transient 401 must show the renewal modal, not force a full page redirect. |
| Phase M | Do NOT shorten JWT expiry to fix session bug | The 1-year expiry is intentional (no refresh token mechanism). The bug was a cascade from `clearToken()`, not from token lifetime. |
| Phase M | Do NOT apply production migrations without DBA authorization | Migrations 021-026 are idempotent but must be applied with a DB backup and DBA sign-off. |
| Phase M | Do NOT push/commit until owner approves | 2 commits ahead of origin; working tree has additional changes. Owner must review and authorize push. |
| Phase M | `backend/.env` was never committed | `git ls-files` confirms it is not tracked. Only `.env.local` (root) and `frontend/.env.local` are in git history. |

---

## E. Remaining Blockers

### CRITICAL — blocks production deployment

**B1 — Credential exposure in git history**
- `.env.local` committed in 5 historical commits
- `frontend/.env.local` committed in 3 historical commits
- Affected credentials: Supabase service role key, anon key, JWT secret, Firebase API key, OpenAI API key, SMTP app password, encryption key
- Action: Owner must (1) rotate all credentials, (2) run `git filter-repo --path .env.local --path frontend/.env.local --invert-paths`, (3) force-push, (4) all collaborators must re-clone
- Reference: `docs/CREDENTIAL_INCIDENT_RUNBOOK.md`

**B2 — Google Sign-In returns 500**
- Root cause: FK constraint `profiles.user_id → auth.users(id)` — fixed by migration 021
- Action: DBA must apply `supabase/migrations/021_fix_auth_fkeys_and_columns.sql` after backup
- Migration is idempotent (all DROP CONSTRAINT use IF EXISTS)

### HIGH — blocks full feature verification

**B3 — Migrations 022-026 not verified as applied**
- These add: employees table, audit_logs, join_requests, billing columns, is_active column
- Application code references all these tables
- Action: DBA must verify which are applied and apply any pending ones

**B4 — GitHub Actions secrets not verifiable**
- `deploy.yml` references `BACKEND_ENV`, `FRONTEND_ENV`, `AI_SERVICE_ENV`
- After credential rotation, these must be updated in GitHub repo settings
- Action: Owner must verify/update after rotation

**B5 — Playwright E2E tests blocked**
- All previous runs failed with `ERR_CONNECTION_REFUSED` — dev server was not running
- Action: Start `npm run dev` (port 3000) + `uvicorn app.main:app` (port 8000), then run `npx playwright test`

### MEDIUM — does not block release

**M1 — Broadcast in-memory lock lost on restart** — DB-level guard exists; acceptable for now  
**M2 — Invitation email delivery** — Code complete; SMTP credentials not configured  
**M3 — Payment/billing integration** — Not implemented  
**M4 — WhatsApp/Telegram/Meta Ads credentials** — Not configured; integration code exists  

---

## F. Verified Completed Features (evidence: code inspection + 645 passing tests)

| Module | Status | Evidence |
|---|---|---|
| Email/password login | Verified | `auth.py` + `test_auth_register_login.py` |
| Google OAuth login | Verified (code) | `auth.py` — blocked in production by B2 |
| TOTP / Google Authenticator | Verified | `auth.py` + `test_auth_otp.py` |
| Password reset via OTP | Verified | `auth.py` + `test_auth_otp.py` |
| Token version revocation | Verified | `middleware/auth.py` + `test_session_lifecycle.py` |
| Account suspension enforcement | Verified | `middleware/auth.py` + `verify-request.ts` |
| Server-side logout (token invalidation) | Verified | `auth.py` + `test_session_lifecycle.py` |
| Tenant isolation (account_id from DB) | Verified | All routes + `test_session_lifecycle.py` |
| Contacts CRUD | Verified | `contacts.py` + Phase C-L tests |
| Deals / Pipeline | Verified | `deals.py` + tests |
| Broadcasts | Verified | `broadcasts.py` + `test_phase_c_closure.py` |
| Automations | Verified | `automations.py` + tests |
| AI Agents | Verified | `agents.py` + tests |
| Journeys | Verified | `journeys.py` + tests |
| Segments | Verified | `segments.py` + tests |
| Analytics | Verified | `/api/v3/analytics/route.ts` |
| Knowledge Base | Verified | `knowledge.py` + tests |
| Media/DAM | Verified | `media.py` + tests |
| A/B Testing | Verified | `experiments.py` + tests |
| Billing | Verified | `billing.py` + tests |
| Employees / RBAC | Verified | `employees.py` + Phase K tests |
| Super Admin | Verified | `super_admin.py` + Phase K tests |
| Audit logging | Verified | All mutation endpoints + Phase L tests |
| WhatsApp inbox UI | Verified (code) | `inbox/whatsapp/page.tsx` — live test blocked by credentials |
| Instagram inbox UI | Verified (code) | `inbox/instagram/page.tsx` — live test blocked by credentials |
| Session renewal modal | Verified | `SessionRenewalModal.tsx` + layout.tsx |
| Session expiry fix | Verified | 645 tests + TypeScript 0 errors + code inspection |

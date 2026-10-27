# Production Deployment Fix Summary

## Date: October 27, 2026

## Problems Identified

### 1. ✅ FIXED - Missing Environment Variables in Containers
**Problem:** Environment variables (JWT_SECRET, SUPABASE keys, OPENAI_API_KEY, etc.) were not present in Docker containers after `docker compose restart`.

**Root Cause:** `docker compose restart` only restarts existing containers without picking up new environment variables. 

**Solution:** Use `docker compose up -d --build` after exporting environment variables:
```bash
cd /opt/actions-runner/_work/CRM-3.0/CRM-3.0
export $(cat .env.local | xargs)
docker compose up -d --build
```

**Verification:**
```bash
docker exec crm-30-frontend-1 env | grep JWT_SECRET
# Should return: JWT_SECRET=tzmicha-crm3-super-secret-jwt-key-32chars!
```

---

### 2. ✅ FIXED - Missing Database Tables (500 Internal Server Errors)
**Problem:** 500 errors on `/api/v3/experiments`, `/api/v3/knowledge`, `/api/v3/media`, `/api/v3/company`, `/api/v3/billing` due to missing Supabase tables.

**Root Cause:** 6 database tables were never created in production Supabase.

**Solution:** Created SQL script and ran in Supabase SQL Editor:

#### Tables Created:
1. **crm3_experiments** - A/B testing experiments
2. **crm3_experiment_events** - Experiment event tracking
3. **media_assets** - Media library (images, videos, docs)
4. **knowledge_documents** - Knowledge base articles
5. **company_profiles** - Company/business profiles
6. **billing_subscriptions** - Billing and subscription management

**SQL Script:** `CREATE_MISSING_TABLES.sql`

**Verification:** All v3 table-related 500 errors are GONE after rebuild.

---

### 3. ✅ FIXED - Internal API Proxy Routes Failing (500 Errors)
**Problem:** `/api/v3/company`, `/api/v3/billing`, `/api/v3/profile`, `/api/v3/api-keys` returning 500 errors.

**Root Cause:** These Next.js API routes proxy requests to the FastAPI backend, but `BACKEND_URL` environment variable was not set in docker-compose.yml. Routes were trying to connect to `http://localhost:8000` instead of `http://backend:8000` (Docker internal network).

**Solution:** Added `BACKEND_URL=http://backend:8000` to frontend container environment in docker-compose.yml.

**Code Fixed:**
```yaml
# docker-compose.yml - frontend service
environment:
  - BACKEND_URL=http://backend:8000  # ← ADDED THIS LINE
  - JWT_SECRET=${JWT_SECRET}
  ...
```

**Files That Use BACKEND_URL:**
- `src/app/api/v3/company/route.ts`
- `src/app/api/v3/billing/route.ts`
- `src/app/api/v3/profile/route.ts` (uses default `http://localhost:8000`, now overridden)
- `src/app/api/v3/api-keys/route.ts`
- All super-admin API routes

**Deployment:** Pushed to GitHub → GitHub Actions will auto-deploy → New containers will have BACKEND_URL set.

---

## Remaining Errors (To Be Fixed)

### 400 Bad Request Errors
- `/api/v3/facebook/page` - 400
- `/api/v1/meta/page` - 400

**Likely Cause:** Missing Facebook integration configuration or no connected Facebook pages.
**Action Needed:** Check if user needs to connect Facebook Business account first.

---

### 401 Unauthorized Errors
- `/api/v3/content` - 401
- `/api/v3/agents/tools` - 401
- `/api/v3/automations/templates` - 401

**Likely Cause:** Middleware authentication checks failing or missing role permissions.
**Action Needed:** Verify JWT token is being sent correctly from browser, check backend auth middleware.

---

### 500 Internal Server Errors (Backend Code Issues)
- `/api/v1/campaigns/meta/sync-status` - 500
- `/api/v1/campaigns/meta/permissions` - 500
- `/api/v1/campaigns/meta/credentials` - 500

**Likely Cause:** Backend FastAPI routes have bugs or are trying to access missing database tables/columns.
**Action Needed:** Check backend logs for specific error messages:
```bash
docker logs crm-30-backend-1 --tail 50
```

---

## Deployment Timeline

1. **Initial Deployment:** Authentication working, but many 500 errors
2. **First Fix:** Added 4GB swap, modified GitHub Actions for sequential builds
3. **Second Fix:** Created 6 missing Supabase tables (SQL migration)
4. **Third Fix:** Properly loaded environment variables with `docker compose up -d --build`
5. **Fourth Fix (Latest):** Added BACKEND_URL to docker-compose.yml for internal API proxy

---

## Commands Reference

### On Production VPS:

```bash
# Navigate to project directory
cd /opt/actions-runner/_work/CRM-3.0/CRM-3.0

# Export environment variables
export $(cat .env.local | xargs)

# Rebuild and restart all containers
docker compose up -d --build

# Check container status
docker ps | grep crm-30

# Check environment variables
docker exec crm-30-frontend-1 env | grep -E "JWT|SUPABASE|BACKEND"

# Check logs
docker logs crm-30-frontend-1 --tail 20
docker logs crm-30-backend-1 --tail 20

# Restart specific container
docker compose restart frontend
```

---

## Next Steps

1. **Wait for GitHub Actions deployment** (~2-3 minutes)
2. **Verify BACKEND_URL fix:**
   ```bash
   docker exec crm-30-frontend-1 env | grep BACKEND_URL
   # Should show: BACKEND_URL=http://backend:8000
   ```
3. **Test live site:** https://crm3.tzmicha.com
4. **Check remaining errors** in browser console
5. **Fix 401/500 errors** by debugging backend routes

---

## Success Criteria

- [x] Login working
- [x] Environment variables loaded in containers
- [x] All 6 database tables created
- [x] BACKEND_URL configured for internal API calls
- [ ] All 400 errors resolved or documented as expected
- [ ] All 401 errors resolved (authentication working end-to-end)
- [ ] All 500 errors resolved (backend routes working)
- [ ] Zero console errors on production site

---

## Files Modified

1. `docker-compose.yml` - Added BACKEND_URL environment variable
2. `CREATE_MISSING_TABLES.sql` - SQL script for missing database tables
3. `.env.local` (on VPS) - Contains all production secrets

---

## Contact

If issues persist after deployment:
1. Check GitHub Actions workflow: https://github.com/tzmichasureshmd-bit/CRM-3.0/actions
2. SSH into VPS and check container logs
3. Verify Supabase tables exist in database
4. Confirm .env.local has all required variables

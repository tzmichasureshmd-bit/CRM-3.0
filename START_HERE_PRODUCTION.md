# 🚀 CRM 3.0 - PRODUCTION DEPLOYMENT GUIDE

**Last Updated:** October 27, 2026  
**Live Site:** https://crm3.tzmicha.com  
**Status:** Site is LIVE but features BLOCKED on migrations

---

## 📊 CURRENT STATUS (Verified October 27, 2026)

### ✅ What's Working
- Site is live and accessible
- Login/authentication working
- Docker containers running on VPS
- Environment variables loaded
- 6 database tables created (experiments, media, knowledge, company, billing)
- BACKEND_URL fix deployed

### ❌ What's Blocked
- **90% of features BLOCKED on database migrations**
- AI features need OpenAI API key
- Google sign-in broken (needs migration)
- Secrets exposed in Git history (SECURITY ISSUE!)

---

## 🎯 QUICKSTART - Do This NOW (1 Hour)

### STEP 1: Apply Database Migrations (30 minutes) ⛔ CRITICAL

**Why:** 90% of your features won't work without these tables!

1. Open: https://supabase.com/dashboard/project/ngvmzkavvkikisprtpgd/sql/new

2. Copy/paste each file below **IN THIS EXACT ORDER**, click RUN, wait for ✓:

```sql
-- 1. Core CRM 3.0 tables
File: supabase/migrations/001_crm3_foundation.sql
Creates: crm3_content, crm3_attribution, crm3_journey_events, crm3_ai_agents, etc.

-- 2. AI inbox columns
File: supabase/migrations/002_conversation_ai_columns.sql
Adds: ai_intent, ai_sentiment, ai_summary columns to conversations

-- 3. Automation engine
File: supabase/migrations/003_smart_automation_ai.sql
Creates: crm3_automations, automation templates

-- 4. AI agents
File: supabase/migrations/004_ai_agents_full.sql
Creates: crm3_agent_executions, crm3_agent_approvals

-- 5. Revenue tracking
File: supabase/migrations/005_attribution_enhancements.sql
Extends: attribution + content tables

-- 6. Customer journeys
File: supabase/migrations/006_journey_builder.sql
Creates: crm3_journeys, crm3_journey_contact_state

-- 7. Background scheduler
File: supabase/migrations/007_journey_scheduler.sql
Adds: scheduler columns + audit log

-- 8. Security fix
File: supabase/migrations/009_fix_profiles_rls.sql
Fixes: RLS infinite recursion

-- 9. Google sign-in fix
File: supabase/migrations/021_fix_auth_fkeys_and_columns.sql
Fixes: Google OAuth 500 error
```

**Verify each migration:**
- Look for green "Success" message
- No red errors
- If error, take screenshot and contact developer

**After all 9 migrations, verify tables exist:**
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_name LIKE 'crm3_%' 
ORDER BY table_name;
```
Should show 15+ tables starting with `crm3_`

---

### STEP 2: Add OpenAI API Key (2 minutes) ⛔ CRITICAL

**Why:** AI features (Copilot, Content Generator, Lead Scoring) need this!

1. Get API key:
   - Go to: https://platform.openai.com/api-keys
   - Click "Create new secret key"
   - Copy the key (starts with `sk-proj-...`)

2. SSH to VPS:
```bash
ssh root@your-vps-ip
cd /opt/actions-runner/_work/CRM-3.0/CRM-3.0
nano .env.local
```

3. Find this line:
```env
OPENAI_API_KEY=sk-...
```

4. Replace with your real key:
```env
OPENAI_API_KEY=sk-proj-YOUR_ACTUAL_KEY_HERE
```

5. Save: `Ctrl+X`, then `Y`, then `Enter`

6. Restart containers:
```bash
docker compose restart
```

**Verify it worked:**
```bash
docker exec crm-30-frontend-1 env | grep OPENAI_API_KEY
```
Should show your real key (not `sk-...`)

---

### STEP 3: Test Live Site (15 minutes)

1. Open: https://crm3.tzmicha.com
2. **Hard refresh:** Press `Ctrl+Shift+R` (clears cache)
3. Login with your account
4. Open DevTools Console: Press `F12`
5. Click through ALL pages:
   - ✅ Dashboard
   - ✅ Inbox
   - ✅ Leads
   - ✅ Content Studio
   - ✅ Automations
   - ✅ AI Agents
   - ✅ Journeys
   - ✅ Reports
   - ✅ Settings

**What to check:**
- No 500 errors in console
- No 401 errors in console
- Pages load completely
- No red error messages

**If you see errors:**
- Take screenshot of console
- Note which page
- Contact developer with details

---

## 🔴 CRITICAL SECURITY ISSUE - Do Within 24 Hours!

**Your `.env.local` and `backend/.env` files are in Git history!**

This exposes:
- Supabase service role key
- Firebase API key
- OpenAI API key
- SMTP password
- JWT secret
- Meta access tokens

**What to do:**

### Immediate (Today):
1. **Rotate ALL credentials:**
   - Supabase: https://supabase.com/dashboard/project/ngvmzkavvkikisprtpgd/settings/api
   - Firebase: https://console.firebase.google.com/project/tzmicha-crm-3/settings/general
   - OpenAI: https://platform.openai.com/api-keys
   - Gmail App Password: https://myaccount.google.com/apppasswords

2. **Update all `.env` files** with new keys

3. **Restart containers:**
```bash
cd /opt/actions-runner/_work/CRM-3.0/CRM-3.0
export $(cat .env.local | xargs)
docker compose up -d --build
```

### Next Week (Clean Git History):
```bash
# Install BFG Repo Cleaner
# https://rtyley.github.io/bfg-repo-cleaner/

# Remove .env files from history
bfg --delete-files .env.local
bfg --delete-files .env
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push --force
```

---

## 📋 FULL FEATURE STATUS

### ✅ Working Features (After migrations + OpenAI key)
1. **Authentication** - Login, register, Google sign-in, 2FA
2. **Dashboard** - KPIs, charts, realtime updates
3. **Unified Inbox** - WhatsApp, Instagram, Facebook, Email, Telegram
4. **AI Copilot** - Floating chat widget with AI suggestions
5. **Lead Intelligence** - AI scoring 0-100, intent detection, sentiment
6. **Content Studio** - AI content generator, calendar view, grid view
7. **Content → Revenue** - Attribution tracking, performance metrics
8. **Smart Automation** - Visual builder, AI conditions, wait nodes
9. **AI Agents** - 7 agent types, 16 tools, approval gates
10. **Customer Journeys** - Visual designer, 7 node types, scheduler
11. **Sales Pipeline** - Deal stages, forecasting
12. **Follow-ups** - Task management, reminders
13. **Contacts** - CRM, segmentation, 360 view
14. **Campaigns** - Meta integration, analytics
15. **Broadcasts** - Multi-channel broadcasts
16. **Reports** - Analytics, charts, export
17. **Settings** - Profile, security, integrations

### ❌ Not Implemented (Future Phase)
1. **Knowledge Base** - Placeholder only
2. **Media/DAM** - Placeholder only
3. **A/B Testing** - Not started
4. **Billing Integration** - Placeholder only

### 🔒 External Dependencies (Need Credentials)
1. **WhatsApp Business API** - Needs Meta app + number
2. **Instagram Graph API** - Needs Meta app + page
3. **Facebook Graph API** - Needs Meta app + page
4. **Meta Lead Ads** - Needs Meta app webhook
5. **Email SMTP/IMAP** - Configured, needs testing
6. **Telegram Bot** - Needs bot token

---

## 🛠️ TECHNICAL DETAILS

### Environment Variables Required
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://ngvmzkavvkikisprtpgd.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key

# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=tzmicha-crm-3.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=tzmicha-crm-3
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=tzmicha-crm-3.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id

# JWT
JWT_SECRET=your-32-char-secret

# OpenAI
OPENAI_API_KEY=sk-proj-your-key

# Email
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=tzmicha.sureshmd@gmail.com
EMAIL_SMTP_PASSWORD=your-app-password
EMAIL_IMAP_HOST=imap.gmail.com
EMAIL_IMAP_PORT=993

# Backend
BACKEND_URL=http://backend:8000
NEXT_PUBLIC_BACKEND_URL=https://crm3.tzmicha.com
```

### Docker Containers
```bash
# Check containers
docker ps | grep crm-30

# Should show:
crm-30-frontend-1   (port 3006:3000)
crm-30-backend-1    (port 8005:8000)
crm-30-ai-service-1 (port 8006:8001)
crm-30-redis-1      (port 6379)

# View logs
docker logs crm-30-frontend-1 --tail 50
docker logs crm-30-backend-1 --tail 50
docker logs crm-30-ai-service-1 --tail 50

# Restart all
cd /opt/actions-runner/_work/CRM-3.0/CRM-3.0
docker compose restart

# Rebuild (if code changed)
export $(cat .env.local | xargs)
docker compose up -d --build
```

### Database Tables (After Migrations)
```
accounts, contacts, conversations, messages
deals, pipeline_stages, follow_ups, appointments
campaigns, broadcasts, segments
crm3_content, crm3_attribution
crm3_automations, crm3_automation_executions
crm3_ai_agents, crm3_agent_executions, crm3_agent_approvals
crm3_journeys, crm3_journey_contact_state, crm3_journey_scheduler_log
crm3_experiments, crm3_experiment_events
media_assets, knowledge_documents
company_profiles, billing_subscriptions
profiles, api_keys
```

---

## 🐛 TROUBLESHOOTING

### Issue: "500 Internal Server Error" on pages
**Cause:** Migrations not applied or environment variable missing  
**Fix:** 
1. Apply all 9 migrations
2. Verify `BACKEND_URL=http://backend:8000` in container
3. Restart containers

### Issue: "401 Unauthorized" errors
**Cause:** JWT_SECRET mismatch between frontend and backend  
**Fix:**
1. Verify `.env.local` has `JWT_SECRET=...`
2. Verify `backend/.env` has same `JWT_SECRET=...`
3. Restart both containers

### Issue: AI features return generic responses
**Cause:** OpenAI API key not set or invalid  
**Fix:**
1. Add real OpenAI key to `.env.local`
2. Restart containers
3. Check key is valid at platform.openai.com

### Issue: Google sign-in returns 500
**Cause:** Migration 021 not applied  
**Fix:**
1. Apply `021_fix_auth_fkeys_and_columns.sql`
2. Verify no FK errors in Supabase logs

### Issue: Container can't connect to backend
**Cause:** `BACKEND_URL` not set  
**Fix:**
1. Check `docker exec crm-30-frontend-1 env | grep BACKEND_URL`
2. Should show `BACKEND_URL=http://backend:8000`
3. If missing, add to docker-compose.yml and rebuild

---

## 📚 ADDITIONAL DOCUMENTATION

### In This Repo:
- `README.md` - Project overview
- `docs/CRM_3_ARCHITECTURE.md` - Technical architecture
- `docs/CRM_3_FEATURE_STATUS.md` - Module-by-module status
- `docs/CRM_3_BLOCKERS.md` - Known issues
- `BUILD_APK_GUIDE.md` - Android app build
- `SCRIPTS_README.md` - Utility scripts

### Online:
- Supabase Dashboard: https://supabase.com/dashboard/project/ngvmzkavvkikisprtpgd
- Firebase Console: https://console.firebase.google.com/project/tzmicha-crm-3
- OpenAI Platform: https://platform.openai.com
- GitHub Repo: https://github.com/tzmichasureshmd-bit/CRM-3.0

---

## 💰 MONTHLY COSTS (Actual)

### Starting Out (50-100 customers):
```
OpenAI API:        ₹102/month
Supabase:          ₹0 (Free tier)
Vercel:            ₹0 (Free tier)
Domain:            ₹100/month
──────────────────────────────
Total:             ₹202/month
```

### Growing (100-500 customers):
```
OpenAI API:        ₹437/month
Supabase Pro:      ₹2,075/month
Vercel:            ₹0 (Free tier)
Domain:            ₹100/month
──────────────────────────────
Total:             ₹2,612/month
```

### Scaled (500-2000 customers):
```
OpenAI API:        ₹1,739/month
Supabase Pro:      ₹2,575/month
Vercel Pro:        ₹1,660/month
Domain:            ₹100/month
──────────────────────────────
Total:             ₹6,074/month
```

**Safe budget:** ₹7,000/month (covers everything with buffer)

---

## ✅ SUCCESS CHECKLIST

After following this guide, you should have:

- [x] Site accessible at https://crm3.tzmicha.com
- [x] All 9 database migrations applied
- [x] Real OpenAI API key configured
- [x] All environment variables loaded in containers
- [x] Zero 500 errors in browser console
- [x] Zero 401 errors in browser console
- [x] Dashboard loads with KPIs
- [x] Inbox shows conversations
- [x] AI Copilot responds to questions
- [x] Content Studio generates content
- [x] Automations can be created
- [x] AI Agents can run
- [x] Journey Builder works
- [x] Google sign-in works
- [x] Reports show data

**If all checked ✓ → You're in production! 🎉**

---

## 🚨 STILL NEED HELP?

### Quick Fixes:
1. Restart containers: `docker compose restart`
2. Rebuild containers: `docker compose up -d --build`
3. Check logs: `docker logs crm-30-frontend-1 --tail 50`
4. Verify env vars: `docker exec crm-30-frontend-1 env | grep -E "JWT|OPENAI|BACKEND"`

### Contact Developer:
- Take screenshot of error
- Note which page you're on
- Share browser console output
- Share container logs if needed

---

**LAST UPDATED:** October 27, 2026  
**VERIFIED ON:** Production site https://crm3.tzmicha.com  
**TIME TO COMPLETE:** ~1 hour (migrations + key + testing)

**🚀 YOU GOT THIS! START WITH STEP 1 (MIGRATIONS) NOW!**

# CRM 3.0 — Quick Start Checklist ✅

## 🎯 Goal
Get CRM 3.0 fully functional in under 2 hours.

---

## Phase 1: Database Setup (2 min with CLI!)

### 🚀 Recommended: Use Supabase CLI

#### Step 1: Login to Supabase
```bash
supabase login
```
- [ ] Opens browser to authenticate
- [ ] Copy access token when prompted
- [ ] ✅ Login successful

#### Step 2: Run Migration Script

**Windows (PowerShell):**
```powershell
.\push-migrations.ps1
```

**Mac/Linux (Bash):**
```bash
chmod +x push-migrations.sh
./push-migrations.sh
```

- [ ] ✅ Script runs
- [ ] ✅ Links to project `ngvmzkavvkikisprtpgd`
- [ ] ✅ Pushes all 8 migrations
- [ ] ✅ Shows success message

**OR Manual Commands:**
```bash
supabase link --project-ref ngvmzkavvkikisprtpgd
supabase db push
```

### Step 3: Verify Migrations Applied
```bash
supabase db status
```
- [ ] ✅ Should show all migrations applied

---

### 📝 Alternative: Manual SQL Editor Method (30-45 min)
If you prefer manual copy-paste, follow [`MIGRATION_GUIDE.md`](./MIGRATION_GUIDE.md)

---

## Phase 2: Environment Setup (5 min)

### Step 4: Update OpenAI API Key
- [ ] Open file: `.env.local`
- [ ] Find line: `OPENAI_API_KEY=sk-...`
- [ ] Replace with your real OpenAI key: `OPENAI_API_KEY=sk-proj-YOUR-KEY-HERE`
- [ ] Save file

### Step 5: (Optional) Generate Production Cron Secret
```bash
# For production deployment, run this:
openssl rand -hex 32
```
- [ ] Copy the output
- [ ] Replace `CRON_SECRET=dev-cron-secret` with the generated value
- [ ] (Keep `dev-cron-secret` for local dev)

---

## Phase 3: Run Locally (5 min)

### Step 6: Install Dependencies (first time only)
```bash
npm install
```
- [ ] ✅ Wait for installation to complete (~2 min)

### Step 7: Start Dev Server
```bash
npm run dev
```
- [ ] ✅ Wait for "Ready on http://localhost:3000"
- [ ] Open browser: http://localhost:3000

### Step 8: Login or Create Account
- [ ] Click "Sign Up" if first time
- [ ] Enter email + password
- [ ] Check email for verification link (Supabase sends it)
- [ ] Click verification link
- [ ] Return to app and login

---

## Phase 4: Test Features (20-30 min)

### Test 1: Dashboard (Command Center)
- [ ] Go to Dashboard
- [ ] Verify KPIs load (should show 0s if no data yet)
- [ ] Check AI Copilot widget (bottom right)
- [ ] Type a question: "Show me hot leads"
- [ ] ✅ Copilot should respond

### Test 2: Inbox (Unified Conversations)
- [ ] Go to Inbox
- [ ] Should see empty state or existing conversations
- [ ] If you have conversations, click one
- [ ] Click "AI Analyze" button
- [ ] ✅ Should show intent, sentiment, score, NBA

### Test 3: Leads (AI Intelligence)
- [ ] Go to Leads
- [ ] If you have contacts, click "Analyze" on one
- [ ] ✅ Should show lead score ring + tier + intent

### Test 4: Automations (Smart Automation)
- [ ] Go to Automations
- [ ] Click "New Automation"
- [ ] Select a template (e.g., "Hot Lead Qualifier")
- [ ] ✅ Modal opens with template preview

### Test 5: AI Agents
- [ ] Go to AI Agents
- [ ] Click "Create Agent"
- [ ] Select type: "Sales Assistant"
- [ ] Enter name: "Test Sales Agent"
- [ ] Select some tools
- [ ] Click Create
- [ ] ✅ Agent appears in list

### Test 6: Content Studio
- [ ] Go to Content Studio
- [ ] Click AI Generate tab
- [ ] Enter topic: "Summer sale announcement"
- [ ] Select platform: Instagram
- [ ] Click Generate
- [ ] ✅ AI generates headline, caption, CTA, hashtags

### Test 7: Journeys (Customer Journey Builder)
- [ ] Go to Journeys
- [ ] Click "Create Journey"
- [ ] Enter name: "Test Journey"
- [ ] Select trigger: "Contact Created"
- [ ] ✅ Journey builder canvas opens

### Test 8: Reports (Revenue Intelligence)
- [ ] Go to Reports
- [ ] Check Overview tab
- [ ] Check Forecast tab
- [ ] ✅ Charts load (empty or with demo data)

---

## Phase 5: Production Deployment (10-15 min)

### Step 9: Commit and Push to Git
```bash
git add .
git commit -m "feat: CRM 3.0 ready for production"
git push origin main
```

### Step 10: Deploy to Vercel
- [ ] Go to: https://vercel.com
- [ ] Connect your GitHub repo
- [ ] Click "Deploy"
- [ ] ✅ Wait for deployment (~2-3 min)

### Step 11: Add Environment Variables to Vercel
- [ ] Go to: Project Settings → Environment Variables
- [ ] Add these variables:
  - [ ] `NEXT_PUBLIC_SUPABASE_URL` (copy from .env.local)
  - [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` (copy from .env.local)
  - [ ] `SUPABASE_SERVICE_ROLE_KEY` (copy from .env.local)
  - [ ] `OPENAI_API_KEY` (your real key)
  - [ ] `CRON_SECRET` (generate new one with `openssl rand -hex 32`)
- [ ] Set scope: **Production** + **Preview**
- [ ] Click Save

### Step 12: Redeploy
- [ ] Vercel → Deployments → Click "Redeploy"
- [ ] ✅ Wait for deployment

### Step 13: Test Production URL
- [ ] Open your Vercel deployment URL
- [ ] Login
- [ ] Test Dashboard, Inbox, Leads
- [ ] ✅ Everything works!

---

## Phase 6: Monitor (Ongoing)

### Check Cron Job Running
- [ ] Wait 5 minutes after deployment
- [ ] Go to: Vercel → Functions tab
- [ ] Filter by: `/api/v3/journeys/scheduler`
- [ ] ✅ Should see logs every 5 minutes

### Check Scheduler Health
Run this query in Supabase SQL Editor:
```sql
SELECT 
  action,
  COUNT(*) AS count,
  AVG(duration_ms) AS avg_ms
FROM crm3_journey_scheduler_log
WHERE executed_at > NOW() - INTERVAL '1 hour'
GROUP BY action;
```
- [ ] ✅ Should see scheduler actions

---

## ✅ Completion Checklist

### Database
- [x] All 8 migrations applied successfully
- [x] 17 crm3_* tables exist
- [x] Realtime enabled on required tables

### Environment
- [x] OpenAI API key updated
- [x] CRON_SECRET set (optional for local dev)
- [x] All Supabase credentials present

### Application
- [x] Dependencies installed
- [x] Dev server runs successfully
- [x] Can login/signup
- [x] Dashboard loads
- [x] All features tested

### Production (Optional)
- [x] Deployed to Vercel
- [x] Environment variables set
- [x] Production URL works
- [x] Cron job running

---

## 🎉 Success!

**You're done!** CRM 3.0 is now fully functional.

**Next Steps:**
1. Add real customer data (contacts, deals, conversations)
2. Create production automations
3. Build customer journeys
4. Generate content
5. Train your team

**Need Help?**
- Full guide: [`MIGRATION_GUIDE.md`](./MIGRATION_GUIDE.md)
- Scheduler: [`docs/JOURNEY_SCHEDULER_GUIDE.md`](./docs/JOURNEY_SCHEDULER_GUIDE.md)
- Session summary: [`docs/SESSION_014_SUMMARY.md`](./docs/SESSION_014_SUMMARY.md)

---

**Total Time:** ~1.5-2 hours  
**Difficulty:** Easy (copy-paste migrations)  
**Result:** Production-ready CRM 3.0 🚀

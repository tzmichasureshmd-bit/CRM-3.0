# CRM 3.0 Database Migration Guide

## 🎯 Goal
Apply all 8 migrations to your Supabase database to enable all CRM 3.0 features.

## 📋 Prerequisites
- Supabase project: `ngvmzkavvkikisprtpgd`
- Project URL: `https://ngvmzkavvkikisprtpgd.supabase.co`
- Access to Supabase Dashboard

## 🚀 Migration Steps

### Step 1: Open Supabase SQL Editor
1. Go to: https://supabase.com/dashboard/project/ngvmzkavvkikisprtpgd
2. Click on **SQL Editor** in the left sidebar
3. Click **New Query**

### Step 2: Apply Migrations in Order

**CRITICAL: You MUST apply migrations in this exact order. Do not skip any.**

#### Migration 1: Base Schema (APPLY_THIS_FIRST_IN_SUPABASE.sql)
- **Purpose:** Creates all base CRM tables (accounts, profiles, contacts, conversations, messages, deals, etc.)
- **File:** `supabase/migrations/APPLY_THIS_FIRST_IN_SUPABASE.sql`
- **Action:**
  1. Open the file
  2. Copy ALL contents
  3. Paste into Supabase SQL Editor
  4. Click **RUN**
  5. ✅ Wait for "Success" message

#### Migration 2: CRM 3.0 Foundation (001_crm3_foundation.sql)
- **Purpose:** Creates CRM 3.0 specific tables (content, attribution, journey events, AI agents, segments)
- **File:** `supabase/migrations/001_crm3_foundation.sql`
- **Action:**
  1. Open the file
  2. Copy ALL contents
  3. Paste into Supabase SQL Editor
  4. Click **RUN**
  5. ✅ Wait for "Success" message

#### Migration 3: Conversation AI Columns (002_conversation_ai_columns.sql)
- **Purpose:** Adds AI analysis columns to conversations table (intent, sentiment, summary, lead score, NBA)
- **File:** `supabase/migrations/002_conversation_ai_columns.sql`
- **Action:**
  1. Open the file
  2. Copy ALL contents
  3. Paste into Supabase SQL Editor
  4. Click **RUN**
  5. ✅ Wait for "Success" message

#### Migration 4: Smart Automation AI (003_smart_automation_ai.sql)
- **Purpose:** Extends automation tables with AI capabilities
- **File:** `supabase/migrations/003_smart_automation_ai.sql`
- **Action:**
  1. Open the file
  2. Copy ALL contents
  3. Paste into Supabase SQL Editor
  4. Click **RUN**
  5. ✅ Wait for "Success" message

#### Migration 5: AI Agents Full (004_ai_agents_full.sql)
- **Purpose:** Extends AI agents with execution steps, approvals, audit log
- **File:** `supabase/migrations/004_ai_agents_full.sql`
- **Action:**
  1. Open the file
  2. Copy ALL contents
  3. Paste into Supabase SQL Editor
  4. Click **RUN**
  5. ✅ Wait for "Success" message

#### Migration 6: Attribution Enhancements (005_attribution_enhancements.sql)
- **Purpose:** Adds attribution tracking columns (source, channel, UTM, conversion tracking)
- **File:** `supabase/migrations/005_attribution_enhancements.sql`
- **Action:**
  1. Open the file
  2. Copy ALL contents
  3. Paste into Supabase SQL Editor
  4. Click **RUN**
  5. ✅ Wait for "Success" message

#### Migration 7: Journey Builder (006_journey_builder.sql)
- **Purpose:** Creates journey builder tables (journeys, contact state, executions)
- **File:** `supabase/migrations/006_journey_builder.sql`
- **Action:**
  1. Open the file
  2. Copy ALL contents
  3. Paste into Supabase SQL Editor
  4. Click **RUN**
  5. ✅ Wait for "Success" message

#### Migration 8: Journey Scheduler (007_journey_scheduler.sql)
- **Purpose:** Adds scheduler columns for journey wait nodes (wait_until, retry_count, etc.)
- **File:** `supabase/migrations/007_journey_scheduler.sql`
- **Action:**
  1. Open the file
  2. Copy ALL contents
  3. Paste into Supabase SQL Editor
  4. Click **RUN**
  5. ✅ Wait for "Success" message

### Step 3: Verify Migrations Applied Successfully

Run this query in SQL Editor to check all tables exist:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name LIKE 'crm3_%'
ORDER BY table_name;
```

**Expected tables:**
- crm3_ai_agent_runs
- crm3_ai_agents
- crm3_ai_operations
- crm3_attribution
- crm3_automation_ai_nodes
- crm3_automation_executions
- crm3_automation_templates
- crm3_content
- crm3_journey_contact_state
- crm3_journey_events
- crm3_journey_executions
- crm3_journeys
- crm3_next_best_actions
- crm3_segments
- crm3_agent_execution_steps
- crm3_agent_approvals
- crm3_agent_audit_log

### Step 4: Check Realtime Enabled

Run this query to verify realtime is enabled:

```sql
SELECT tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';
```

**Should include:**
- conversations
- messages
- crm3_content
- crm3_journey_events
- crm3_next_best_actions
- crm3_ai_agent_runs
- crm3_agent_approvals
- crm3_journey_executions

## ✅ Post-Migration Checklist

- [ ] All 8 migrations applied successfully
- [ ] All `crm3_*` tables exist
- [ ] Realtime enabled on required tables
- [ ] Update `OPENAI_API_KEY` in `.env.local` with real key (currently placeholder)
- [ ] Run `npm run dev` to start the app
- [ ] Login and test features

## 🐛 Troubleshooting

### Error: "relation already exists"
✅ **This is OK** - The migration uses `CREATE TABLE IF NOT EXISTS`, so it's safe to re-run.

### Error: "column already exists"
✅ **This is OK** - The migration uses `ADD COLUMN IF NOT EXISTS`, so it's safe to re-run.

### Error: "permission denied"
❌ Make sure you're logged into Supabase with the correct account and have admin access.

### Error: "syntax error"
❌ Make sure you copied the ENTIRE migration file including all SQL statements.

## 📞 Need Help?

If migrations fail:
1. Check the error message in Supabase SQL Editor
2. Copy the full error text
3. Check which migration failed
4. You can safely re-run any migration (they're all idempotent)

## 🎉 After All Migrations

Once all migrations are applied:

1. **Update .env.local:**
   ```
   OPENAI_API_KEY=sk-your-real-key-here
   ```

2. **Start the dev server:**
   ```bash
   npm run dev
   ```

3. **Test each feature:**
   - Dashboard: Real-time KPIs
   - Inbox: AI analysis on conversations
   - Leads: AI lead scoring
   - Automations: Create automation with AI nodes
   - Agents: Create and run AI agents
   - Content Studio: Generate and publish content
   - Journeys: Build customer journeys
   - Reports: View revenue intelligence

## 📊 Migration Status Tracker

Track your progress:

- [ ] Migration 0: APPLY_THIS_FIRST_IN_SUPABASE.sql
- [ ] Migration 1: 001_crm3_foundation.sql
- [ ] Migration 2: 002_conversation_ai_columns.sql
- [ ] Migration 3: 003_smart_automation_ai.sql
- [ ] Migration 4: 004_ai_agents_full.sql
- [ ] Migration 5: 005_attribution_enhancements.sql
- [ ] Migration 6: 006_journey_builder.sql
- [ ] Migration 7: 007_journey_scheduler.sql
- [ ] ✅ All migrations complete!

---

**Estimated Time:** 30-45 minutes for all migrations
**Difficulty:** Easy (copy-paste into SQL Editor)
**Risk:** Low (all migrations are idempotent and safe to re-run)

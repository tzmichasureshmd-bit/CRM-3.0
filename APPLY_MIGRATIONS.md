# Apply All Migrations to Supabase

## 🚀 Quick Method (One Command)

Just run these 3 commands:

```bash
# 1. Login to Supabase (first time only)
supabase login

# 2. Link to your project
supabase link --project-ref ngvmzkavvkikisprtpgd

# 3. Push all migrations
supabase db push
```

**That's it! All 8 migrations applied automatically.** ✅

---

## 📋 What Just Happened?

The `supabase db push` command automatically:
1. ✅ Found all 8 SQL files in `supabase/migrations/`
2. ✅ Applied them in alphabetical order
3. ✅ Created all 32 database tables
4. ✅ Enabled Row Level Security (RLS)
5. ✅ Set up Realtime subscriptions
6. ✅ Created all indexes

---

## ✅ Verify It Worked

Run this command:
```bash
supabase db pull --schema public
```

Or check in Supabase Dashboard:
https://supabase.com/dashboard/project/ngvmzkavvkikisprtpgd/editor

You should see 17 tables starting with `crm3_`:
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
- crm3_journey_scheduler_log
- crm3_next_best_actions
- crm3_segments
- crm3_agent_execution_steps
- crm3_agent_approvals
- crm3_agent_audit_log

---

## 🐛 Troubleshooting

### "Not logged in"
```bash
supabase login
```
This will open your browser to authenticate.

### "Project not found"
```bash
supabase link --project-ref ngvmzkavvkikisprtpgd
```

### "Already applied" or "Duplicate" errors
✅ **This is OK!** It means the migration already ran. This is expected behavior.

### "Permission denied"
Make sure you're logged into the correct Supabase account that owns project `ngvmzkavvkikisprtpgd`.

---

## 🎯 Next Steps

After migrations complete:

### 1. Update OpenAI Key (2 min)
Edit `.env.local`:
```env
OPENAI_API_KEY=sk-proj-YOUR-REAL-KEY-HERE
```

### 2. Start Dev Server (1 min)
```bash
npm install    # First time only
npm run dev
```

### 3. Open App
http://localhost:3000

### 4. Test Features
- ✅ Dashboard loads with KPIs
- ✅ Inbox shows conversations
- ✅ Leads page works
- ✅ AI Analyze button works
- ✅ Agents page loads
- ✅ Journeys page loads
- ✅ Content Studio works
- ✅ Reports show charts

---

## 📊 Migration Files Applied

| Order | File | Purpose |
|-------|------|---------|
| 1 | `000_crm3_standalone_base.sql` | Base CRM tables |
| 2 | `001_crm3_foundation.sql` | CRM 3.0 tables |
| 3 | `002_conversation_ai_columns.sql` | AI analysis on conversations |
| 4 | `003_smart_automation_ai.sql` | AI automation |
| 5 | `004_ai_agents_full.sql` | AI agents |
| 6 | `005_attribution_enhancements.sql` | Revenue attribution |
| 7 | `006_journey_builder.sql` | Customer journeys |
| 8 | `007_journey_scheduler.sql` | Journey scheduler |

---

## 🔄 Re-running Migrations

All migrations are **idempotent** (safe to run multiple times).

If you need to re-apply:
```bash
supabase db push
```

It will skip already-applied migrations and only apply new ones.

---

## 💰 No Extra Cost

Supabase CLI is free and runs migrations on your existing Supabase project.
- ✅ No additional charges
- ✅ No separate infrastructure needed
- ✅ Uses your existing database

---

## ⏱️ Total Time

- **Login:** 30 seconds (first time only)
- **Link:** 10 seconds
- **Push:** 1-2 minutes

**Total:** ~3 minutes for all migrations! 🚀

---

**Ready? Just run:**
```bash
supabase login
supabase link --project-ref ngvmzkavvkikisprtpgd
supabase db push
```

**Done!** ✅

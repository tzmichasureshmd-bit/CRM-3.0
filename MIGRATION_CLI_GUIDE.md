# CRM 3.0 — Apply Migrations via Supabase CLI

## 🚀 One-Command Migration Push

Instead of manually copying 8 SQL files into Supabase SQL Editor, use the CLI to push all migrations at once!

---

## ✅ Prerequisites

1. **Supabase CLI installed** (you already have it!)
   ```bash
   supabase --version
   # Should show: 2.120.0 or higher
   ```

2. **Logged into Supabase CLI**
   ```bash
   supabase login
   ```
   - Opens browser to authenticate
   - Copy access token when prompted

---

## 🎯 Option 1: Automated Script (Recommended)

### Windows (PowerShell):
```powershell
.\push-migrations.ps1
```

### Mac/Linux (Bash):
```bash
chmod +x push-migrations.sh
./push-migrations.sh
```

**What it does:**
1. ✅ Checks Supabase CLI installed
2. ✅ Links to your project (`ngvmzkavvkikisprtpgd`)
3. ✅ Pushes all 8 migrations at once
4. ✅ Verifies success
5. ✅ Shows next steps

**Time:** ~2 minutes (fully automated!)

---

## 🎯 Option 2: Manual Commands

If you prefer to run commands manually:

### Step 1: Login to Supabase CLI
```bash
supabase login
```

### Step 2: Link to Your Project
```bash
supabase link --project-ref ngvmzkavvkikisprtpgd
```

### Step 3: Push All Migrations
```bash
supabase db push
```

**That's it!** All 8 migrations are now applied.

---

## 📁 What Gets Applied

The CLI will apply all SQL files in `supabase/migrations/` in alphabetical order:

1. ✅ `000_crm3_standalone_base.sql` (or `APPLY_THIS_FIRST_IN_SUPABASE.sql`)
2. ✅ `001_crm3_foundation.sql`
3. ✅ `002_conversation_ai_columns.sql`
4. ✅ `003_smart_automation_ai.sql`
5. ✅ `004_ai_agents_full.sql`
6. ✅ `005_attribution_enhancements.sql`
7. ✅ `006_journey_builder.sql`
8. ✅ `007_journey_scheduler.sql`

---

## ✅ Verify Migrations Applied

### Option A: Via CLI
```bash
supabase db pull --schema public
```

### Option B: Via SQL Query
Go to Supabase Dashboard and run:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name LIKE 'crm3_%'
ORDER BY table_name;
```

**Should see 17 tables:**
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

## 🔄 If You Need to Re-apply Migrations

All migrations are **idempotent** (safe to run multiple times):
- Uses `CREATE TABLE IF NOT EXISTS`
- Uses `ADD COLUMN IF NOT EXISTS`
- Uses `CREATE INDEX IF NOT EXISTS`

So you can safely run:
```bash
supabase db push
```

Multiple times without breaking anything!

---

## 🐛 Troubleshooting

### Error: "Not logged in"
```bash
supabase login
```

### Error: "Project not linked"
```bash
supabase link --project-ref ngvmzkavvkikisprtpgd
```

### Error: "Migration already applied"
✅ **This is OK!** It means the migration was already run. Skip it and continue.

### Error: "Permission denied"
- Check you're logged into the correct Supabase account
- Verify you have admin access to project `ngvmzkavvkikisprtpgd`

### Error: "Cannot read migrations"
- Make sure you're in the project root directory (`CRM_3.0/`)
- Verify `supabase/migrations/` folder exists

---

## 📊 Compare: CLI vs Manual

| Method | Time | Steps | Risk |
|--------|------|-------|------|
| **CLI** | ~2 min | 1 command | None |
| **Manual** | ~45 min | 8 copy-pastes | Copy errors |

**CLI is way better! 🚀**

---

## 🎉 After Migrations Complete

1. **Update OpenAI Key**
   ```bash
   # Edit .env.local
   OPENAI_API_KEY=sk-proj-YOUR-REAL-KEY
   ```

2. **Start Dev Server**
   ```bash
   npm run dev
   ```

3. **Open App**
   ```
   http://localhost:3000
   ```

4. **Test Features**
   - Dashboard → Inbox → Leads → Agents → Journeys

---

## 🔗 Useful Commands

```bash
# Check migration status
supabase db status

# View remote database schema
supabase db pull --schema public

# Reset local database (if needed)
supabase db reset

# View migration history
supabase migrations list

# Create new migration
supabase migrations new my_new_migration
```

---

## 📚 Learn More

- [Supabase CLI Documentation](https://supabase.com/docs/guides/cli)
- [Database Migrations Guide](https://supabase.com/docs/guides/cli/local-development#database-migrations)
- [Supabase Dashboard](https://supabase.com/dashboard/project/ngvmzkavvkikisprtpgd)

---

**Total Time:** 2 minutes with CLI vs 45 minutes manual 🚀

**Use the script: `.\push-migrations.ps1` and you're done!**

# Apply Migrations - Simple Method (5 Minutes)

## ⚠️ CLI Not Working? Use This Method Instead

If you got "account does not have necessary privileges" error with Supabase CLI, use this manual method instead. It's simple and reliable!

---

## 🎯 Steps (Copy-Paste Each Migration)

### Step 1: Open Supabase SQL Editor
Click this link: https://supabase.com/dashboard/project/ngvmzkavvkikisprtpgd/sql/new

### Step 2: Apply Migrations (Copy-Paste)

#### Migration 1: Base Schema
1. Open file: `supabase/migrations/APPLY_THIS_FIRST_IN_SUPABASE.sql`
2. Press `Ctrl+A` (Select All)
3. Press `Ctrl+C` (Copy)
4. Paste in SQL Editor
5. Click **RUN** button
6. ✅ Wait for "Success"

#### Migration 2: CRM 3.0 Foundation
1. Open file: `supabase/migrations/001_crm3_foundation.sql`
2. Copy all → Paste → RUN
3. ✅ Wait for success

#### Migration 3: Conversation AI
1. Open file: `supabase/migrations/002_conversation_ai_columns.sql`
2. Copy all → Paste → RUN
3. ✅ Wait for success

#### Migration 4: Smart Automation
1. Open file: `supabase/migrations/003_smart_automation_ai.sql`
2. Copy all → Paste → RUN
3. ✅ Wait for success

#### Migration 5: AI Agents
1. Open file: `supabase/migrations/004_ai_agents_full.sql`
2. Copy all → Paste → RUN
3. ✅ Wait for success

#### Migration 6: Attribution
1. Open file: `supabase/migrations/005_attribution_enhancements.sql`
2. Copy all → Paste → RUN
3. ✅ Wait for success

#### Migration 7: Journey Builder
1. Open file: `supabase/migrations/006_journey_builder.sql`
2. Copy all → Paste → RUN
3. ✅ Wait for success

#### Migration 8: Journey Scheduler
1. Open file: `supabase/migrations/007_journey_scheduler.sql`
2. Copy all → Paste → RUN
3. ✅ Wait for success

---

## ✅ Verify It Worked

In SQL Editor, run this query:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name LIKE 'crm3_%'
ORDER BY table_name;
```

**You should see 17 tables!**

---

## 🎉 Done! Next Steps

### 1. Update OpenAI Key
Edit `.env.local`:
```env
OPENAI_API_KEY=sk-proj-YOUR-REAL-KEY-HERE
```

### 2. Start App
```bash
npm install
npm run dev
```

### 3. Open
http://localhost:3000

---

## ⏱️ Total Time
- **8 copy-pastes:** ~5 minutes
- **Verify:** 30 seconds

**Total:** 5-6 minutes

---

## 💡 Why CLI Failed

The Supabase CLI requires **Owner** or **Admin** role on the project.

If you logged in with an account that doesn't have those permissions, you'll get the "necessary privileges" error.

**Solution:** Use manual SQL Editor method (this guide) instead!

---

## 🐛 If You Get Errors

### "relation already exists"
✅ **This is OK!** It means the table was already created. Continue to next migration.

### "column already exists"
✅ **This is OK!** It means the column was already added. Continue to next migration.

### "syntax error near..."
❌ Make sure you copied the **ENTIRE** file contents (Ctrl+A to select all).

---

**Ready? Open the SQL Editor and start copy-pasting!**

https://supabase.com/dashboard/project/ngvmzkavvkikisprtpgd/sql/new

# CRM 3.0 Journey Wait-Node Background Scheduler

## 🎯 Overview

The Journey Scheduler automatically resumes customer journeys that are paused at wait nodes. It runs as a Vercel Cron Job every 5 minutes.

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Vercel Cron Job                           │
│              (runs every 5 minutes)                          │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│           POST /api/v3/journeys/scheduler                    │
│         (Authorization: Bearer CRON_SECRET)                  │
└───────────────────────────┬──────────────────────────────────┘
                            │
                    ┌───────┴────────┐
                    │                │
                    ▼                ▼
        ┌────────────────┐  ┌────────────────┐
        │  Find Waiting  │  │  Acquire Lock  │
        │   Contacts     │  │  (Idempotent)  │
        └───────┬────────┘  └────────┬───────┘
                │                    │
                └──────────┬─────────┘
                           ▼
               ┌─────────────────────┐
               │  Resume Execution   │
               │ (Journey Engine)    │
               └──────────┬──────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌─────────┐    ┌──────────┐   ┌──────────────┐
    │Completed│    │  Waiting │   │    Failed    │
    │         │    │  (Again) │   │  (Retry or   │
    │         │    │          │   │ Dead Letter) │
    └─────────┘    └──────────┘   └──────────────┘
```

## 📦 Components

### 1. Migration 007 (supabase/migrations/007_journey_scheduler.sql)
Adds scheduler columns to `crm3_journey_contact_state`:
- `attempt_count` — Retry counter (max 3)
- `last_attempt_at` — Last execution attempt timestamp
- `next_attempt_at` — Scheduled next retry (exponential backoff)
- `terminal_error` — Error message if dead-lettered
- `scheduler_lock` — 30-second lock to prevent concurrent processing

Creates `crm3_journey_scheduler_log` table:
- Audit trail of all scheduler actions
- Tracks resume/fail/dead-letter events
- Includes duration and attempt number

### 2. Scheduler API (src/app/api/v3/journeys/scheduler/route.ts)
**Endpoint:** `POST /api/v3/journeys/scheduler`

**Security:**
- Requires `Authorization: Bearer <CRON_SECRET>` header
- Only accessible by Vercel Cron
- Returns 401 for invalid/missing secret

**Process Flow:**
1. Find all contacts where:
   - `status = 'waiting'`
   - `wait_until <= now()`
   - `terminal_error IS NULL`
   - `scheduler_lock` is null or expired (>30s old)
2. For each contact (max 50 per run):
   - Acquire optimistic lock (set `scheduler_lock = now() + 30s`)
   - Load journey nodes/edges
   - Resume execution from `current_node_id`
   - Handle result:
     - ✅ **Completed:** Mark contact state as completed
     - ⏸️ **Waiting:** Hit another wait node, update wait_until
     - ❌ **Failed:** Retry with exponential backoff (2, 4, 8 minutes) or dead-letter after 3 attempts
3. Log all actions to `crm3_journey_scheduler_log`

**Retry Logic:**
- Attempt 1 fails → retry in 2 minutes
- Attempt 2 fails → retry in 4 minutes
- Attempt 3 fails → dead-letter (terminal error)

### 3. Vercel Cron Configuration (vercel.json)
```json
{
  "crons": [
    {
      "path": "/api/v3/journeys/scheduler",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

**Schedule:** Every 5 minutes  
**Format:** Standard cron syntax (`*/5 * * * *` = every 5 minutes)

## 🔒 Security

### Idempotency
- **Optimistic Locking:** Only one scheduler can process a contact at a time
- **Lock Expiry:** Locks expire after 30 seconds (prevents stuck locks)
- **Attempt Counter:** Prevents infinite retries

### Authentication
- **CRON_SECRET:** Random string (never expose publicly)
- **Environment Variable:** `CRON_SECRET=your-secret-here`
- **Production Secret:** Generate with `openssl rand -hex 32`

### Authorization
- Scheduler runs as system user (no specific user context)
- All database operations still enforce RLS via account_id
- Journey and contact ownership verified before execution

## 🚀 Deployment

### Step 1: Set Environment Variables

**Local (.env.local):**
```env
CRON_SECRET=dev-cron-secret
```

**Vercel Production:**
1. Go to: https://vercel.com/your-team/crm-3-0/settings/environment-variables
2. Add `CRON_SECRET`
3. Value: Generate secure random string (`openssl rand -hex 32`)
4. Scope: Production + Preview

### Step 2: Deploy to Vercel
```bash
git add .
git commit -m "feat: journey wait-node scheduler"
git push origin main
```

Vercel automatically:
- Detects `vercel.json` cron config
- Registers the cron job
- Runs every 5 minutes in production

### Step 3: Verify Cron Job Running

**Check Vercel Logs:**
1. Go to: https://vercel.com/your-team/crm-3-0/deployments
2. Click on latest deployment
3. Go to "Functions" tab
4. Filter by `/api/v3/journeys/scheduler`
5. Look for logs every 5 minutes

**Check Scheduler Log Table:**
```sql
SELECT 
  executed_at,
  action,
  attempt_number,
  error_message,
  duration_ms
FROM crm3_journey_scheduler_log
ORDER BY executed_at DESC
LIMIT 20;
```

## 📊 Monitoring

### Scheduler Health Dashboard

Run this query to check scheduler health:

```sql
-- Scheduler performance last 24 hours
SELECT 
  date_trunc('hour', executed_at) AS hour,
  action,
  COUNT(*) AS count,
  AVG(duration_ms) AS avg_duration_ms,
  MAX(duration_ms) AS max_duration_ms
FROM crm3_journey_scheduler_log
WHERE executed_at > NOW() - INTERVAL '24 hours'
GROUP BY date_trunc('hour', executed_at), action
ORDER BY hour DESC, action;
```

### Key Metrics to Monitor

| Metric | Query | Healthy Range |
|--------|-------|---------------|
| Resume Success Rate | `resumed / (resumed + failed + dead_lettered)` | > 95% |
| Avg Duration | `AVG(duration_ms)` | < 5000ms |
| Dead Letter Rate | `dead_lettered / processed` | < 1% |
| Lock Contention | Count of `skipped_locked` | < 5% |

### Alerts to Set Up

1. **High Failure Rate:** > 5% of executions failing
2. **Slow Execution:** avg duration > 10 seconds
3. **Dead Letters:** > 10 contacts dead-lettered per day
4. **Lock Contention:** > 20% of attempts skipped due to locks

## 🐛 Troubleshooting

### Issue: Contacts stuck in waiting state

**Symptoms:** Contacts never resume even after wait time passed

**Causes:**
1. Cron job not running (check Vercel logs)
2. CRON_SECRET mismatch (check environment variables)
3. Journey deleted while contact waiting
4. Terminal error set (check `crm3_journey_contact_state.terminal_error`)

**Fix:**
```sql
-- Check stuck contacts
SELECT 
  jcs.*,
  j.name AS journey_name
FROM crm3_journey_contact_state jcs
JOIN crm3_journeys j ON j.id = jcs.journey_id
WHERE jcs.status = 'waiting'
  AND jcs.wait_until < NOW()
  AND jcs.terminal_error IS NULL
ORDER BY jcs.wait_until DESC;

-- Manually trigger scheduler (if cron not running)
-- POST /api/v3/journeys/scheduler
-- Headers: { "authorization": "Bearer <CRON_SECRET>" }
```

### Issue: High dead letter rate

**Symptoms:** Many contacts end up in terminal_error state

**Causes:**
1. Journey nodes failing repeatedly
2. Invalid journey configuration
3. Missing contact data

**Fix:**
```sql
-- Check dead lettered contacts
SELECT 
  jcs.terminal_error,
  COUNT(*) AS count
FROM crm3_journey_contact_state jcs
WHERE jcs.terminal_error IS NOT NULL
GROUP BY jcs.terminal_error
ORDER BY count DESC;

-- Analyze specific errors
SELECT *
FROM crm3_journey_scheduler_log
WHERE action = 'dead_lettered'
ORDER BY executed_at DESC
LIMIT 20;
```

### Issue: Scheduler lock timeout

**Symptoms:** Many `skipped_locked` entries in log

**Causes:**
1. Scheduler taking > 30 seconds per contact
2. Multiple Vercel instances running concurrently
3. Database query slow

**Fix:**
1. Increase `LOCK_DURATION_SECONDS` in scheduler route (default: 30)
2. Add database indexes for slow queries
3. Check Vercel cron configuration (should only run one instance)

## 📈 Performance Optimization

### Database Indexes
Already created in migration 007:
```sql
CREATE INDEX crm3_jcs_scheduler_idx
  ON crm3_journey_contact_state (wait_until, account_id)
  WHERE status = 'waiting' AND terminal_error IS NULL;
```

### Batch Size Tuning
Default: 50 contacts per run

Adjust in `scheduler/route.ts`:
```typescript
.limit(50); // Increase for high-volume accounts
```

**Considerations:**
- Higher batch = fewer cron runs needed
- Higher batch = longer execution time
- Must complete within Vercel function timeout (10s on Hobby, 60s on Pro)

### Schedule Frequency
Default: Every 5 minutes (`*/5 * * * *`)

**Options:**
- More frequent: `*/1 * * * *` (every minute) — better latency, more invocations
- Less frequent: `*/10 * * * *` (every 10 minutes) — lower cost, higher latency

## 💰 Cost Estimation

### Vercel Cron Invocations
- **Frequency:** 12 invocations per hour (every 5 min)
- **Daily:** 288 invocations
- **Monthly:** ~8,640 invocations

### Vercel Pricing (Pro Plan)
- **Included:** 1,000,000 function invocations/month
- **Overage:** $0.60 per million invocations
- **CRM 3.0 Scheduler:** 8,640 invocations = ~0.01% of free tier ✅

### Supabase Database Operations
Per scheduler run (assuming 10 waiting contacts):
- 1 SELECT query (find waiting contacts)
- 10 UPDATE queries (acquire locks)
- 10 SELECT queries (load journeys)
- 10-50 journey engine queries (varies by journey complexity)
- 10 INSERT queries (scheduler log)

**Total:** ~40-80 queries per run = **~10k-20k queries/month**

Supabase Free Tier: 500MB database + 2GB bandwidth ✅

## ✅ Testing

### Local Testing
```bash
# 1. Ensure CRON_SECRET is set
echo $CRON_SECRET  # Should output: dev-cron-secret

# 2. Start dev server
npm run dev

# 3. Trigger scheduler manually
curl -X POST http://localhost:3000/api/v3/journeys/scheduler \
  -H "Authorization: Bearer dev-cron-secret"

# Expected response:
# {
#   "processed": 5,
#   "resumed": 4,
#   "failed": 1,
#   "deadLettered": 0,
#   "skippedLocked": 0,
#   "durationMs": 234,
#   "message": "Successfully processed 5 contacts"
# }
```

### Create Test Journey with Wait Node
```typescript
// Test journey:
// 1. Trigger → 2. Wait (1 minute) → 3. Action → 4. End

const testJourney = {
  name: "Test Wait Scheduler",
  nodes: [
    { id: "1", type: "trigger", data: { label: "Start" } },
    { id: "2", type: "wait", data: { config: { amount: 1, unit: "minutes" } } },
    { id: "3", type: "action", data: { config: { action_type: "create_followup", title: "Scheduler test" } } },
    { id: "4", type: "end", data: { label: "End" } }
  ],
  edges: [
    { source: "1", target: "2" },
    { source: "2", target: "3" },
    { source: "3", target: "4" }
  ]
};

// Execute journey → hits wait node → scheduler resumes after 1 minute
```

## 📚 References

- [Vercel Cron Jobs Documentation](https://vercel.com/docs/cron-jobs)
- [Journey Engine Source](../src/lib/ai/journey-engine.ts)
- [Migration 007](../supabase/migrations/007_journey_scheduler.sql)
- [Scheduler API](../src/app/api/v3/journeys/scheduler/route.ts)

---

**Status:** ✅ IMPLEMENTED  
**Version:** 1.0  
**Last Updated:** Session 014  
**Blockers:** None (scheduler is production-ready)

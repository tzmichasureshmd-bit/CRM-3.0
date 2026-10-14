# CRM 3.0 — BUG TRACKER (Q-16)
# Fill this during browser E2E testing (Owner Task O-4)
# Then share with Amazon Q to fix all bugs immediately.
# ─────────────────────────────────────────────────────────────

## HOW TO USE
1. Run `npm run dev`
2. Open http://localhost:3000
3. Test each feature below
4. Write any bug you find in the format shown
5. Share this file with Amazon Q — bugs will be fixed immediately

---

## BUG FORMAT
```
### BUG-001
Page: /inbox
What happened: AI analyze button does nothing when clicked
Expected: Should show score + intent + NBA
Steps to reproduce: Login → Inbox → Open conversation → Click "AI Analyze"
Screenshot: (optional)
```

---

## TEST CHECKLIST

### Dashboard
- [ ] KPI cards load with real numbers (not 0)
- [ ] Attention section shows hot leads / overdue follow-ups
- [ ] Pipeline Overview shows real deals
- [ ] Recent Conversations shows real conversations
- [ ] AI Copilot widget responds to messages
- [ ] Revenue chart loads
- [ ] Lead Sources donut chart loads

### Inbox
- [ ] Conversation list loads
- [ ] Can open a conversation
- [ ] Messages load in thread
- [ ] Can send a message
- [ ] AI Analyze button works → shows score/intent/NBA
- [ ] AI Reply Assistant works → generates reply suggestions
- [ ] Realtime: send message in another tab, appears here

### Leads
- [ ] Lead list loads with scores
- [ ] Analyze button works → score updates
- [ ] Tier badges show (Hot/Warm/Cold)

### Pipeline & CRM
- [ ] Pipeline tab loads with deal columns
- [ ] Create Deal modal opens and works
- [ ] Moving deal stage works
- [ ] CRM tab loads with lead columns
- [ ] Add Lead modal opens and works
- [ ] Moving lead status works

### Contacts
- [ ] Contact list loads
- [ ] Search works
- [ ] Add Contact button → (Sharvani's task — may not be done yet)

### Follow-ups
- [ ] Follow-up list loads
- [ ] Filter tabs work (All/Overdue/Today/Upcoming)
- [ ] Mark Done button works
- [ ] Add Follow-up button → (Sharvani's task)

### Customer 360
- [ ] Contact list loads
- [ ] Click contact → timeline loads
- [ ] AI Analyze button works
- [ ] Deals section shows real deals

### Automations
- [ ] Automation list loads
- [ ] Create automation modal opens
- [ ] Toggle active/paused works

### AI Agents
- [ ] Agent list loads
- [ ] Create agent modal opens
- [ ] Run agent works (with OpenAI key)
- [ ] Approval queue shows pending actions

### Content Studio
- [ ] Generate content works
- [ ] Save to Drafts works
- [ ] Drafts tab loads from DB
- [ ] Calendar view loads
- [ ] Grid view loads

### Journeys
- [ ] Journey list loads
- [ ] Create journey works
- [ ] Add nodes works
- [ ] Publish works
- [ ] Execute with contact ID works

### Analytics
- [ ] Page loads (no 404)
- [ ] Conversation volume chart loads
- [ ] Lead funnel loads
- [ ] Channel breakdown loads
- [ ] Date range filter works

### Campaigns
- [ ] Page loads (no 404)
- [ ] Campaign list loads
- [ ] Create Campaign modal works
- [ ] Delete campaign works

### Revenue / Reports
- [ ] Revenue page loads
- [ ] Attribution funnel loads
- [ ] Reports page loads
- [ ] All 4 tabs work

### Settings
- [ ] Settings page loads
- [ ] Integrations page loads (no 404)
- [ ] Security page loads (no 404)
- [ ] Billing page loads (no 404)
- [ ] Platform Health page loads (no 404)
- [ ] Health checks run and show status
- [ ] Migration status shows correctly

---

## BUGS FOUND
(Fill this section during testing)

<!-- Example:
### BUG-001
Page: 
What happened: 
Expected: 
Steps: 
-->

---
*Last updated: Awaiting browser testing (Owner Task O-4)*

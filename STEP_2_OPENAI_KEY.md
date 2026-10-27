# 🔑 STEP 2: ADD OPENAI API KEY

**Time Required:** 2 minutes ⏱️  
**Current Status:** ⏳ IN PROGRESS

---

## 🎯 WHAT YOU NEED TO DO

### 1. Get Your OpenAI API Key

**Go to:** https://platform.openai.com/api-keys

**Steps:**
1. Log in to OpenAI account (or create one if needed)
2. Click **"Create new secret key"**
3. Give it a name: "CRM 3.0 Production"
4. Copy the key (it will start with `sk-proj-` or `sk-`)
5. ⚠️ **IMPORTANT:** Save it somewhere safe — you can only see it once!

---

### 2. Update Your .env.local File

**File is already open in VS Code!** → `.env.local`

**Find this line:**
```env
OPENAI_API_KEY=sk-...
```

**Replace with your real key:**
```env
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Save the file:** Press `Ctrl+S`

---

### 3. Restart Dev Server

**In your terminal:**

```bash
# Press Ctrl+C to stop current server

# Then restart:
npm run dev
```

**Wait for:** "Ready in X ms" message

---

### 4. Verify It Works

**Test 1: Dashboard AI Copilot**
1. Open: http://localhost:3000/dashboard
2. Click AI Copilot button (bottom right corner)
3. Type: "Show me my hot leads"
4. Press Enter

**Expected:** Should get intelligent response with real data  
**If you see:** Generic fallback → Key not working, check steps above

**Test 2: Inbox AI Reply**
1. Open: http://localhost:3000/inbox
2. Click any conversation
3. Click "Professional" button in AI Reply panel
4. Should generate intelligent reply suggestion

**Test 3: Lead Intelligence**
1. Open: http://localhost:3000/leads
2. Click "Analyze" on any lead
3. Should see score update with detailed reasoning

---

## ✅ SUCCESS INDICATORS

When OpenAI key is working correctly, you'll see:

### In AI Copilot:
- ✅ Responses reference specific CRM data
- ✅ Recommendations are contextual
- ✅ Answers questions about your actual leads/deals

### In Inbox AI Reply:
- ✅ Suggestions match conversation context
- ✅ Different tones generate different styles
- ✅ Professional vs Friendly actually different

### In Lead Scoring:
- ✅ Score reasoning is detailed and specific
- ✅ Intent detection shows accurate categories
- ✅ NBA recommendations are personalized

---

## 🚨 TROUBLESHOOTING

### "AI still showing fallback responses"

**Check:**
1. ✅ Key saved in `.env.local` without quotes
2. ✅ Dev server restarted after saving
3. ✅ No spaces before/after key
4. ✅ Key starts with `sk-proj-` or `sk-`

**Fix:** 
```env
# ❌ WRONG:
OPENAI_API_KEY="sk-proj-xxxxx"

# ✅ CORRECT:
OPENAI_API_KEY=sk-proj-xxxxx
```

### "Invalid API key error"

**Check:**
1. Key copied correctly (no extra spaces)
2. Key is active (check OpenAI dashboard)
3. Key has usage quota available

**Fix:** Create new key in OpenAI dashboard

### "Server won't restart"

**Try:**
```bash
# Kill all node processes
taskkill /F /IM node.exe

# Restart
npm run dev
```

---

## 📋 CHECKLIST

Before moving to Step 3:

- [ ] OpenAI key obtained from platform.openai.com
- [ ] Key added to `.env.local` (no quotes)
- [ ] File saved (Ctrl+S)
- [ ] Dev server restarted
- [ ] Dashboard AI Copilot responds intelligently
- [ ] Inbox AI reply works
- [ ] Lead scoring shows detailed reasoning

**All checked? → You're ready for Step 3!** 🎉

---

## ➡️ NEXT STEP

After completing this step:

**Read:** `STEP_3_E2E_TESTING.md`

Or just tell me: **"Step 2 complete!"** and I'll guide you through testing!

---

**Current Progress:** ▓▓▓▓▓░░░░░ 50% to production  
**Time Remaining:** ~3.5 hours (just testing)

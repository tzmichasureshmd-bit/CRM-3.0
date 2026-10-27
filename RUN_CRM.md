# 🚀 HOW TO RUN CRM 3.0

**IMPORTANT:** CRM 3.0 is a SINGLE Next.js app in the ROOT directory.  
**DO NOT** run from `frontend/` or `backend/` folders!

---

## ✅ CORRECT WAY TO RUN

### Step 1: Open Terminal in ROOT Directory

**Make sure you're in:** `C:\Users\danie\Desktop\CRM_3.0`

**NOT in:** `C:\Users\danie\Desktop\CRM_3.0\frontend`

---

### Step 2: Stop Current Server

Press **Ctrl+C** in your terminal to stop the wrong server.

---

### Step 3: Run from ROOT

```bash
# Make sure you're in the ROOT directory
cd C:\Users\danie\Desktop\CRM_3.0

# Run the dev server
npm run dev
```

**Expected output:**
```
▲ Next.js 16.4.0
- Local:   http://localhost:3000
✓ Ready in X seconds
```

---

## ⚠️ COMMON MISTAKE

**WRONG (What you just did):**
```bash
cd frontend
npm run dev  # ❌ This runs old CRM 2.0 frontend
```

**RIGHT (What you should do):**
```bash
cd C:\Users\danie\Desktop\CRM_3.0
npm run dev  # ✅ This runs CRM 3.0
```

---

## 🏗️ PROJECT STRUCTURE

```
CRM_3.0/                    ← ROOT (run from here!)
├── src/                    ← CRM 3.0 source code
│   ├── app/               ← Next.js 15 App Router
│   ├── components/        ← All React components
│   └── lib/               ← Utilities, AI, Supabase
├── frontend/              ← OLD CRM 2.0 (ignore this!)
├── backend/               ← OLD CRM 2.0 (ignore this!)
├── package.json           ← CRM 3.0 dependencies
└── .env.local            ← CRM 3.0 environment
```

**CRM 3.0 = ROOT directory ONLY**

---

## 🎯 QUICK FIX NOW

1. **Stop current server:** Press `Ctrl+C`

2. **Navigate to ROOT:**
   ```bash
   cd C:\Users\danie\Desktop\CRM_3.0
   ```

3. **Verify you're in the right place:**
   ```bash
   dir
   # Should show: src/, docs/, supabase/, package.json
   ```

4. **Run CRM 3.0:**
   ```bash
   npm run dev
   ```

5. **Open browser:**
   - Go to: http://localhost:3000
   - Should see CRM 3.0 dashboard!

---

## ✅ SUCCESS INDICATORS

When running correctly:

- ✅ Port is 3000 (not 3001)
- ✅ Next.js version is 16.4.0 (not 16.2.6)
- ✅ URL is http://localhost:3000
- ✅ Dashboard has AI Copilot button (bottom right)
- ✅ Modern glass-morphism UI

---

## 🚨 IF YOU SEE OLD UI

If you accidentally open CRM 2.0:

1. Close that browser tab
2. Stop the server (Ctrl+C)
3. Navigate to ROOT: `cd C:\Users\danie\Desktop\CRM_3.0`
4. Run: `npm run dev`
5. Open: http://localhost:3000

---

**DO THIS NOW:** Stop current server, navigate to ROOT, run `npm run dev` from there! 🚀

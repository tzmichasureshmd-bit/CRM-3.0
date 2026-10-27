# Tzmicha CRM 3.0 - Utility Scripts

This directory contains PowerShell utility scripts for managing the CRM backend services.

## 🚀 START_BACKEND.ps1

**Purpose**: Automated startup script for backend services

**What it does:**
- ✅ Checks Python installation
- ✅ Verifies environment files exist
- ✅ Installs dependencies if missing
- ✅ Starts main backend on port 8000
- ✅ Starts AI service on port 8001
- ✅ Runs health checks
- ✅ Opens separate PowerShell windows for each service

**Usage:**
```powershell
.\START_BACKEND.ps1
```

**Services Started:**
- **Backend API**: http://localhost:8000
  - API Docs: http://localhost:8000/docs
  - Serves: /api/v1/* and /api/v3/* endpoints
  
- **AI Service**: http://localhost:8001
  - API Docs: http://localhost:8001/docs
  - Serves: AI/ML endpoints for copilot, agents, RAG

**Requirements:**
- Python 3.11+
- pip package manager
- PowerShell 5.1+

---

## 🔍 DIAGNOSE_ERRORS.ps1

**Purpose**: Comprehensive diagnostics for troubleshooting API errors

**What it checks:**
1. ✅ Service status (ports 8000, 8001)
2. ✅ API endpoint health
3. ✅ Environment configuration
4. ✅ Database connectivity
5. ✅ JWT secret consistency
6. ✅ Common configuration issues

**Usage:**
```powershell
.\DIAGNOSE_ERRORS.ps1
```

**Output:**
- Service status report
- Endpoint test results
- Configuration validation
- Common error solutions
- Actionable recommendations

**Use when:**
- Getting 400/401/500 errors in console
- Backend not responding
- Authentication issues
- After environment changes

---

## 📋 Common Workflows

### First Time Setup

```powershell
# 1. Clone the repository
git clone <repo-url>
cd CRM_3.0

# 2. Configure environment
cp .env.local.example .env.local
cp backend/.env.example backend/.env
# Edit both files with your credentials

# 3. Start backend services
.\START_BACKEND.ps1

# 4. In a new terminal, start frontend
npm install
npm run dev

# 5. Open browser
# http://localhost:3000
```

### Daily Development

```powershell
# Start backend
.\START_BACKEND.ps1

# Start frontend (new terminal)
npm run dev

# Stop all services
# Close PowerShell windows or press Ctrl+C
```

### Troubleshooting

```powershell
# 1. Run diagnostics
.\DIAGNOSE_ERRORS.ps1

# 2. If services not running
.\START_BACKEND.ps1

# 3. If still issues, kill all Python processes
Get-Process python, uvicorn | Stop-Process -Force

# 4. Restart fresh
.\START_BACKEND.ps1
```

---

## 🐛 Common Issues & Solutions

### Issue: "Port 8000 already in use"
```powershell
# Kill process on port
netstat -ano | findstr :8000
# Note the PID, then:
taskkill /PID <PID> /F
```

### Issue: "Module not found"
```powershell
# Reinstall dependencies
cd backend
pip install -r requirements.txt

cd ../ai-service
pip install -r requirements.txt
```

### Issue: "401 Unauthorized" errors
```powershell
# Verify JWT_SECRET matches
# In .env.local and backend/.env

# Clear browser storage
# DevTools → Application → Storage → Clear site data

# Re-login
```

### Issue: "500 Internal Server Error"
```powershell
# Check backend logs in PowerShell window
# Usually indicates:
# - Database connection failure
# - Missing database tables
# - Python exception

# Verify Supabase connection
# Check backend/.env SUPABASE_URL and SERVICE_ROLE_KEY
```

---

## 📚 Environment Files

### `.env.local` (Frontend)
```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
JWT_SECRET=...  # Must match backend!
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

### `backend/.env` (Backend)
```env
DATABASE_URL=postgresql+asyncpg://...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
JWT_SECRET=...  # Must match frontend!
PORT=8000
```

### `ai-service/.env` (AI Service)
```env
OPENAI_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
PORT=8001
```

---

## 🔧 Advanced Usage

### Manual Service Start

If scripts don't work, start manually:

```powershell
# Backend
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# AI Service (new terminal)
cd ai-service
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

### View Live Logs

```powershell
# Backend logs
cd backend
python -m uvicorn app.main:app --reload --log-level debug

# Watch specific log file
Get-Content backend/logs/app.log -Wait -Tail 50
```

### Database Migrations

```powershell
cd backend
python -m alembic upgrade head
```

---

## 📞 Support

For issues not covered here:
1. Check backend PowerShell window logs
2. Run `.\DIAGNOSE_ERRORS.ps1` for detailed diagnostics
3. Check Supabase dashboard for database status
4. Verify all API keys and credentials
5. Review `docs/` folder for integration-specific guides

---

## 🎯 Script Locations

```
CRM_3.0/
├── START_BACKEND.ps1        # Start all backend services
├── DIAGNOSE_ERRORS.ps1      # Diagnostics and troubleshooting
├── SCRIPTS_README.md        # This file
├── backend/
│   ├── .env                 # Backend configuration
│   ├── requirements.txt     # Python dependencies
│   └── app/main.py         # Backend entry point
├── ai-service/
│   ├── .env                # AI service configuration
│   ├── requirements.txt    # AI dependencies
│   └── app/main.py        # AI service entry point
└── .env.local             # Frontend configuration
```

---

**Version**: 3.0.0  
**Last Updated**: 2025-01-27  
**Platform**: Windows PowerShell 5.1+

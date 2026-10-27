# 🚀 Tzmicha CRM 3.0 - Quick Start Guide

## One-Command Startup

```powershell
# 1. Start backend services
.\START_BACKEND.ps1

# 2. Start frontend (new terminal)
npm run dev

# 3. Open browser
# http://localhost:3000
```

## 🔧 If You See Console Errors

```powershell
# Run diagnostics
.\DIAGNOSE_ERRORS.ps1

# Follow the recommended fixes
```

## 📚 Full Documentation

- **Scripts Guide**: See `SCRIPTS_README.md`
- **API Errors Fix**: See the artifact created in Kiro
- **Email Setup**: See `docs/EMAIL_INTEGRATION_SETUP.md`
- **Master Index**: See `00_START_HERE_MASTER_INDEX.md`

## 🐛 Common Issues

### 401 Unauthorized
```powershell
# Clear browser storage
# DevTools (F12) → Application → Clear site data
# Then re-login
```

### 500 Internal Server Error
```powershell
# Check backend logs in the PowerShell window
# Usually database connection issue
```

### Port Already in Use
```powershell
# Kill existing processes
Get-Process python, uvicorn | Stop-Process -Force

# Restart
.\START_BACKEND.ps1
```

## ✅ Verify Everything Works

```powershell
# Test backend
Invoke-RestMethod http://localhost:8000/

# Expected output:
# {
#   "name": "Tzmicha CRM 3.0 Backend",
#   "version": "3.0.0",
#   "status": "running"
# }
```

---

**Need Help?** Run `.\DIAGNOSE_ERRORS.ps1` for detailed diagnostics!

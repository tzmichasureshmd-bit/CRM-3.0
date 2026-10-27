# ═══════════════════════════════════════════════════════════════
# Tzmicha CRM 3.0 - Backend Services Startup Script
# ═══════════════════════════════════════════════════════════════

Write-Host "🚀 Starting Tzmicha CRM 3.0 Backend Services..." -ForegroundColor Cyan
Write-Host ""

# Check if Python is installed
$pythonVersion = python --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Python is not installed or not in PATH" -ForegroundColor Red
    Write-Host "   Please install Python 3.11+ from https://www.python.org/" -ForegroundColor Yellow
    exit 1
}
Write-Host "✓ Python: $pythonVersion" -ForegroundColor Green

# Check current directory
$currentDir = Get-Location
Write-Host "📁 Current Directory: $currentDir" -ForegroundColor Gray

# ───────────────────────────────────────────────────────────────
# 1. Main Backend (Port 8000)
# ───────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "1️⃣  Starting Main Backend (port 8000)..." -ForegroundColor Yellow

# Check if backend directory exists
if (!(Test-Path "backend")) {
    Write-Host "❌ backend/ directory not found" -ForegroundColor Red
    exit 1
}

# Check if .env exists
if (!(Test-Path "backend\.env")) {
    Write-Host "⚠️  backend/.env not found, using .env.example" -ForegroundColor Yellow
    if (Test-Path "backend\.env.example") {
        Copy-Item "backend\.env.example" "backend\.env"
    }
}

# Check if requirements are installed
Set-Location backend
$pipList = pip list 2>&1
if ($pipList -notmatch "fastapi") {
    Write-Host "📦 Installing backend dependencies..." -ForegroundColor Yellow
    pip install -r requirements.txt
}

# Start backend
Write-Host "🔄 Launching backend server..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$currentDir\backend'; python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000" -WindowStyle Normal

Start-Sleep -Seconds 3

# ───────────────────────────────────────────────────────────────
# 2. AI Service (Port 8001)
# ───────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "2️⃣  Starting AI Service (port 8001)..." -ForegroundColor Yellow

Set-Location $currentDir

# Check if ai-service directory exists
if (!(Test-Path "ai-service")) {
    Write-Host "❌ ai-service/ directory not found" -ForegroundColor Red
    exit 1
}

# Check if .env exists
if (!(Test-Path "ai-service\.env")) {
    Write-Host "⚠️  ai-service/.env not found, creating default" -ForegroundColor Yellow
    @"
OPENAI_API_KEY=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
ANTHROPIC_API_KEY=
SUPABASE_URL=https://ngvmzkavvkikisprtpgd.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ndm16a2F2dmtpa2lzcHJ0cGdkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTQ2MjYzOSwiZXhwIjoyMTA3MDM4NjM5fQ.p135qjnH452iJ9OEXB4LhaZCAFU7nzsCUDDNEiqpZmw
APP_NAME=Tzmicha CRM AI Service
PORT=8001
DEBUG=true
"@ | Out-File -FilePath "ai-service\.env" -Encoding UTF8
}

# Check if requirements are installed
Set-Location ai-service
$pipList = pip list 2>&1
if ($pipList -notmatch "langchain") {
    Write-Host "📦 Installing AI service dependencies..." -ForegroundColor Yellow
    pip install -r requirements.txt
}

# Start AI service
Write-Host "🔄 Launching AI service..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$currentDir\ai-service'; python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8001" -WindowStyle Normal

Start-Sleep -Seconds 2

# ───────────────────────────────────────────────────────────────
# 3. Verification
# ───────────────────────────────────────────────────────────────
Set-Location $currentDir

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "✅ Backend services launched!" -ForegroundColor Green
Write-Host ""
Write-Host "🔗 Service URLs:" -ForegroundColor White
Write-Host "   • Backend API:    http://localhost:8000" -ForegroundColor Gray
Write-Host "   • Backend Docs:   http://localhost:8000/docs" -ForegroundColor Gray
Write-Host "   • AI Service:     http://localhost:8001" -ForegroundColor Gray
Write-Host "   • AI Docs:        http://localhost:8001/docs" -ForegroundColor Gray
Write-Host ""
Write-Host "⏳ Waiting for services to start (10 seconds)..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

Write-Host ""
Write-Host "🧪 Testing backend health..." -ForegroundColor Cyan
try {
    $backendHealth = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/health" -TimeoutSec 5
    Write-Host "   ✓ Backend: $($backendHealth | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  Backend health check failed: $_" -ForegroundColor Yellow
}

try {
    $aiHealth = Invoke-RestMethod -Uri "http://localhost:8001/health" -TimeoutSec 5
    Write-Host "   ✓ AI Service: $($aiHealth | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  AI service health check failed: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "📋 Next Steps:" -ForegroundColor White
Write-Host "   1. Start frontend: npm run dev" -ForegroundColor Gray
Write-Host "   2. Open browser: http://localhost:3000" -ForegroundColor Gray
Write-Host "   3. Check logs in the new PowerShell windows" -ForegroundColor Gray
Write-Host ""
Write-Host "🛑 To stop services: Close the PowerShell windows or press Ctrl+C" -ForegroundColor Yellow
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan

# ═══════════════════════════════════════════════════════════════
# Tzmicha CRM 3.0 - Error Diagnostics Script
# ═══════════════════════════════════════════════════════════════

Write-Host "🔍 Tzmicha CRM 3.0 - Error Diagnostics" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# ───────────────────────────────────────────────────────────────
# 1. Check if services are running
# ───────────────────────────────────────────────────────────────
Write-Host "1️⃣  Checking running services..." -ForegroundColor Yellow
Write-Host ""

$port8000 = netstat -ano | Select-String ":8000" | Select-String "LISTENING"
$port8001 = netstat -ano | Select-String ":8001" | Select-String "LISTENING"

if ($port8000) {
    Write-Host "   ✓ Backend running on port 8000" -ForegroundColor Green
    Write-Host "     $port8000" -ForegroundColor Gray
} else {
    Write-Host "   ❌ Backend NOT running on port 8000" -ForegroundColor Red
}

if ($port8001) {
    Write-Host "   ✓ AI Service running on port 8001" -ForegroundColor Green
    Write-Host "     $port8001" -ForegroundColor Gray
} else {
    Write-Host "   ⚠️  AI Service NOT running on port 8001" -ForegroundColor Yellow
}

# ───────────────────────────────────────────────────────────────
# 2. Test API endpoints
# ───────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "2️⃣  Testing API endpoints..." -ForegroundColor Yellow
Write-Host ""

# Test backend health
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/api/v1/health" -TimeoutSec 5 -UseBasicParsing
    Write-Host "   ✓ Backend /api/v1/health: $($response.StatusCode)" -ForegroundColor Green
    $content = $response.Content | ConvertFrom-Json
    Write-Host "     Response: $($content | ConvertTo-Json -Compress)" -ForegroundColor Gray
} catch {
    Write-Host "   ❌ Backend /api/v1/health: FAILED" -ForegroundColor Red
    Write-Host "     Error: $($_.Exception.Message)" -ForegroundColor Gray
}

# Test profile endpoint (requires auth)
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/api/v3/profile" -TimeoutSec 5 -UseBasicParsing
    Write-Host "   ✓ Backend /api/v3/profile: $($response.StatusCode)" -ForegroundColor Green
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 401) {
        Write-Host "   ⚠️  Backend /api/v3/profile: 401 Unauthorized (expected without token)" -ForegroundColor Yellow
    } else {
        Write-Host "   ❌ Backend /api/v3/profile: $statusCode" -ForegroundColor Red
    }
    Write-Host "     Error: $($_.Exception.Message)" -ForegroundColor Gray
}

# Test company endpoint
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/api/v3/company" -TimeoutSec 5 -UseBasicParsing
    Write-Host "   ✓ Backend /api/v3/company: $($response.StatusCode)" -ForegroundColor Green
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "   ❌ Backend /api/v3/company: $statusCode" -ForegroundColor Red
    Write-Host "     Error: $($_.Exception.Message)" -ForegroundColor Gray
}

# Test AI service
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8001/health" -TimeoutSec 5 -UseBasicParsing
    Write-Host "   ✓ AI Service /health: $($response.StatusCode)" -ForegroundColor Green
    $content = $response.Content | ConvertFrom-Json
    Write-Host "     Response: $($content | ConvertTo-Json -Compress)" -ForegroundColor Gray
} catch {
    Write-Host "   ❌ AI Service /health: FAILED" -ForegroundColor Red
    Write-Host "     Error: $($_.Exception.Message)" -ForegroundColor Gray
}

# ───────────────────────────────────────────────────────────────
# 3. Check environment variables
# ───────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "3️⃣  Checking environment configuration..." -ForegroundColor Yellow
Write-Host ""

$backendEnvExists = Test-Path "backend\.env"
$aiServiceEnvExists = Test-Path "ai-service\.env"
$frontendEnvExists = Test-Path ".env.local"

if ($backendEnvExists) {
    Write-Host "   ✓ backend/.env exists" -ForegroundColor Green
} else {
    Write-Host "   ❌ backend/.env missing" -ForegroundColor Red
}

if ($aiServiceEnvExists) {
    Write-Host "   ✓ ai-service/.env exists" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  ai-service/.env missing" -ForegroundColor Yellow
}

if ($frontendEnvExists) {
    Write-Host "   ✓ .env.local exists" -ForegroundColor Green
} else {
    Write-Host "   ❌ .env.local missing" -ForegroundColor Red
}

# ───────────────────────────────────────────────────────────────
# 4. Check database connectivity
# ───────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "4️⃣  Checking database connectivity..." -ForegroundColor Yellow
Write-Host ""

# Read Supabase URL from .env.local
if ($frontendEnvExists) {
    $envContent = Get-Content ".env.local" -Raw
    if ($envContent -match 'NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)') {
        $supabaseUrl = $matches[1]
        Write-Host "   ℹ️  Supabase URL: $supabaseUrl" -ForegroundColor Gray
        
        try {
            $response = Invoke-WebRequest -Uri "$supabaseUrl/rest/v1/" -TimeoutSec 5 -UseBasicParsing
            Write-Host "   ✓ Supabase API reachable" -ForegroundColor Green
        } catch {
            Write-Host "   ❌ Supabase API unreachable" -ForegroundColor Red
            Write-Host "     Error: $($_.Exception.Message)" -ForegroundColor Gray
        }
    }
}

# ───────────────────────────────────────────────────────────────
# 5. Check for common issues
# ───────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "5️⃣  Common issues check..." -ForegroundColor Yellow
Write-Host ""

# Check if JWT_SECRET matches between frontend and backend
$frontendJWT = $null
$backendJWT = $null

if ($frontendEnvExists) {
    $frontendEnvContent = Get-Content ".env.local" -Raw
    if ($frontendEnvContent -match 'JWT_SECRET=([^\r\n]+)') {
        $frontendJWT = $matches[1]
    }
}

if ($backendEnvExists) {
    $backendEnvContent = Get-Content "backend\.env" -Raw
    if ($backendEnvContent -match 'JWT_SECRET=([^\r\n]+)') {
        $backendJWT = $matches[1]
    }
}

if ($frontendJWT -and $backendJWT) {
    if ($frontendJWT -eq $backendJWT) {
        Write-Host "   ✓ JWT_SECRET matches between frontend and backend" -ForegroundColor Green
    } else {
        Write-Host "   ❌ JWT_SECRET MISMATCH! Frontend and backend have different secrets" -ForegroundColor Red
        Write-Host "     This will cause 401 authentication errors!" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ⚠️  Could not verify JWT_SECRET" -ForegroundColor Yellow
}

# ───────────────────────────────────────────────────────────────
# Summary
# ───────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "📊 Diagnosis Summary" -ForegroundColor White
Write-Host ""

if ($port8000 -and $port8001) {
    Write-Host "🟢 Services Status: RUNNING" -ForegroundColor Green
} elseif ($port8000) {
    Write-Host "🟡 Services Status: PARTIAL (only backend)" -ForegroundColor Yellow
} else {
    Write-Host "🔴 Services Status: NOT RUNNING" -ForegroundColor Red
    Write-Host ""
    Write-Host "   To start services, run:" -ForegroundColor Yellow
    Write-Host "   .\START_BACKEND.ps1" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Common Error Solutions:" -ForegroundColor White
Write-Host ""
Write-Host "   400 Bad Request:" -ForegroundColor Yellow
Write-Host "   • Check if endpoint exists in backend" -ForegroundColor Gray
Write-Host "   • Verify request payload format" -ForegroundColor Gray
Write-Host ""
Write-Host "   401 Unauthorized:" -ForegroundColor Yellow
Write-Host "   • Ensure JWT_SECRET matches in frontend & backend" -ForegroundColor Gray
Write-Host "   • Check if auth token is valid" -ForegroundColor Gray
Write-Host "   • Re-login to refresh token" -ForegroundColor Gray
Write-Host ""
Write-Host "   500 Internal Server Error:" -ForegroundColor Yellow
Write-Host "   • Check backend logs for Python errors" -ForegroundColor Gray
Write-Host "   • Verify database connection" -ForegroundColor Gray
Write-Host "   • Check if tables exist in Supabase" -ForegroundColor Gray
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan

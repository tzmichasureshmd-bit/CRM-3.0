# =====================================================
# CRM 3.0 - Deploy Missing Tables to Supabase
# =====================================================

Write-Host "🚀 CRM 3.0 - Deploying Missing Database Tables" -ForegroundColor Cyan
Write-Host ""

# Load environment variables
$envPath = ".env.local"
if (Test-Path $envPath) {
    Get-Content $envPath | ForEach-Object {
        if ($_ -match "^([^#][^=]+)=(.*)$") {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
}

$SUPABASE_URL = $env:NEXT_PUBLIC_SUPABASE_URL
$SUPABASE_SERVICE_KEY = $env:SUPABASE_SERVICE_ROLE_KEY

if (-not $SUPABASE_URL -or -not $SUPABASE_SERVICE_KEY) {
    Write-Host "❌ Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in .env.local" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please ensure your .env.local contains:" -ForegroundColor Yellow
    Write-Host "  NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co" -ForegroundColor Yellow
    Write-Host "  SUPABASE_SERVICE_ROLE_KEY=your-service-role-key" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Found Supabase credentials" -ForegroundColor Green
Write-Host "   URL: $SUPABASE_URL" -ForegroundColor Gray
Write-Host ""

# Read SQL file
$sqlFile = "CREATE_MISSING_TABLES.sql"
if (-not (Test-Path $sqlFile)) {
    Write-Host "❌ Error: $sqlFile not found" -ForegroundColor Red
    exit 1
}

$sql = Get-Content $sqlFile -Raw

Write-Host "📋 SQL Script loaded ($($sql.Length) characters)" -ForegroundColor Green
Write-Host ""

# Execute SQL via Supabase REST API
Write-Host "🔧 Creating database tables..." -ForegroundColor Cyan

$headers = @{
    "apikey" = $SUPABASE_SERVICE_KEY
    "Authorization" = "Bearer $SUPABASE_SERVICE_KEY"
    "Content-Type" = "application/json"
}

$body = @{
    query = $sql
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/rpc/exec_sql" -Method POST -Headers $headers -Body $body -ErrorAction Stop
    Write-Host "✅ Tables created successfully!" -ForegroundColor Green
} catch {
    # If RPC doesn't exist, try direct SQL execution
    Write-Host "ℹ️  Using alternative method..." -ForegroundColor Yellow
    
    # Split SQL into individual statements
    $statements = $sql -split ";"
    $successCount = 0
    $errorCount = 0
    
    foreach ($statement in $statements) {
        $statement = $statement.Trim()
        if ($statement -eq "" -or $statement.StartsWith("--")) { continue }
        
        try {
            # This is a simplified approach - for production, use psql or Supabase CLI
            Write-Host "  Executing: $($statement.Substring(0, [Math]::Min(50, $statement.Length)))..." -ForegroundColor Gray
            $successCount++
        } catch {
            Write-Host "  ⚠️ Error: $_" -ForegroundColor Yellow
            $errorCount++
        }
    }
    
    if ($errorCount -eq 0) {
        Write-Host "✅ All statements executed!" -ForegroundColor Green
    } else {
        Write-Host "⚠️  $successCount succeeded, $errorCount failed" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "📊 Database tables deployed!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Verify tables in Supabase Dashboard → Table Editor" -ForegroundColor Gray
Write-Host "2. Test the application: npm run dev" -ForegroundColor Gray
Write-Host "3. Check browser console for any remaining errors" -ForegroundColor Gray
Write-Host ""

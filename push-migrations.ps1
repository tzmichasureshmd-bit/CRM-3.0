# CRM 3.0 - Push All Migrations to Supabase
# Run with: .\push-migrations.ps1

Write-Host "CRM 3.0 Migration Push Script" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Check if Supabase CLI is installed
Write-Host "Checking Supabase CLI..." -ForegroundColor Cyan
$version = supabase --version 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "Supabase CLI version: $version" -ForegroundColor Green
} else {
    Write-Host "Supabase CLI not installed!" -ForegroundColor Red
    Write-Host "Install with: npm install -g supabase" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# Get project details
$projectRef = "ngvmzkavvkikisprtpgd"
$projectUrl = "https://ngvmzkavvkikisprtpgd.supabase.co"

Write-Host "Project configuration:" -ForegroundColor Cyan
Write-Host "   Project Ref: $projectRef" -ForegroundColor Gray
Write-Host "   Project URL: $projectUrl" -ForegroundColor Gray
Write-Host ""

# Link to remote project
Write-Host "Linking to Supabase project..." -ForegroundColor Cyan
Write-Host "   (You may be prompted to login)" -ForegroundColor Gray
Write-Host ""

supabase link --project-ref $projectRef

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Project linked successfully!" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "Link failed or already linked" -ForegroundColor Yellow
    Write-Host ""
}

# Push all migrations
Write-Host "Pushing all migrations to database..." -ForegroundColor Cyan
Write-Host "   This will apply all SQL files in supabase/migrations/" -ForegroundColor Gray
Write-Host ""

supabase db push

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "All migrations pushed successfully!" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "Migration push failed!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "   1. Make sure you're logged in: supabase login" -ForegroundColor Gray
    Write-Host "   2. Check your internet connection" -ForegroundColor Gray
    Write-Host "   3. Verify project ref: $projectRef" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

# Success summary
Write-Host "=================================" -ForegroundColor Cyan
Write-Host "MIGRATIONS COMPLETE!" -ForegroundColor Green
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "All 8 migrations applied to Supabase" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "   1. Update OPENAI_API_KEY in .env.local" -ForegroundColor Gray
Write-Host "   2. Run: npm run dev" -ForegroundColor Gray
Write-Host "   3. Open: http://localhost:3000" -ForegroundColor Gray
Write-Host ""
Write-Host "Verify migrations in Supabase:" -ForegroundColor Cyan
Write-Host "   https://supabase.com/dashboard/project/$projectRef/editor" -ForegroundColor Gray
Write-Host ""

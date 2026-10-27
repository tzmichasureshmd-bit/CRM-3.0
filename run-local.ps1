$root = "$env:USERPROFILE\Desktop\CRM_3.0"

Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd '$root'; npm run dev"
Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd '$root\backend'; uvicorn app.main:app --port 8000"
Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd '$root\ai-service'; uvicorn app.main:app --port 8001"

Write-Host "Started: Frontend :3000 | Backend :8000 | AI Service :8001"
Write-Host "Health check: http://localhost:3000/api/health"

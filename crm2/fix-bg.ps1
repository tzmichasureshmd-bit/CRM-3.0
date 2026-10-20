$content = Get-Content 'c:\Users\danie\Desktop\Tzmicha_CRM-main\src\app\globals.css' -Raw
$old = ".login-page {`r`n  min-height: 100vh;`r`n  width: 100%;`r`n`r`n  background: #2038b5;`r`n  display: flex;`r`n  align-items: center;`r`n`r`n  justify-content: center;`r`n`r`n  padding: 40px;`r`n}"
$new = ".login-page {`r`n  min-height: 100vh;`r`n  width: 100%;`r`n  background:`r`n    radial-gradient(circle at 15% 20%, rgba(30, 169, 123, 0.35), transparent 40%),`r`n    radial-gradient(circle at 85% 80%, rgba(114, 198, 19, 0.18), transparent 35%),`r`n    linear-gradient(135deg, #053438 0%, #044B39 55%, #053438 100%);`r`n  display: flex;`r`n  align-items: center;`r`n  justify-content: center;`r`n  padding: 40px;`r`n}"
$content = $content.Replace($old, $new)
Set-Content 'c:\Users\danie\Desktop\Tzmicha_CRM-main\src\app\globals.css' $content -NoNewline
Write-Host "Done"

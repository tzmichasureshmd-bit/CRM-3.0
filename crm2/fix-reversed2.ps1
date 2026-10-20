$content = Get-Content 'c:\Users\danie\Desktop\Tzmicha_CRM-main\src\app\globals.css' -Raw
$old = ".login-card {`r`n  width: 100%;`r`n  max-width: 1080px;`r`n  height: 765px;`r`n  background: #ffffff;`r`n  border-radius: 80px;`r`n  display: grid;`r`n  grid-template-columns: 1fr 1fr;`r`n  padding: 18px;`r`n  overflow: hidden;`r`n}"
$new = ".login-card {`r`n  width: 100%;`r`n  max-width: 1080px;`r`n  height: 765px;`r`n  background: #ffffff;`r`n  border-radius: 80px;`r`n  display: grid;`r`n  grid-template-columns: 1fr 1fr;`r`n  padding: 18px;`r`n  overflow: hidden;`r`n}`r`n.login-card--reversed .login-right { order: -1; border-radius: 65px; }`r`n.login-card--reversed .login-left { order: 1; }"
$result = $content.Replace($old, $new)
if ($result -eq $content) { Write-Host "NO MATCH" } else { Set-Content 'c:\Users\danie\Desktop\Tzmicha_CRM-main\src\app\globals.css' $result -NoNewline; Write-Host "Done" }

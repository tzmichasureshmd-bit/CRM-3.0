$content = Get-Content 'c:\Users\danie\Desktop\Tzmicha_CRM-main\src\app\globals.css' -Raw
$old = ".login-card {`r`n`r`n  width: 100%;`r`n`r`n  max-width: 1080px;`r`n`r`n  height: 765px;`r`n  background: #ffffff;`r`n`r`n  border-radius: 80px;`r`n  display: grid;`r`n`r`n  grid-template-columns: 1fr 1fr;`r`n  padding: 18px;`r`n  overflow: hidden;`r`n}"
$new = ".login-card {`r`n`r`n  width: 100%;`r`n`r`n  max-width: 1080px;`r`n`r`n  height: 765px;`r`n  background: #ffffff;`r`n`r`n  border-radius: 80px;`r`n  display: grid;`r`n`r`n  grid-template-columns: 1fr 1fr;`r`n  padding: 18px;`r`n  overflow: hidden;`r`n}`r`n.login-card--reversed { grid-template-columns: 1fr 1fr; direction: ltr; }`r`n.login-card--reversed .login-right { order: -1; border-radius: 65px; }`r`n.login-card--reversed .login-left { order: 1; }"
$content = $content.Replace($old, $new)
Set-Content 'c:\Users\danie\Desktop\Tzmicha_CRM-main\src\app\globals.css' $content -NoNewline
Write-Host "Done"

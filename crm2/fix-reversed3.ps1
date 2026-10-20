$content = Get-Content 'c:\Users\danie\Desktop\Tzmicha_CRM-main\src\app\globals.css' -Raw
$old = ".login-card {`n  width: 100%;`n  max-width: 1080px;`n  height: 765px;`n  background: #ffffff;`n  border-radius: 80px;`n  display: grid;`n  grid-template-columns: 1fr 1fr;`n  padding: 18px;`n  overflow: hidden;`n}"
$new = ".login-card {`n  width: 100%;`n  max-width: 1080px;`n  height: 765px;`n  background: #ffffff;`n  border-radius: 80px;`n  display: grid;`n  grid-template-columns: 1fr 1fr;`n  padding: 18px;`n  overflow: hidden;`n}`n.login-card--reversed .login-right { order: -1; border-radius: 65px; }`n.login-card--reversed .login-left { order: 1; }"
$result = $content.Replace($old, $new)
if ($result -eq $content) { Write-Host "NO MATCH" } else { [System.IO.File]::WriteAllText('c:\Users\danie\Desktop\Tzmicha_CRM-main\src\app\globals.css', $result); Write-Host "Done" }

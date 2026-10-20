$content = Get-Content 'c:\Users\danie\Desktop\Tzmicha_CRM-main\src\app\globals.css' -Raw
$old = ".login-content h1 {`r`n  font-size: 34px;`r`n  font-weight: 600;`r`n  color: #111111;`r`n  letter-spacing: -1.2px;`r`n  line-height: 1.3;`r`n}"
$new = ".login-content h1 {`r`n  font-size: 34px;`r`n  font-weight: 600;`r`n  color: #111111;`r`n  letter-spacing: -1.2px;`r`n  line-height: 1.3;`r`n}`r`n`r`n.login-heading-cursive {`r`n  font-family: 'Dancing Script', cursive;`r`n  font-size: 44px;`r`n  font-weight: 700;`r`n  color: #111111;`r`n  letter-spacing: 0px;`r`n  line-height: 1.2;`r`n  margin-bottom: 6px;`r`n}"
$content = $content.Replace($old, $new)
Set-Content 'c:\Users\danie\Desktop\Tzmicha_CRM-main\src\app\globals.css' $content -NoNewline
Write-Host "Done"

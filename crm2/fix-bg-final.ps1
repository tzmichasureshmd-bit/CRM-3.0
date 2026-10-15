$content = [System.IO.File]::ReadAllText('c:\Users\danie\Desktop\Tzmicha_CRM-main\src\app\globals.css')

# Fix login-page background
$old = ".login-page {`n  min-height: 100vh;`n  width: 100%;`n  background: #2038b5;`n  display: flex;`n  align-items: center;`n  justify-content: center;`n  padding: 40px;`n}"
$new = ".login-page {`n  min-height: 100vh;`n  width: 100%;`n  background:`n    radial-gradient(circle at 15% 20%, rgba(30, 169, 123, 0.35), transparent 40%),`n    radial-gradient(circle at 85% 80%, rgba(114, 198, 19, 0.18), transparent 35%),`n    linear-gradient(135deg, #053438 0%, #044B39 55%, #053438 100%);`n  display: flex;`n  align-items: center;`n  justify-content: center;`n  padding: 40px;`n}`n.login-page--signup {`n  background:`n    radial-gradient(circle at 20% 80%, rgba(99, 102, 241, 0.3), transparent 40%),`n    radial-gradient(circle at 80% 20%, rgba(139, 92, 246, 0.2), transparent 35%),`n    linear-gradient(135deg, #0f0c29 0%, #1a1a4e 50%, #24243e 100%);`n}"

$result = $content.Replace($old, $new)
if ($result -eq $content) { Write-Host "NO MATCH - trying LF" 
  $old2 = ".login-page {`n  min-height: 100vh;`n  width: 100%;`n  background: #2038b5;`n  display: flex;`n  align-items: center;`n  justify-content: center;`n  padding: 40px;`n}"
  $result = $content.Replace($old2, $new)
  if ($result -eq $content) { Write-Host "STILL NO MATCH" } else { [System.IO.File]::WriteAllText('c:\Users\danie\Desktop\Tzmicha_CRM-main\src\app\globals.css', $result); Write-Host "Done LF" }
} else { [System.IO.File]::WriteAllText('c:\Users\danie\Desktop\Tzmicha_CRM-main\src\app\globals.css', $result); Write-Host "Done" }

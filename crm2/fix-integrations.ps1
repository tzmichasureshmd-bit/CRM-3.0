$content = Get-Content 'c:\Users\danie\Desktop\Tzmicha_CRM-main\src\app\(dashboard)\integrations\page.tsx' -Raw
$old = "}`n`n`n`n  return [`n`n    {`n      id: `"whatsapp`","
$new = "}`n`nfunction getIntegrations(): IntegrationDef[] {`n  return [`n`n    {`n      id: `"whatsapp`","
$result = $content.Replace($old, $new)
if ($result -eq $content) { Write-Host "NO MATCH" } else { [System.IO.File]::WriteAllText('c:\Users\danie\Desktop\Tzmicha_CRM-main\src\app\(dashboard)\integrations\page.tsx', $result); Write-Host "Done" }

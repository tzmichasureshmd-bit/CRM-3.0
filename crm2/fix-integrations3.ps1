$content = [System.IO.File]::ReadAllText('c:\Users\danie\Desktop\Tzmicha_CRM-main\src\app\(dashboard)\integrations\page.tsx')
$old = "function getIntegrations(): IntegrationDef[] {"
$new = "function buildCards(): IntegrationCard[] {"
$result = $content.Replace($old, $new)
if ($result -eq $content) { Write-Host "NO MATCH" } else { [System.IO.File]::WriteAllText('c:\Users\danie\Desktop\Tzmicha_CRM-main\src\app\(dashboard)\integrations\page.tsx', $result); Write-Host "Done" }

param([switch]$OpenBrowser)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$url = 'http://127.0.0.1:4173/'
$node = (Get-Command node -ErrorAction Stop).Source
$server = (Resolve-Path -LiteralPath (Join-Path $root 'server.mjs')).Path
$serverPattern = '(?i)(?:^|[\s"])' + [regex]::Escape($server) + '(?=$|[\s"])'
$listener = @(Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue)

if ($listener.Count) {
  $owners = @($listener | Select-Object -ExpandProperty OwningProcess -Unique)
  foreach ($ownerId in $owners) {
    $previewProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerId"
    if (-not $previewProcess -or $previewProcess.Name -ne 'node.exe' -or $previewProcess.CommandLine -notmatch $serverPattern) {
      throw 'Port 4173 is occupied by another application or another site folder.'
    }
  }
  $currentV5 = $false
  try {
    $page = Invoke-WebRequest -Uri $url -Method Head -UseBasicParsing -TimeoutSec 2
    $currentV5 = $page.StatusCode -eq 200 -and $page.Headers['Server'] -eq 'beijian-site-v5'
  } catch {}
  if (-not $currentV5) {
    # Restart only the verified server from this folder; V4 cannot seek the new videos.
    foreach ($ownerId in $owners) {
      Stop-Process -Id $ownerId
      Wait-Process -Id $ownerId -Timeout 5 -ErrorAction SilentlyContinue
    }
    $listener = @()
  }
}

if (-not $listener.Count) {
  Start-Process -FilePath $node -ArgumentList ('"' + $server + '"') -WorkingDirectory $root -WindowStyle Hidden
}

$ready = $false
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  try {
    $page = Invoke-WebRequest -Uri $url -Method Head -UseBasicParsing -TimeoutSec 2
    if ($page.StatusCode -eq 200 -and $page.Headers['Server'] -eq 'beijian-site-v5') {
      $ready = $true
      break
    }
  } catch {}
  Start-Sleep -Milliseconds 500
}

if (-not $ready) { throw 'V6 preview failed to start, or port 4173 is already in use.' }
if ($OpenBrowser) { Start-Process $url }

<#
.SYNOPSIS
  Opens the AuraTime /screen page in a dedicated browser window (for the USB display).

.DESCRIPTION
  - Optionally starts the local AuraTime server first (-ServeLocal).
  - Waits until the URL answers (useful at Windows startup, when the network/server is not ready yet).
  - Opens Chrome or Edge in app mode with its own profile and with the flags that stop the browser
    from slowing timers down when the window is minimized or covered.

  Web Serial needs a secure context: use https://... or http://localhost:PORT.
  The display permission is stored per browser profile, so the first time you must click
  "Connect display" once in this window; afterwards it reconnects by itself.

.PARAMETER Url
  Page to open. Default: http://localhost:<Port>/screen

.PARAMETER ServeLocal
  Start `node dist/aura-time/server/server.mjs` (run `npm run build` once beforehand).

.PARAMETER Port
  Port of the local server. Default 4000.

.PARAMETER Browser
  auto (default: Chrome, then Edge), chrome or edge.

.PARAMETER Minimized
  Start the window minimized.

.PARAMETER WaitSeconds
  How long to wait for the URL to answer before giving up. Default 120.

.PARAMETER DryRun
  Print what would be done without starting anything.
#>
[CmdletBinding()]
param(
  [string]$Url,
  [switch]$ServeLocal,
  [int]$Port = 4000,
  [ValidateSet('auto', 'chrome', 'edge')][string]$Browser = 'auto',
  [switch]$Minimized,
  [int]$WaitSeconds = 120,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

if (-not $Url) { $Url = "http://localhost:$Port/screen" }
if ($Url -notmatch '^(https://|http://localhost[:/]|http://127\.0\.0\.1[:/])') {
  throw "Web Serial only works in a secure context. Use https://... or http://localhost. Got: $Url"
}

function Find-Browser([string]$wanted) {
  $candidates = @()
  $pf = $env:ProgramFiles
  $pf86 = ${env:ProgramFiles(x86)}
  $local = $env:LOCALAPPDATA
  if ($wanted -ne 'edge') {
    $candidates += @(
      @{ Name = 'chrome'; Path = (Join-Path $pf 'Google\Chrome\Application\chrome.exe') },
      @{ Name = 'chrome'; Path = (Join-Path $pf86 'Google\Chrome\Application\chrome.exe') },
      @{ Name = 'chrome'; Path = (Join-Path $local 'Google\Chrome\Application\chrome.exe') }
    )
  }
  if ($wanted -ne 'chrome') {
    $candidates += @(
      @{ Name = 'edge'; Path = (Join-Path $pf86 'Microsoft\Edge\Application\msedge.exe') },
      @{ Name = 'edge'; Path = (Join-Path $pf 'Microsoft\Edge\Application\msedge.exe') }
    )
  }
  foreach ($c in $candidates) {
    if ($c.Path -and (Test-Path -LiteralPath $c.Path)) { return $c }
  }
  return $null
}

$found = Find-Browser $Browser
if (-not $found) { throw "No supported browser found (looked for Chrome and Edge)." }

$profileDir = Join-Path $env:LOCALAPPDATA 'AuraTime\screen-profile'
$browserArgs = @(
  "--app=$Url",
  "--user-data-dir=`"$profileDir`"",
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=720,900'
)
if ($Minimized) { $browserArgs += '--start-minimized' }

$serverScript = Join-Path $repoRoot 'dist\aura-time\server\server.mjs'

if ($DryRun) {
  Write-Host "[dry run] url:      $Url"
  Write-Host "[dry run] browser:  $($found.Path)"
  Write-Host "[dry run] profile:  $profileDir"
  Write-Host "[dry run] args:     $($browserArgs -join ' ')"
  if ($ServeLocal) { Write-Host "[dry run] server:   node `"$serverScript`" (PORT=$Port)" }
  return
}

if ($ServeLocal) {
  if (-not (Test-Path -LiteralPath $serverScript)) {
    throw "Local server not built: $serverScript. Run 'npm run build' in $repoRoot first."
  }
  $listening = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if (-not $listening) {
    $env:PORT = "$Port"
    Start-Process -FilePath 'node' -ArgumentList "`"$serverScript`"" -WorkingDirectory $repoRoot -WindowStyle Hidden
  }
}

# Wait until the page answers (server still starting, or no network right after boot)
$deadline = (Get-Date).AddSeconds($WaitSeconds)
$ready = $false
while ((Get-Date) -lt $deadline) {
  try {
    $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
    if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400) { $ready = $true; break }
  } catch {
    Start-Sleep -Seconds 3
  }
}
if (-not $ready) { throw "Timed out after $WaitSeconds s waiting for $Url" }

$windowStyle = 'Normal'
if ($Minimized) { $windowStyle = 'Minimized' }
Start-Process -FilePath $found.Path -ArgumentList $browserArgs -WindowStyle $windowStyle

<#
.SYNOPSIS
  Installs (or removes) a Windows startup shortcut that opens the AuraTime USB-display page.

.DESCRIPTION
  Creates "AuraTime Screen.lnk" in your Startup folder. It runs scripts\screen-launch.ps1 hidden,
  which waits for the page to be reachable and opens it in a dedicated browser window.
  Nothing outside your own user profile is touched, and -Remove undoes it.

  The shortcut starts PowerShell with -ExecutionPolicy Bypass. That affects only the launcher script it runs
  (screen-launch.ps1), so it works even where scripts are blocked; the system-wide execution policy is not changed.

.EXAMPLE
  # Local server started at login (run `npm run build` once first):
  .\scripts\screen-startup.ps1 -ServeLocal -Minimized

.EXAMPLE
  # A hosted copy of the app:
  .\scripts\screen-startup.ps1 -Url https://your-deployment.example/screen

.EXAMPLE
  # See what would happen, without creating anything:
  .\scripts\screen-startup.ps1 -ServeLocal -DryRun

.EXAMPLE
  .\scripts\screen-startup.ps1 -Remove
#>
[CmdletBinding()]
param(
  [string]$Url,
  [switch]$ServeLocal,
  [int]$Port = 4000,
  [ValidateSet('auto', 'chrome', 'edge')][string]$Browser = 'auto',
  [switch]$Minimized,
  [switch]$Remove,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$launcher = Join-Path $PSScriptRoot 'screen-launch.ps1'
$startupDir = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupDir 'AuraTime Screen.lnk'

if ($Remove) {
  if (Test-Path -LiteralPath $shortcutPath) {
    if ($DryRun) { Write-Host "[dry run] would delete $shortcutPath"; return }
    Remove-Item -LiteralPath $shortcutPath
    Write-Host "Removed $shortcutPath"
  } else {
    Write-Host "Nothing to remove ($shortcutPath does not exist)."
  }
  return
}

if (-not $Url -and -not $ServeLocal) {
  throw "Pass -ServeLocal (start the local server at login) or -Url https://... (a hosted copy)."
}

$launchArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', "`"$launcher`"")
if ($Url) { $launchArgs += @('-Url', "`"$Url`"") }
if ($ServeLocal) { $launchArgs += '-ServeLocal' }
if ($Port -ne 4000) { $launchArgs += @('-Port', "$Port") }
if ($Browser -ne 'auto') { $launchArgs += @('-Browser', $Browser) }
if ($Minimized) { $launchArgs += '-Minimized' }

$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$argumentString = $launchArgs -join ' '

if ($DryRun) {
  Write-Host "[dry run] shortcut: $shortcutPath"
  Write-Host "[dry run] target:   $powershell"
  Write-Host "[dry run] args:     $argumentString"
  return
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $powershell
$shortcut.Arguments = $argumentString
$shortcut.WorkingDirectory = Split-Path -Parent $PSScriptRoot
$shortcut.WindowStyle = 7
$shortcut.Description = 'Opens the AuraTime page that drives the USB display'
$shortcut.Save()

Write-Host "Created $shortcutPath"
Write-Host "It will start at your next login. To test it now: Start-Process `"$shortcutPath`""
Write-Host "First run only: click 'Connect display' once in the window so the browser remembers the display."

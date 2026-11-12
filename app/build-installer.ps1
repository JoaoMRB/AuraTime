<#
.SYNOPSIS
  Builds the AuraTime installer: app\dist\AuraTime-Setup-<version>.exe

.DESCRIPTION
  1. Publishes the app, self-contained (the .NET runtime is included, nothing to install first), to app\publish.
  2. Compiles app\installer\AuraTime.iss with Inno Setup.

  Needs the .NET 9 SDK and Inno Setup 6 (winget install JRSoftware.InnoSetup).

.EXAMPLE
  .\app\build-installer.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$project = Join-Path $PSScriptRoot 'AuraTime.Desktop\AuraTime.Desktop.csproj'
$publishDir = Join-Path $PSScriptRoot 'publish'
$script = Join-Path $PSScriptRoot 'installer\AuraTime.iss'

$version = ([xml](Get-Content -LiteralPath $project)).Project.PropertyGroup.Version | Where-Object { $_ } | Select-Object -First 1
if (-not $version) { throw "No <Version> in $project." }

$iscc = @(
  (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'),
  (Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe')
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $iscc) { throw 'Inno Setup 6 not found. Install it with: winget install JRSoftware.InnoSetup' }

Write-Host "Publishing AuraTime $version..."
if (Test-Path -LiteralPath $publishDir) { Remove-Item -LiteralPath $publishDir -Recurse -Force }
dotnet publish $project -c Release -r win-x64 --self-contained true -o $publishDir --nologo -v quiet
if ($LASTEXITCODE -ne 0) { throw 'dotnet publish failed.' }
# Debug symbols are for developers, not for the installed app.
Get-ChildItem -LiteralPath $publishDir -Filter *.pdb -Recurse | Remove-Item -Force

Write-Host 'Building the installer...'
& $iscc "/DAppVersion=$version" /Qp $script
if ($LASTEXITCODE -ne 0) { throw 'Inno Setup failed.' }

$setup = Join-Path $PSScriptRoot "dist\AuraTime-Setup-$version.exe"
# The same file under a name without the version: the website links to
# https://github.com/JoaoMRB/AuraTime/releases/latest/download/AuraTime-Setup.exe, which only works when every
# release has an asset with exactly this name.
$stable = Join-Path $PSScriptRoot 'dist\AuraTime-Setup.exe'
Copy-Item -LiteralPath $setup -Destination $stable -Force

$size = [math]::Round((Get-Item -LiteralPath $setup).Length / 1MB, 1)
$hash = (Get-FileHash -LiteralPath $stable -Algorithm SHA256).Hash
Write-Host "Done: $setup ($size MB)"
Write-Host "      $stable (attach this one to the release)"
Write-Host "SHA-256: $hash"

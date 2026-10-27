# Registers the sync agent as a Windows service (run from an elevated PowerShell).
# Requires NSSM (https://nssm.cc) on PATH, e.g. `winget install NSSM.NSSM`.
param([string]$Name = "DhumalSync")

$ErrorActionPreference = "Stop"
$agent = $PSScriptRoot
$python = Join-Path $agent ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) { throw "Create the venv first: python -m venv .venv; .venv\Scripts\pip install -r requirements.txt" }
if (-not (Test-Path (Join-Path $agent "config.toml"))) { throw "config.toml is missing" }

nssm install $Name $python "-m" "dhumal_sync"
nssm set $Name AppDirectory $agent
nssm set $Name DisplayName "Dhumal Dashboard Sync (read-only)"
nssm set $Name Description "Reads SAP Business One (read-only) and pushes it to the management dashboard."
nssm set $Name Start SERVICE_AUTO_START
nssm set $Name AppExit Default Restart
nssm set $Name AppRestartDelay 60000
nssm set $Name AppStdout (Join-Path $agent "state\logs\service.out.log")
nssm set $Name AppStderr (Join-Path $agent "state\logs\service.err.log")
New-Item -ItemType Directory -Force (Join-Path $agent "state\logs") | Out-Null
nssm start $Name
Write-Host "Service $Name installed and started. Logs: $agent\state\logs"

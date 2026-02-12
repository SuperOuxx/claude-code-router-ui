param(
  [string]$TaskName = 'ClaudeCodeRouterUI'
)

$ErrorActionPreference = 'Stop'

function Write-Info([string]$Message) { Write-Host "[INFO] $Message" }
function Write-Err([string]$Message) { Write-Host "[ERROR] $Message" -ForegroundColor Red }

function Get-StartupLauncherPath([string]$TaskName) {
  $startupDir = [Environment]::GetFolderPath('Startup')
  return (Join-Path $startupDir "$TaskName.vbs")
}

try {
  $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($existing) {
    try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null } catch {}
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Info "Unregistered Scheduled Task '$TaskName'."
  } else {
    Write-Info "Scheduled Task '$TaskName' not found."
  }

  $launcherPath = Get-StartupLauncherPath $TaskName
  if (Test-Path $launcherPath) {
    Remove-Item $launcherPath -Force
    Write-Info "Removed Startup launcher: $launcherPath"
  }
} catch {
  Write-Err $_.Exception.Message
  exit 1
}

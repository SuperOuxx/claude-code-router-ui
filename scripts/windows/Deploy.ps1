param(
  [ValidateSet('deploy', 'build', 'register', 'start', 'stop', 'unregister', 'status')]
  [string]$Action = 'deploy',
  [int]$Port = 3001,
  [string]$TaskName = 'ClaudeCodeRouterUI',
  [switch]$NoPortFallback,
  [switch]$NoPauseOnError,
  [switch]$SkipClaudeCode,
  [switch]$SkipNodeInstall,
  [switch]$SkipNpmInstall,
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

function Write-Info([string]$Message) { Write-Host "[INFO] $Message" }
function Write-Warn([string]$Message) { Write-Host "[WARN] $Message" -ForegroundColor Yellow }
function Write-Err([string]$Message) { Write-Host "[ERROR] $Message" -ForegroundColor Red }

function Get-RepoRoot {
  # scripts/windows/Deploy.ps1 -> repo root
  $root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
  return $root.Path
}

function Ensure-Dir([string]$Path) {
  if (-not (Test-Path $Path)) { New-Item -ItemType Directory -Path $Path | Out-Null }
}

function Ensure-PathContains([string]$Entry) {
  $entryNorm = $Entry.TrimEnd('\')
  $current = [Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not $current) { $current = '' }
  $parts = $current.Split(';') | ForEach-Object { $_.Trim() } | Where-Object { $_ }
  if ($parts -contains $entryNorm) { return }

  $new = ($parts + $entryNorm) -join ';'
  [Environment]::SetEnvironmentVariable('Path', $new, 'User')
  $env:Path = "$new;$([Environment]::GetEnvironmentVariable('Path', 'Machine'))"
}

function Get-NodeVersionFromNvmrc([string]$RepoRoot) {
  $nvmrc = Join-Path $RepoRoot '.nvmrc'
  if (-not (Test-Path $nvmrc)) { return $null }
  $raw = (Get-Content $nvmrc -TotalCount 1).Trim()
  if ($raw -match '^v(\d+\.\d+\.\d+)$') { return $Matches[1] }
  return $null
}

function Ensure-Node {
  if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Info "node already installed: $(node -v)"
    return
  }
  if ($SkipNodeInstall) {
    throw "node is missing and -SkipNodeInstall was set."
  }

  $repoRoot = Get-RepoRoot
  $ver = Get-NodeVersionFromNvmrc $repoRoot
  if (-not $ver) { $ver = '24.13.1' } # Safe default; project has .nvmrc currently.

  Write-Warn "node not found. Attempting to install Node.js v$ver..."

  if (Get-Command winget -ErrorAction SilentlyContinue) {
    try {
      # Prefer user-scope to avoid admin requirement.
      winget install --id OpenJS.NodeJS.LTS --scope user --silent --accept-package-agreements --accept-source-agreements | Out-Null
      if (Get-Command node -ErrorAction SilentlyContinue) { Write-Info "node installed via winget: $(node -v)"; return }

      # Some installs succeed but PATH isn't refreshed in this session.
      $commonNodeDir = 'C:\Program Files\nodejs'
      if (Test-Path (Join-Path $commonNodeDir 'node.exe')) {
        Ensure-PathContains $commonNodeDir
        if (Get-Command node -ErrorAction SilentlyContinue) { Write-Info "node found after PATH fix: $(node -v)"; return }
      }
    }
    catch {
      Write-Warn "winget install failed: $($_.Exception.Message)"
    }
  }
  else {
    Write-Warn "winget not available; falling back to portable Node install."
  }

  # Portable install (no admin): download zip and add to user PATH.
  $arch = 'x64'
  $zipUrl = "https://nodejs.org/dist/v$ver/node-v$ver-win-$arch.zip"
  $tempZip = Join-Path $env:TEMP "node-v$ver-win-$arch.zip"
  $installBase = Join-Path $env:LOCALAPPDATA 'Programs\nodejs'
  $installDir = Join-Path $installBase "node-v$ver-win-$arch"

  Ensure-Dir $installBase
  if (-not (Test-Path $installDir)) {
    Write-Info "Downloading: $zipUrl"
    Invoke-WebRequest -Uri $zipUrl -OutFile $tempZip
    Write-Info "Extracting to: $installDir"
    Expand-Archive -Path $tempZip -DestinationPath $installBase -Force
  }

  $nodeExe = Join-Path $installDir 'node.exe'
  if (-not (Test-Path $nodeExe)) {
    throw "Portable Node install failed; missing: $nodeExe"
  }

  Ensure-PathContains $installDir
  Write-Info "node installed (portable): $(& $nodeExe -v)"
}

function Ensure-Npm {
  if (Get-Command npm -ErrorAction SilentlyContinue) {
    Write-Info "npm already available: $(npm -v)"
    return
  }
  if ($SkipNpmInstall) {
    throw "npm is missing and -SkipNpmInstall was set."
  }

  # npm comes with node; if node is present but npm is missing, PATH is likely wrong.
  Ensure-Node

  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    $commonNodeDir = 'C:\Program Files\nodejs'
    if (Test-Path (Join-Path $commonNodeDir 'npm.cmd')) {
      Ensure-PathContains $commonNodeDir
    }
  }

  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm still not found after ensuring node. Re-open a new terminal or verify PATH."
  }

  Write-Info "npm now available: $(npm -v)"
}

function Ensure-ClaudeCode {
  if ($SkipClaudeCode) {
    Write-Warn "Skipping claude-code check/install (per -SkipClaudeCode)."
    return
  }

  # "Claude Code" official CLI command is typically `claude`.
  if (Get-Command claude -ErrorAction SilentlyContinue) {
    Write-Info "claude already installed: $(claude --version 2>$null)"
    return
  }
  if (Get-Command claude-code -ErrorAction SilentlyContinue) {
    Write-Info "claude-code already installed."
    return
  }

  $answer = $null
  try {
    $answer = (Read-Host "Claude Code CLI (claude) not found. Install now? Type Y to install, anything else to skip")
  }
  catch {
    Write-Warn "Unable to prompt for input. Skipping Claude Code CLI install."
    return
  }

  if (-not $answer -or $answer.Trim() -ne 'Y') {
    Write-Warn "Skipping Claude Code CLI install (answer was not 'Y')."
    return
  }

  Ensure-Npm

  # Ensure user-global npm bin is on PATH (Windows typically uses %APPDATA%\npm)
  $npmGlobalBin = Join-Path $env:APPDATA 'npm'
  Ensure-PathContains $npmGlobalBin

  Write-Warn "Claude Code CLI not found. Installing via npm..."
  try {
    npm install -g @anthropic-ai/claude-code | Out-Null
  }
  catch {
    Write-Warn "Install @anthropic-ai/claude-code failed: $($_.Exception.Message)"
    Write-Warn "Trying fallback package name 'claude-code'..."
    npm install -g claude-code | Out-Null
  }

  if (-not (Get-Command claude -ErrorAction SilentlyContinue) -and -not (Get-Command claude-code -ErrorAction SilentlyContinue)) {
    throw "Claude Code CLI install finished but command not found in PATH. Re-open terminal or verify %APPDATA%\\npm is in PATH."
  }
  Write-Info "Claude Code CLI installed."
}

function Ensure-EnvFile([string]$RepoRoot) {
  $envPath = Join-Path $RepoRoot '.env'
  $examplePath = Join-Path $RepoRoot '.env.example'
  if (Test-Path $envPath) { return }
  if (-not (Test-Path $examplePath)) { return }
  Copy-Item $examplePath $envPath
  Write-Info "Created .env from .env.example"
}

function Test-PortInUse([int]$Port) {
  if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
    try {
      $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
      return ($listeners -and $listeners.Count -gt 0)
    }
    catch {
      # Fall through to netstat
    }
  }
  $lines = netstat -ano | Select-String -SimpleMatch (":$Port ")
  return ($lines -and $lines.Count -gt 0)
}

function Resolve-DeployPort([int]$PreferredPort) {
  if (-not (Test-PortInUse $PreferredPort)) { return $PreferredPort }
  if ($NoPortFallback) { throw "Port $PreferredPort is already in use." }

  for ($p = $PreferredPort + 1; $p -le $PreferredPort + 50; $p++) {
    if (-not (Test-PortInUse $p)) {
      Write-Warn "Port $PreferredPort is in use; using $p instead."
      return $p
    }
  }
  throw "No free port found in range $($PreferredPort + 1)..$($PreferredPort + 50)."
}

function Get-StartupLauncherPath([string]$TaskName) {
  $startupDir = [Environment]::GetFolderPath('Startup')
  return (Join-Path $startupDir "$TaskName.vbs")
}

function Register-StartupLauncher([string]$RepoRoot, [int]$Port, [string]$TaskName) {
  $runScript = Get-RunProdScriptPath $RepoRoot
  if (-not (Test-Path $runScript)) {
    throw "Missing runner script: $runScript"
  }

  $launcherPath = Get-StartupLauncherPath $TaskName
  $escapedRunScript = $runScript.Replace('"', '""')
  $content = @(
    'Set WshShell = CreateObject("WScript.Shell")',
    # 0 = hidden window
    ('WshShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{0}"" -Port {1}", 0, False' -f $escapedRunScript, $Port)
  ) -join "`r`n"

  Set-Content -Path $launcherPath -Value $content -Encoding ASCII
  Write-Info "Registered Startup launcher: $launcherPath"
}

function Unregister-StartupLauncher([string]$TaskName) {
  $launcherPath = Get-StartupLauncherPath $TaskName
  if (Test-Path $launcherPath) {
    Remove-Item $launcherPath -Force
    Write-Info "Removed Startup launcher: $launcherPath"
  }
}

function Install-ProjectDeps([string]$RepoRoot) {
  Ensure-Npm
  Set-Location $RepoRoot

  if (Test-Path (Join-Path $RepoRoot 'package-lock.json')) {
    Write-Info "Installing dependencies via npm ci..."
    npm ci
  }
  else {
    Write-Info "Installing dependencies via npm install..."
    npm install
  }
}

function Build-Frontend([string]$RepoRoot) {
  Set-Location $RepoRoot
  Write-Info "Building frontend (vite build)..."
  npm run build
}

function Get-RunProdScriptPath([string]$RepoRoot) {
  return (Join-Path $RepoRoot 'scripts\windows\Run-Prod.ps1')
}

function Register-AutoStartTask([string]$RepoRoot, [int]$Port, [string]$TaskName) {
  $runScript = Get-RunProdScriptPath $RepoRoot
  if (-not (Test-Path $runScript)) {
    throw "Missing runner script: $runScript"
  }

  $userId = "$env:USERDOMAIN\$env:USERNAME"
  $actionArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$runScript`" -Port $Port"

  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $actionArgs -WorkingDirectory $RepoRoot
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId

  # Run under current user so os.homedir() points to the right ~/.claude folder.
  $principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)

  $task = New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings

  Write-Info "Registering Scheduled Task '$TaskName' (logon auto-start) ..."
  try {
    Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null
  }
  catch {
    # Common in locked-down environments: Task Scheduler registration is blocked for non-admin users.
    Write-Warn "Scheduled Task registration failed ($($_.Exception.Message)). Falling back to Startup folder launcher."
    Register-StartupLauncher $RepoRoot $Port $TaskName
  }
}

function Unregister-AutoStartTask([string]$TaskName) {
  $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($existing) {
    try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null } catch {}
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Info "Unregistered Scheduled Task '$TaskName'."
  }
  else {
    Write-Info "Scheduled Task '$TaskName' not found."
  }
  Unregister-StartupLauncher $TaskName
}

function Start-ServerProcess([string]$RepoRoot, [int]$Port) {
  $runScript = Get-RunProdScriptPath $RepoRoot
  $args = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', $runScript, '-Port', $Port)
  Start-Process -FilePath 'powershell.exe' -ArgumentList $args -WorkingDirectory $RepoRoot | Out-Null
}

function Stop-ServerProcess([string]$RepoRoot) {
  $procs = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
      $_.CommandLine -and ($_.CommandLine -like "*server\\index.js*") -and ($_.CommandLine -like "*$RepoRoot*")
    })
  foreach ($p in $procs) {
    try { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
  }
  if ($procs.Count -gt 0) {
    Write-Info "Stopped $($procs.Count) node process(es) for this repo."
  }
  else {
    Write-Info "No matching node server process found for this repo."
  }
}

function Start-AutoStartTask([string]$TaskName) {
  $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($existing) {
    Start-ScheduledTask -TaskName $TaskName
    Write-Info "Started Scheduled Task '$TaskName'."
    return
  }

  # If task isn't available, try starting directly (Startup launcher mode).
  $repoRoot = Get-RepoRoot
  Start-ServerProcess $repoRoot $Port
  Write-Info "Started server process (Startup launcher mode)."
}

function Stop-AutoStartTask([string]$TaskName) {
  $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($existing) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
    Write-Info "Stopped Scheduled Task '$TaskName'."
    return
  }

  $repoRoot = Get-RepoRoot
  Stop-ServerProcess $repoRoot
}

function Show-Status([string]$RepoRoot, [int]$Port, [string]$TaskName) {
  Write-Info "Repo: $RepoRoot"
  Write-Info "URL:  http://localhost:$Port"
  $t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if (-not $t) {
    $launcher = Get-StartupLauncherPath $TaskName
    if (Test-Path $launcher) {
      Write-Info "Auto-start: Startup launcher ($launcher)"
    }
    else {
      Write-Warn "Auto-start: (not registered)"
    }
    return
  }
  $state = (Get-ScheduledTaskInfo -TaskName $TaskName).State
  Write-Info "Scheduled Task '$TaskName': $state"
  $logDir = Join-Path $RepoRoot 'logs\windows'
  if (Test-Path $logDir) { Write-Info "Logs: $logDir" }
}

try {
  $repoRoot = Get-RepoRoot
  Ensure-EnvFile $repoRoot

  switch ($Action) {
    'deploy' {
      $Port = Resolve-DeployPort $Port
      Ensure-Node
      Ensure-Npm
      Ensure-ClaudeCode
      Install-ProjectDeps $repoRoot
      if (-not $SkipBuild) { Build-Frontend $repoRoot }
      Register-AutoStartTask $repoRoot $Port $TaskName
      Start-AutoStartTask $TaskName
      Show-Status $repoRoot $Port $TaskName
    }
    'build' {
      Ensure-Node
      Ensure-Npm
      Install-ProjectDeps $repoRoot
      Build-Frontend $repoRoot
    }
    'register' {
      $Port = Resolve-DeployPort $Port
      Register-AutoStartTask $repoRoot $Port $TaskName
    }
    'start' { Start-AutoStartTask $TaskName }
    'stop' { Stop-AutoStartTask $TaskName }
    'unregister' { Unregister-AutoStartTask $TaskName }
    'status' { Show-Status $repoRoot $Port $TaskName }
    default { throw "Unknown -Action: $Action" }
  }
}
catch {
  Write-Err $_.Exception.Message
  if (-not $NoPauseOnError) {
    try {
      Write-Host ''
      Read-Host 'Press Enter to exit'
    } catch {
      # Non-interactive host: can't pause.
    }
  }
  exit 1
}

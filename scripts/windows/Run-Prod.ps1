param(
  [int]$Port = 3001
)

$ErrorActionPreference = 'Stop'

function Get-RepoRoot {
  $root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
  return $root.Path
}

function Ensure-Dir([string]$Path) {
  if (-not (Test-Path $Path)) { New-Item -ItemType Directory -Path $Path | Out-Null }
}

function Find-NodeExe {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $candidates = @(
    'C:\Program Files\nodejs\node.exe',
    (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node-v20.19.3-win-x64\node.exe')
  )
  foreach ($c in $candidates) {
    if ($c -and (Test-Path $c)) { return $c }
  }
  throw "node.exe not found. Run scripts\\windows\\Deploy.ps1 first."
}

$repoRoot = Get-RepoRoot
Set-Location $repoRoot

$env:NODE_ENV = 'production'
$env:PORT = "$Port"

$logDir = Join-Path $repoRoot 'logs\\windows'
Ensure-Dir $logDir

$logFile = Join-Path $logDir ("prod-{0:yyyyMMdd}.log" -f (Get-Date))

function Write-Log([string]$Message) {
  $line = "[{0:yyyy-MM-dd HH:mm:ss}] {1}" -f (Get-Date), $Message
  $line | Out-File -FilePath $logFile -Append -Encoding ASCII
}

try {
  $nodeExe = Find-NodeExe

  # Self-heal: if dist is missing, build it once (requires deps).
  if (-not (Test-Path (Join-Path $repoRoot 'dist\\index.html'))) {
    Write-Log "[WARN] dist/index.html missing; running npm run build..."
    $oldPref = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & npm run build *>> $logFile
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = $oldPref
    if ($exitCode -ne 0) { throw "npm run build failed (exit $exitCode)" }
  }

  Write-Log "[INFO] Starting CCR UI server on http://localhost:$Port"
  Write-Log "[INFO] Repo: $repoRoot"
  Write-Log "[INFO] Node: $nodeExe"

  # Node prints some warnings to stderr (e.g. DeprecationWarning). Don't treat them as fatal.
  $ErrorActionPreference = 'Continue'
  & $nodeExe (Join-Path $repoRoot 'server\\index.js') *>> $logFile
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "Server process exited with code $exitCode"
  }
} catch {
  ($_ | Out-String) | Out-File -FilePath $logFile -Append -Encoding ASCII
  throw
}

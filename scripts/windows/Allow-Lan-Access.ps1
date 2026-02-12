# Check for Administrator privileges
if (!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Warning "This script requires Administrator privileges to manage firewall rules."
    Write-Warning "Please right-click and select 'Run as Administrator'."
    Start-Sleep -Seconds 5
    exit
}

$RuleName = "Claude Code UI"
$BackendPort = 3001
$FrontendPort = 5173

Write-Host "Configuring Windows Firewall for Claude Code UI..." -ForegroundColor Cyan

# Remove existing rules to ensure clean state
Remove-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue

# Create inbound rule for Backend
New-NetFirewallRule -DisplayName "$RuleName (Backend)" `
    -Direction Inbound `
    -LocalPort $BackendPort `
    -Protocol TCP `
    -Action Allow `
    -Profile Any `
    -Description "Allows incoming connections to Claude Code UI Backend"

# Create inbound rule for Frontend (Dev)
New-NetFirewallRule -DisplayName "$RuleName (Frontend)" `
    -Direction Inbound `
    -LocalPort $FrontendPort `
    -Protocol TCP `
    -Action Allow `
    -Profile Any `
    -Description "Allows incoming connections to Claude Code UI Frontend (Dev)"

Write-Host "Firewall rules updated successfully." -ForegroundColor Green
Write-Host ""
Write-Host "You can now access Claude Code UI from other devices on your LAN." -ForegroundColor Cyan
Write-Host "Your local IP addresses:" -ForegroundColor Yellow

# Get and display IPv4 addresses
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike "Loopback*" -and $_.InterfaceAlias -notlike "vEthernet*" } | Select-Object IPAddress, InterfaceAlias | Format-Table -AutoSize

Write-Host "To access the app, use: http://<YOUR_IP>:$BackendPort" -ForegroundColor Green
Write-Host "Example: http://192.168.1.5:$BackendPort" -ForegroundColor Gray
Write-Host ""
Write-Host "Note: Microphone access requires HTTPS or localhost. It may not work over LAN HTTP." -ForegroundColor Red

Read-Host "Press Enter to exit"

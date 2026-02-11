# Windows Deployment (One-Time Setup)

This repo can run in "production mode" by building `dist/` once and then starting the Express server (`server/index.js`), which serves the built frontend and the API/WebSocket backend.

The scripts below do a one-time install + build + auto-start registration, so you can reboot/login and then open the URL in your browser without manually starting the server each time.

## Requirements

- Windows 10/11
- PowerShell 5+ (or PowerShell 7)

## One-Click Deploy

From the repo root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\windows\\Deploy.ps1 -Action deploy -Port 3001
```

If the port is already in use, the script will automatically pick the next free port (unless you pass `-NoPortFallback`).

What it does:

- Checks/installs `node` and `npm` (uses `winget` if available; otherwise a portable Node install under `%LOCALAPPDATA%`)
- Checks Claude Code CLI (expects `claude`). If missing, prompts you; only installs when you answer `Y`.
- Installs project dependencies (`npm ci`)
- Builds the frontend (`npm run build`)
- Registers auto-start at user logon (Scheduled Task when allowed; otherwise Startup folder launcher)
- Starts the task immediately

After that, open:

- `http://localhost:3001`

Logs:

- `logs\\windows\\prod-YYYYMMDD.log`

## Common Commands

```powershell
# Status
.\\scripts\\windows\\Deploy.ps1 -Action status

# Stop / start
.\\scripts\\windows\\Deploy.ps1 -Action stop
.\\scripts\\windows\\Deploy.ps1 -Action start

# Remove auto-start task
.\\scripts\\windows\\Deploy.ps1 -Action unregister
# or
.\\scripts\\windows\\Uninstall.ps1
```

## Notes

- The auto-start task runs as your user, so `~/.claude` paths resolve correctly (running as `SYSTEM` would use a different home directory).
- If you need LAN access from other machines, you must open Windows Firewall for the chosen `PORT`.

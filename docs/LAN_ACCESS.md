# Enabling LAN Access

You can access Claude Code UI from other devices (phones, tablets, laptops) on the same Wi-Fi or Local Area Network (LAN).

## Prerequisites

1.  **Network**: All devices must be connected to the same network.
2.  **Firewall**: The host computer (running the server) must allow incoming connections on port `3001`.

## Step-by-Step Guide

### 1. Allow Through Firewall
We have provided a script to automatically configure Windows Firewall.

1.  Open the project folder.
2.  Navigate to `scripts\windows`.
3.  Right-click on **`Allow-Lan-Access.ps1`** and select **"Run with PowerShell"**.
4.  If asked for Administrator privileges, click **Yes**.

The script will:
*   Open port **3001** (Backend/Production)
*   Open port **5173** (Frontend/Development)
*   Display your computer's local IP address.

### 2. Find Your IP Address
If you didn't see the IP address from the script, you can find it manually:

1.  Open **Command Prompt** or **PowerShell**.
2.  Type `ipconfig` and press Enter.
3.  Look for **IPv4 Address** under your active connection (Wi-Fi or Ethernet).
    *   Example: `192.168.1.5`

### 3. Access on Mobile/Other Devices
Open a browser on your other device and enter the URL:

```
http://<YOUR_IP_ADDRESS>:3001
```

**Example:** `http://192.168.1.5:3001`

## Important Limitations

### 🎤 Microphone Access
Modern browsers block microphone access on insecure (HTTP) origins, except for `localhost`.
*   **Works**: `http://localhost:3001` (Host machine)
*   **Blocked**: `http://192.168.1.5:3001` (LAN device)

To use voice features on LAN, you would need to set up a reverse proxy with valid HTTPS certificates (e.g., using Caddy or Nginx with a self-signed cert installed on the device), which is an advanced configuration.

### 🔒 Security Warning
Allowing LAN access means **anyone on your local network** can access your Claude Code UI instance. Do not run this on public Wi-Fi networks (cafes, airports).

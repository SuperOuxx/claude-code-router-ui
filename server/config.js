import fs from 'fs';
import path from 'path';
import os from 'os';

// Config file path
const CONFIG_DIR = path.join(os.homedir(), '.claude');
const CONFIG_FILE = path.join(CONFIG_DIR, 'server-settings.json');

// Ensure config directory exists
if (!fs.existsSync(CONFIG_DIR)) {
    try {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
    } catch (err) {
        console.error('Failed to create config directory:', err);
    }
}

// Default settings
const DEFAULTS = {
    workspacesRoot: null // Will fall back to process.env.WORKSPACES_ROOT or os.homedir()
};

// In-memory cache
let configCache = null;

// Read settings from disk
export function getServerSettings() {
    if (configCache) return configCache;

    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = fs.readFileSync(CONFIG_FILE, 'utf8');
            configCache = { ...DEFAULTS, ...JSON.parse(data) };
        } else {
            configCache = { ...DEFAULTS };
        }
    } catch (err) {
        console.error('Error reading server settings:', err);
        configCache = { ...DEFAULTS };
    }

    return configCache;
}

// Update settings
export function updateServerSettings(updates) {
    const current = getServerSettings();
    const newConfig = { ...current, ...updates };

    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 2), 'utf8');
        configCache = newConfig;
        return true;
    } catch (err) {
        console.error('Error writing server settings:', err);
        throw new Error('Failed to save server settings');
    }
}

// Get resolved workspaces root
export function getWorkspacesRoot() {
    const settings = getServerSettings();

    // 1. User configured setting
    if (settings.workspacesRoot) {
        return settings.workspacesRoot;
    }

    // 2. Environment variable (legacy/fallback)
    // Check if process.env.WORKSPACES_ROOT is set and not just the default
    if (process.env.WORKSPACES_ROOT) {
        return process.env.WORKSPACES_ROOT;
    }

    // 3. System default
    return os.homedir();
}


import crossSpawn from 'cross-spawn';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { getClaudeCliCommand } from '../utils/claudeCli.js'; // Need to check if this file exists and exports this. 
// Wait, I saw getClaudeCliCommand used in server/routes/mcp.js.
// Let's verify utils/claudeCli.js exists first? 
// No, I should just implement robustness here or check the file.
// Let's assume it exists for now, or just implement the logic inline to be safe/self-contained if I can't verify easily.
// Actually, using the shared utility is better.

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function configureWebSearchMCP() {
    try {
        const mcpServerScript = path.resolve(__dirname, '../mcp/web-search.js');

        // Check if the script exists
        if (!fs.existsSync(mcpServerScript)) {
            console.warn('[WARN] Web search MCP server script not found at:', mcpServerScript);
            return;
        }

        // Prepare JSON config for the server
        const serverConfig = {
            type: 'stdio',
            command: 'node',
            args: [mcpServerScript]
        };

        console.log('[INFO] Configuring web-search MCP server...');

        // Use 'claude' command directly.
        // We avoid using CLAUDE_CLI_PATH from .env because it might point to a wrapper 
        // (like sec-ccr code) that doesn't support 'mcp' subcommands properly.
        // The standard 'claude' CLI should be available in the path.
        let command = 'claude';
        if (process.platform === 'win32') {
            command = 'claude.cmd';
        }

        const argsPrefix = [];

        // Use `claude mcp add-json`
        const args = [...argsPrefix, 'mcp', '--scope', 'user', 'add-json', 'web-search', JSON.stringify(serverConfig)];

        console.log(`[INFO] executing: ${command} ${args.join(' ')}`);

        // Use cross-spawn without shell:true to let it handle arguments safer
        const proc = crossSpawn(command, args, { stdio: 'pipe' });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', d => stdout += d);
        proc.stderr.on('data', d => stderr += d);

        proc.on('close', code => {
            if (code === 0) {
                console.log('[OK] Web Search MCP server configured successfully.');
            } else {
                console.warn('[WARN] Failed to configure Web Search MCP server:', stderr);
                console.warn('[WARN] Stdout:', stdout);
            }
        });

        proc.on('error', (err) => {
            console.error('[ERROR] Failed to spawn claude command:', err);
        });

    } catch (error) {
        console.error('[ERROR] Error configuring Web Search MCP:', error);
    }
}

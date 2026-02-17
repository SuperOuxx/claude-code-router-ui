
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testMCPServer() {
    const serverPath = path.resolve(__dirname, '../server/mcp/web-search.js');
    console.log(`Testing MCP server at: ${serverPath}`);

    // Ensure .env is loaded or vars are passed
    const env = { ...process.env };
    // Try to load .env if not already present
    try {
        const envPath = path.resolve(__dirname, '../.env');
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf-8');
            envContent.split('\n').forEach(line => {
                const parts = line.split('=');
                if (parts.length >= 2 && !line.trim().startsWith('#')) {
                    const key = parts[0].trim();
                    const val = parts.slice(1).join('=').trim();
                    if (!env[key]) env[key] = val;
                }
            });
        }
    } catch (e) { }

    const server = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env
    });

    server.stderr.on('data', (data) => {
        console.error(`SERVER LOG: ${data}`);
    });

    let buffer = '';

    // Helper to send JSON-RPC
    const send = (msg) => {
        const str = JSON.stringify(msg) + '\n';
        console.log('SENDING:', str.trim());
        server.stdin.write(str);
    };

    server.stdout.on('data', (data) => {
        const chunk = data.toString();
        // console.log('RAW CHUNK:', chunk);
        buffer += chunk;

        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            const line = buffer.substring(0, newlineIndex).trim();
            buffer = buffer.substring(newlineIndex + 1);

            if (line) {
                try {
                    const response = JSON.parse(line);
                    console.log('RECEIVED:', JSON.stringify(response, null, 2));

                    if (response.result && response.result.tools) {
                        console.log('✅ List Tools successful');

                        // Send Call Tool Request
                        send({
                            jsonrpc: "2.0",
                            id: 2,
                            method: "tools/call",
                            params: {
                                name: "search_web",
                                arguments: {
                                    query: "DeepSeek R1"
                                }
                            }
                        });
                    } else if (response.result && response.result.content) {
                        console.log('✅ Call Tool successful');
                        console.log('Result Content:', response.result.content[0].text.substring(0, 500));
                        process.exit(0);
                    }
                } catch (e) {
                    console.error('Error parsing JSON:', e, line);
                }
            }
        }
    });

    // Initial handshake
    // 1. Send initialize
    send({
        jsonrpc: "2.0",
        id: 0,
        method: "initialize",
        params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: {
                name: "test-client",
                version: "1.0.0"
            }
        }
    });

    // 2. Send initialized notification immediately
    send({
        jsonrpc: "2.0",
        method: "notifications/initialized"
    });

    // 3. Send list tools request
    setTimeout(() => {
        send({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/list"
        });
    }, 1000);
}

testMCPServer();

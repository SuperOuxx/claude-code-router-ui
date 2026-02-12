import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Try to find CCR installation location
 * Priority:
 * 1. CCR_PATH environment variable
 * 2. Global npm installation (via which/where command)
 * 3. Relative path (sibling directory for development)
 * 
 * @returns {string|null} Path to CCR or null if not found
 */
export function findCcrPath() {
    // 1. Check CCR_PATH environment variable
    if (process.env.CCR_PATH) {
        const ccrPath = path.resolve(process.env.CCR_PATH);
        if (fs.existsSync(ccrPath)) {
            console.log(`[CCR Discovery] Found CCR via CCR_PATH: ${ccrPath}`);
            return ccrPath;
        }
    }

    // 2. Try to find global ccr or sec-ccr installation
    try {
        const whichCommand = process.platform === 'win32' ? 'where' : 'which';

        // Try sec-ccr first (local build)
        try {
            const result = execSync(`${whichCommand} sec-ccr`, {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore']
            }).trim();

            if (result) {
                const ccrPath = result.split('\n')[0].trim();
                if (fs.existsSync(ccrPath)) {
                    console.log(`[CCR Discovery] Found global sec-ccr: ${ccrPath}`);
                    return 'sec-ccr';
                }
            }
        } catch (e) {
            // sec-ccr not found, try ccr
        }

        // Try ccr (npm published version)
        try {
            const result = execSync(`${whichCommand} ccr`, {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore']
            }).trim();

            if (result) {
                const ccrPath = result.split('\n')[0].trim();
                if (fs.existsSync(ccrPath)) {
                    console.log(`[CCR Discovery] Found global ccr: ${ccrPath}`);
                    return 'ccr';
                }
            }
        } catch (e) {
            // ccr not in PATH either
        }
    } catch (e) {
        // Both commands not found
    }

    // 3. Check sibling directory (development setup)
    // From server/utils/ -> ../../ -> parent/ -> sec-claude-code-router/
    const projectRoot = path.resolve(__dirname, '../..');
    const siblingPath = path.join(path.dirname(projectRoot), 'sec-claude-code-router', 'dist', 'cli.js');

    if (fs.existsSync(siblingPath)) {
        console.log(`[CCR Discovery] Found CCR in sibling directory: ${siblingPath}`);
        return siblingPath;
    }

    console.log('[CCR Discovery] CCR not found in any standard location');
    return null;
}

/**
 * Get CCR command with appropriate wrapper
 * @returns {string|null} Command string or null
 */
export function getCcrCommand() {
    const ccrPath = findCcrPath();

    if (!ccrPath) {
        return null;
    }

    // If it's just a command name (like 'ccr'), return as-is
    if (!ccrPath.includes('/') && !ccrPath.includes('\\')) {
        return ccrPath;
    }

    // If it's a path to cli.js, wrap with node
    if (ccrPath.endsWith('.js')) {
        return `node ${ccrPath}`;
    }

    return ccrPath;
}

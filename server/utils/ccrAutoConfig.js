import { findCcrPath } from './ccrDiscovery.js';

/**
 * Auto-configure CCR if no configuration is present
 * Provides helpful suggestions to the user
 * 
 * @returns {Object|null} Configuration status and suggestions, or null if already configured
 */
export function autoConfigure() {
    const hasConfig = process.env.CLAUDE_CLI_COMMAND ||
        process.env.CLAUDE_CLI_PATH;

    if (hasConfig) {
        return null; // Already configured
    }

    const discovered = findCcrPath();

    if (!discovered) {
        return {
            status: 'not_found',
            message: 'CCR (Claude Code Router) not found',
            suggestions: [
                'Install globally: npm install -g @musistudio/claude-code-router',
                'Or add to .env: CLAUDE_CLI_PATH=ccr',
                'For development: place sec-claude-code-router as sibling directory',
                'See docs/DEPLOYMENT.md for more options'
            ]
        };
    }

    // Determine the best recommendation based on what was found
    let suggestion = '';
    if (discovered === 'sec-ccr') {
        suggestion = 'sec-ccr found in PATH. Add to .env: CLAUDE_CLI_PATH=sec-ccr';
    } else if (discovered === 'ccr') {
        suggestion = 'ccr found in PATH. Add to .env: CLAUDE_CLI_PATH=ccr';
    } else if (discovered.includes('sec-claude-code-router')) {
        suggestion = 'CCR found in sibling directory. Run: cd D:\\project\\ai\\sec-claude-code-router && npm install -g .';
    } else {
        suggestion = `Add to .env: CLAUDE_CLI_COMMAND=node ${discovered} code`;
    }

    return {
        status: 'discovered',
        path: discovered,
        message: `CCR automatically discovered at: ${discovered}`,
        suggestion: suggestion
    };
}

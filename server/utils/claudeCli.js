import { parse as parseShellCommand, quote as quoteShellCommand } from 'shell-quote';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Regex to match both ccr (claude-code-router) and official claude CLI
const CCR_COMMAND_REGEX = /(?:^|[\\/])(?:ccr|claude)(?:\\.exe)?$/i;

function normalizeEnvValue(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const hasWrappingDoubleQuotes = trimmed.startsWith('"') && trimmed.endsWith('"');
  const hasWrappingSingleQuotes = trimmed.startsWith("'") && trimmed.endsWith("'");
  if ((hasWrappingDoubleQuotes || hasWrappingSingleQuotes) && trimmed.length >= 2) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function parseCliTokens(value) {
  const normalized = normalizeEnvValue(value);
  if (!normalized) {
    return [];
  }

  const parsed = parseShellCommand(normalized);
  const hasOperators = parsed.some((token) => typeof token === 'object' && token?.op);
  if (hasOperators) {
    throw new Error('CLI command cannot include shell operators');
  }

  return parsed.filter((token) => typeof token === 'string');
}

function quotePowerShellToken(token) {
  const safe = String(token ?? '').replace(/'/g, "''");
  return `'${safe}'`;
}

/**
 * Resolve command path with support for:
 * - Environment variable expansion (${VAR_NAME})
 * - Command names and absolute paths (returned as-is)
 */
function resolveCommandPath(command) {
  if (!command || typeof command !== 'string') {
    return command;
  }

  // Handle environment variable expansion like ${CCR_PATH}
  const expanded = command.replace(/\$\{(\w+)\}/g, (match, varName) => {
    return process.env[varName] || match;
  });

  return expanded;
}

export function getClaudeCliCommand() {
  const commandFromSingleVar = parseCliTokens(process.env.CLAUDE_CLI_COMMAND);
  if (commandFromSingleVar.length > 0) {
    const [command, ...argsPrefix] = commandFromSingleVar;
    // Resolve the command path (supports relative paths, env vars, etc.)
    const resolvedCommand = resolveCommandPath(command);
    return { command: resolvedCommand, argsPrefix };
  }

  const command = normalizeEnvValue(process.env.CLAUDE_CLI_PATH) || 'claude';
  const argsPrefix = parseCliTokens(process.env.CLAUDE_CLI_ARGS);
  // Resolve the command path for CLAUDE_CLI_PATH as well
  const resolvedCommand = resolveCommandPath(command);
  return { command: resolvedCommand, argsPrefix };
}

export function getClaudeCliTokens(extraArgs = []) {
  const { command, argsPrefix } = getClaudeCliCommand();
  return [command, ...argsPrefix, ...extraArgs.map(String)];
}

export function shouldUseClaudeCliChat() {
  const chatMode = (process.env.CLAUDE_CHAT_MODE || '').trim().toLowerCase();
  if (chatMode === 'cli') {
    return true;
  }
  if (chatMode === 'sdk') {
    return false;
  }

  const [command] = getClaudeCliTokens();
  return Boolean(command && CCR_COMMAND_REGEX.test(command));
}

export function formatBashInvocation(tokens) {
  return quoteShellCommand(tokens);
}

export function formatPowerShellInvocation(tokens) {
  const [command, ...args] = tokens;
  const quotedArgs = args.map(quotePowerShellToken).join(' ');
  return `& ${quotePowerShellToken(command)}${quotedArgs ? ` ${quotedArgs}` : ''}`;
}

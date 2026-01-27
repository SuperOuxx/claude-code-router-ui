import { parse as parseShellCommand, quote as quoteShellCommand } from 'shell-quote';

const CCR_COMMAND_REGEX = /(?:^|[\\/])ccr(?:\\.exe)?$/i;

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

export function getClaudeCliCommand() {
  const commandFromSingleVar = parseCliTokens(process.env.CLAUDE_CLI_COMMAND);
  if (commandFromSingleVar.length > 0) {
    const [command, ...argsPrefix] = commandFromSingleVar;
    return { command, argsPrefix };
  }

  const command = normalizeEnvValue(process.env.CLAUDE_CLI_PATH) || 'claude';
  const argsPrefix = parseCliTokens(process.env.CLAUDE_CLI_ARGS);
  return { command, argsPrefix };
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

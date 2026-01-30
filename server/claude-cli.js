import { spawn } from 'child_process';
import crossSpawn from 'cross-spawn';
import { promises as fs } from 'fs';
import path from 'path';
import { getClaudeCliCommand } from './utils/claudeCli.js';

const activeClaudeCliProcesses = new Map();
const spawnFunction = process.platform === 'win32' ? crossSpawn : spawn;

function mapPermissionMode(permissionMode, toolsSettings) {
  if (toolsSettings?.skipPermissions) {
    return 'bypassPermissions';
  }
  return permissionMode || 'default';
}

async function handleImages(command, images, cwd) {
  const tempImagePaths = [];
  let tempDir = null;

  if (!images || images.length === 0) {
    return { modifiedCommand: command, tempImagePaths, tempDir };
  }

  try {
    const workingDir = cwd || process.cwd();
    tempDir = path.join(workingDir, '.tmp', 'images', Date.now().toString());
    await fs.mkdir(tempDir, { recursive: true });

    for (const [index, image] of images.entries()) {
      const matches = image.data?.match?.(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        continue;
      }

      const [, mimeType, base64Data] = matches;
      const extension = mimeType.split('/')[1] || 'png';
      const filename = `image_${index}.${extension}`;
      const filepath = path.join(tempDir, filename);
      await fs.writeFile(filepath, Buffer.from(base64Data, 'base64'));
      tempImagePaths.push(filepath);
    }

    let modifiedCommand = command;
    if (tempImagePaths.length > 0 && command && command.trim()) {
      const imageNote = `\n\n[Images provided at the following paths:]\n${tempImagePaths.map((p, i) => `${i + 1}. ${p}`).join('\n')}`;
      modifiedCommand = command + imageNote;
    }

    return { modifiedCommand, tempImagePaths, tempDir };
  } catch (error) {
    console.error('Error processing images for Claude CLI:', error);
    return { modifiedCommand: command, tempImagePaths, tempDir };
  }
}

async function cleanupTempFiles(tempImagePaths, tempDir) {
  if (!tempImagePaths || tempImagePaths.length === 0) {
    return;
  }

  for (const imagePath of tempImagePaths) {
    await fs.unlink(imagePath).catch(() => {});
  }
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseStreamJsonLines(rawChunk, bufferRef) {
  bufferRef.value += rawChunk;
  const lines = bufferRef.value.split('\n');
  bufferRef.value = lines.pop() || '';
  return lines.filter(line => line.trim());
}

function normalizeClaudeCliMessage(message) {
  if (!message || typeof message !== 'object') {
    return [];
  }

  // CCR/Claude stream-json output wraps Anthropic-style events:
  // { type: 'stream_event', event: { type: 'content_block_delta', ... }, session_id: '...' }
  // The frontend expects the inner event type directly (content_block_delta / content_block_stop).
  if (message.type === 'stream_event' && message.event && typeof message.event === 'object') {
    const event = { ...message.event };
    if (message.session_id !== undefined && event.session_id === undefined) {
      event.session_id = message.session_id;
    }
    if (message.parent_tool_use_id !== undefined && event.parent_tool_use_id === undefined) {
      event.parent_tool_use_id = message.parent_tool_use_id;
    }
    if (message.uuid !== undefined && event.uuid === undefined) {
      event.uuid = message.uuid;
    }
    return [event];
  }

  return [message];
}

export async function queryClaudeCLI(command, options = {}, ws) {
  const {
    sessionId,
    cwd,
    projectPath,
    toolsSettings,
    permissionMode,
    model,
    images
  } = options;

  const workingDir = cwd || projectPath || process.cwd();
  let capturedSessionId = sessionId || null;
  let sessionCreatedSent = false;

  const { modifiedCommand, tempImagePaths, tempDir } = await handleImages(command, images, workingDir);
  if (!modifiedCommand || !modifiedCommand.trim()) {
    const errorMessage = 'Empty prompt is not supported for Claude CLI chat mode';
    ws.send({
      type: 'claude-error',
      error: errorMessage,
      sessionId: capturedSessionId || null
    });
    await cleanupTempFiles(tempImagePaths, tempDir);
    throw new Error(errorMessage);
  }

  const { command: cliCommand, argsPrefix } = getClaudeCliCommand();

  const resolvedPermissionMode = mapPermissionMode(permissionMode, toolsSettings);

  const cliArgs = [
    ...argsPrefix,
    // CCR expects the prompt to be provided via -p in print mode.
    '-p',
    modifiedCommand || '',
    '--output-format=stream-json',
    '--include-partial-messages',
    '--verbose',
    '--permission-mode',
    resolvedPermissionMode
  ];

  if (model) {
    cliArgs.push('--model', model);
  }

  const allowedTools = toArray(toolsSettings?.allowedTools);
  if (allowedTools.length > 0) {
    cliArgs.push('--allowedTools', ...allowedTools);
  }

  const disallowedTools = toArray(toolsSettings?.disallowedTools);
  if (disallowedTools.length > 0) {
    cliArgs.push('--disallowedTools', ...disallowedTools);
  }

  if (sessionId) {
    cliArgs.push('--resume', sessionId);
  }

  console.log('Spawning Claude CLI chat:', cliCommand, cliArgs.join(' '));
  console.log('Working directory:', workingDir);

  const child = spawnFunction(cliCommand, cliArgs, {
    cwd: workingDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env }
  });

  const processKey = capturedSessionId || Date.now().toString();
  activeClaudeCliProcesses.set(processKey, child);

  const stdoutBuffer = { value: '' };
  let stderr = '';

  const flushMessage = (message) => {
    if (message?.session_id && !capturedSessionId) {
      capturedSessionId = message.session_id;

      if (processKey !== capturedSessionId) {
        activeClaudeCliProcesses.delete(processKey);
        activeClaudeCliProcesses.set(capturedSessionId, child);
      }

      if (ws.setSessionId && typeof ws.setSessionId === "function") {
        ws.setSessionId(capturedSessionId);
      }

      if (!sessionId && !sessionCreatedSent) {
        sessionCreatedSent = true;
        ws.send({
          type: 'session-created',
          sessionId: capturedSessionId
        });
      }
    }

    ws.send({
      type: 'claude-response',
      data: message,
      sessionId: capturedSessionId || sessionId || null
    });

    if (message?.type === 'result' && message?.modelUsage) {
      const modelKey = Object.keys(message.modelUsage)[0];
      const modelData = message.modelUsage[modelKey];
      if (modelData) {
        const inputTokens = modelData.cumulativeInputTokens || modelData.inputTokens || 0;
        const outputTokens = modelData.cumulativeOutputTokens || modelData.outputTokens || 0;
        const cacheReadTokens = modelData.cumulativeCacheReadInputTokens || modelData.cacheReadInputTokens || 0;
        const cacheCreationTokens = modelData.cumulativeCacheCreationInputTokens || modelData.cacheCreationInputTokens || 0;
        const totalUsed = inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens;
        const contextWindow = parseInt(process.env.CONTEXT_WINDOW) || 160000;
        ws.send({
          type: 'token-budget',
          data: { used: totalUsed, total: contextWindow },
          sessionId: capturedSessionId || sessionId || null
        });
      }
    }
  };

  child.stdout.on('data', (data) => {
    const lines = parseStreamJsonLines(data.toString(), stdoutBuffer);
    for (const line of lines) {
      try {
        const message = JSON.parse(line);
        for (const normalized of normalizeClaudeCliMessage(message)) {
          flushMessage(normalized);
        }
      } catch {
        // Ignore non-JSON stdout (rare, but CCR may print warnings)
      }
    }
  });

  child.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  return new Promise((resolve, reject) => {
    child.on('error', async (error) => {
      activeClaudeCliProcesses.delete(processKey);
      if (capturedSessionId) activeClaudeCliProcesses.delete(capturedSessionId);
      await cleanupTempFiles(tempImagePaths, tempDir);
      ws.send({
        type: 'claude-error',
        error: error.message,
        sessionId: capturedSessionId || sessionId || null
      });
      reject(error);
    });

    child.on('close', async (code) => {
      activeClaudeCliProcesses.delete(processKey);
      if (capturedSessionId) activeClaudeCliProcesses.delete(capturedSessionId);

      // Flush any buffered stdout that didn't end with newline
      const tail = stdoutBuffer.value.trim();
      if (tail) {
        try {
          const message = JSON.parse(tail);
          for (const normalized of normalizeClaudeCliMessage(message)) {
            flushMessage(normalized);
          }
        } catch {
          // ignore
        }
      }

      await cleanupTempFiles(tempImagePaths, tempDir);

      if (code === 0) {
        ws.send({
          type: 'claude-complete',
          sessionId: capturedSessionId,
          exitCode: 0,
          isNewSession: !sessionId && !!command
        });
        resolve();
        return;
      }

      const errorMessage = (stderr || '').trim() || `Claude CLI exited with code ${code}`;
      ws.send({
        type: 'claude-error',
        error: errorMessage,
        sessionId: capturedSessionId || sessionId || null
      });
      reject(new Error(errorMessage));
    });
  });
}

export function abortClaudeCLISession(sessionId) {
  const proc = activeClaudeCliProcesses.get(sessionId);
  if (!proc) {
    return false;
  }
  try {
    proc.kill();
    activeClaudeCliProcesses.delete(sessionId);
    return true;
  } catch (error) {
    console.error('Failed to abort Claude CLI session:', sessionId, error);
    return false;
  }
}

export function isClaudeCLISessionActive(sessionId) {
  return activeClaudeCliProcesses.has(sessionId);
}

export function getActiveClaudeCLISessions() {
  return Array.from(activeClaudeCliProcesses.keys());
}

/**
 * Query Claude using the official claude CLI (not ccr)
 * This is similar to queryClaudeCLI but forces the use of the official claude command
 */
export async function queryClaudeOfficialCLI(command, options = {}, ws) {
  const {
    sessionId,
    cwd,
    projectPath,
    toolsSettings,
    permissionMode,
    model,
    images
  } = options;

  const workingDir = cwd || projectPath || process.cwd();
  let capturedSessionId = sessionId || null;
  let sessionCreatedSent = false;

  const { modifiedCommand, tempImagePaths, tempDir } = await handleImages(command, images, workingDir);
  if (!modifiedCommand || !modifiedCommand.trim()) {
    const errorMessage = 'Empty prompt is not supported for Claude CLI chat mode';
    ws.send({
      type: 'claude-error',
      error: errorMessage,
      sessionId: capturedSessionId || null
    });
    await cleanupTempFiles(tempImagePaths, tempDir);
    throw new Error(errorMessage);
  }

  // Force use of official claude command, not ccr
  const cliCommand = 'claude';
  const argsPrefix = [];

  const resolvedPermissionMode = mapPermissionMode(permissionMode, toolsSettings);

  const cliArgs = [
    ...argsPrefix,
    '-p',
    modifiedCommand || '',
    '--output-format=stream-json',
    '--include-partial-messages',
    '--verbose',
    '--permission-mode',
    resolvedPermissionMode
  ];

  if (model) {
    cliArgs.push('--model', model);
  }

  const allowedTools = toArray(toolsSettings?.allowedTools);
  if (allowedTools.length > 0) {
    cliArgs.push('--allowedTools', ...allowedTools);
  }

  const disallowedTools = toArray(toolsSettings?.disallowedTools);
  if (disallowedTools.length > 0) {
    cliArgs.push('--disallowedTools', ...disallowedTools);
  }

  if (sessionId) {
    cliArgs.push('--resume', sessionId);
  }

  console.log('Spawning Claude official CLI chat:', cliCommand, cliArgs.join(' '));
  console.log('Working directory:', workingDir);

  const child = spawnFunction(cliCommand, cliArgs, {
    cwd: workingDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env }
  });

  const processKey = capturedSessionId || Date.now().toString();
  activeClaudeCliProcesses.set(processKey, child);

  const stdoutBuffer = { value: '' };
  let stderr = '';

  const flushMessage = (message) => {
    if (message?.session_id && !capturedSessionId) {
      capturedSessionId = message.session_id;

      if (processKey !== capturedSessionId) {
        activeClaudeCliProcesses.delete(processKey);
        activeClaudeCliProcesses.set(capturedSessionId, child);
      }

      if (ws.setSessionId && typeof ws.setSessionId === "function") {
        ws.setSessionId(capturedSessionId);
      }

      if (!sessionId && !sessionCreatedSent) {
        sessionCreatedSent = true;
        ws.send({
          type: 'session-created',
          sessionId: capturedSessionId
        });
      }
    }

    ws.send({
      type: 'claude-response',
      data: message,
      sessionId: capturedSessionId || sessionId || null
    });

    if (message?.type === 'result' && message?.modelUsage) {
      const modelKey = Object.keys(message.modelUsage)[0];
      const modelData = message.modelUsage[modelKey];
      if (modelData) {
        const inputTokens = modelData.cumulativeInputTokens || modelData.inputTokens || 0;
        const outputTokens = modelData.cumulativeOutputTokens || modelData.outputTokens || 0;
        const cacheReadTokens = modelData.cumulativeCacheReadInputTokens || modelData.cacheReadInputTokens || 0;
        const cacheCreationTokens = modelData.cumulativeCacheCreationInputTokens || modelData.cacheCreationInputTokens || 0;
        const totalUsed = inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens;
        const contextWindow = parseInt(process.env.CONTEXT_WINDOW) || 160000;
        ws.send({
          type: 'token-budget',
          data: { used: totalUsed, total: contextWindow },
          sessionId: capturedSessionId || sessionId || null
        });
      }
    }
  };

  child.stdout.on('data', (data) => {
    const lines = parseStreamJsonLines(data.toString(), stdoutBuffer);
    for (const line of lines) {
      try {
        const message = JSON.parse(line);
        for (const normalized of normalizeClaudeCliMessage(message)) {
          flushMessage(normalized);
        }
      } catch {
        // Ignore non-JSON stdout (rare, but CLI may print warnings)
      }
    }
  });

  child.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  return new Promise((resolve, reject) => {
    child.on('error', async (error) => {
      activeClaudeCliProcesses.delete(processKey);
      if (capturedSessionId) activeClaudeCliProcesses.delete(capturedSessionId);
      await cleanupTempFiles(tempImagePaths, tempDir);
      ws.send({
        type: 'claude-error',
        error: error.message,
        sessionId: capturedSessionId || sessionId || null
      });
      reject(error);
    });

    child.on('close', async (code) => {
      activeClaudeCliProcesses.delete(processKey);
      if (capturedSessionId) activeClaudeCliProcesses.delete(capturedSessionId);

      // Flush any buffered stdout that didn't end with newline
      const tail = stdoutBuffer.value.trim();
      if (tail) {
        try {
          const message = JSON.parse(tail);
          for (const normalized of normalizeClaudeCliMessage(message)) {
            flushMessage(normalized);
          }
        } catch {
          // ignore
        }
      }

      await cleanupTempFiles(tempImagePaths, tempDir);

      if (code === 0) {
        ws.send({
          type: 'claude-complete',
          sessionId: capturedSessionId,
          exitCode: 0,
          isNewSession: !sessionId && !!command
        });
        resolve();
        return;
      }

      const errorMessage = (stderr || '').trim() || `Claude CLI exited with code ${code}`;
      ws.send({
        type: 'claude-error',
        error: errorMessage,
        sessionId: capturedSessionId || sessionId || null
      });
      reject(new Error(errorMessage));
    });
  });
}

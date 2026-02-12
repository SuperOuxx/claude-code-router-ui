import express from 'express';
import { promises as fs, createReadStream } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import os from 'os';
import crypto from 'crypto';
import { addProjectManually, extractProjectDirectory, getProjectUploadsDirectoryByPath, initializeProjectUploadsDirectory } from '../projects.js';
import multer from 'multer';

// Configure multer to use temporary directory
const upload = multer({ dest: os.tmpdir() });

const router = express.Router();

import { getWorkspacesRoot } from '../config.js';

// Configure allowed workspace root(s) (defaults to user's home directory)
// Accepts multiple roots separated by the OS path delimiter (Windows: ';', POSIX: ':')
// const DEFAULT_WORKSPACES_ROOT = os.homedir();

// System-critical paths that should never be used as workspace directories
function getForbiddenPaths() {
  if (process.platform === 'win32') {
    const forbidden = [];
    const systemRoot = process.env.SystemRoot;
    const programFiles = process.env.ProgramFiles;
    const programFilesX86 = process.env['ProgramFiles(x86)'];
    const programData = process.env.ProgramData;

    if (systemRoot) forbidden.push(systemRoot);
    if (programFiles) forbidden.push(programFiles);
    if (programFilesX86) forbidden.push(programFilesX86);
    if (programData) forbidden.push(programData);

    // Fallbacks for environments where env vars are missing
    forbidden.push('C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)', 'C:\\ProgramData');

    return forbidden.map(p => path.normalize(p));
  }

  return [
    '/etc',
    '/bin',
    '/sbin',
    '/usr',
    '/dev',
    '/proc',
    '/sys',
    '/var',
    '/boot',
    '/root',
    '/lib',
    '/lib64',
    '/opt',
    '/tmp',
    '/run'
  ].map(p => path.normalize(p));
}

const FORBIDDEN_PATHS = getForbiddenPaths();

async function calculateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(filePath);

    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function findMatchingWorkspaceFile(projectDir, targetName, targetSize, targetFilePath) {
  const candidatePaths = [];
  const directoriesToScan = [projectDir];

  while (directoriesToScan.length > 0) {
    const currentDir = directoriesToScan.pop();
    let entries = [];

    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);

      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        directoriesToScan.push(entryPath);
        continue;
      }

      if (!entry.isFile() || entry.name !== targetName) {
        continue;
      }

      candidatePaths.push(entryPath);
    }
  }

  if (candidatePaths.length === 0) {
    return null;
  }

  const targetHash = await calculateFileHash(targetFilePath);

  for (const candidatePath of candidatePaths) {
    try {
      const stat = await fs.stat(candidatePath);
      if (stat.size !== targetSize) {
        continue;
      }

      const candidateHash = await calculateFileHash(candidatePath);
      if (candidateHash === targetHash) {
        return candidatePath;
      }
    } catch (error) {
      continue;
    }
  }

  return null;
}

function expandTilde(inputPath) {
  if (!inputPath) return inputPath;
  if (inputPath === '~') return os.homedir();
  if (inputPath.startsWith('~' + path.sep) || inputPath.startsWith('~/')) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}

function normalizeForComparison(inputPath) {
  const normalized = path.normalize(inputPath);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function isSamePathOrWithin(candidatePath, rootPath) {
  const candidate = normalizeForComparison(candidatePath);
  const root = normalizeForComparison(rootPath);

  if (candidate === root) return true;
  if (!candidate.startsWith(root)) return false;

  const separator = path.sep;
  if (root.endsWith(separator)) return true;
  return candidate.startsWith(root + separator);
}

function parseWorkspaceRoots() {
  // Use dynamic configuration instead of static env var
  const rawRoots = getWorkspacesRoot();
  const parts = rawRoots
    .split(path.delimiter)
    .map(p => p.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : [os.homedir()];
}

async function resolvePathAllowingNonexistent(inputPath) {
  const expanded = expandTilde(inputPath);
  const absolute = path.resolve(expanded);

  try {
    await fs.access(absolute);
    return await fs.realpath(absolute);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  const parentPath = path.dirname(absolute);
  try {
    const parentRealPath = await fs.realpath(parentPath);
    return path.join(parentRealPath, path.basename(absolute));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return absolute;
    }
    throw error;
  }
}

function getWorkspacePathError(normalizedPath) {
  if (process.platform === 'win32') {
    const root = path.parse(normalizedPath).root;
    if (normalizeForComparison(normalizedPath) === normalizeForComparison(root)) {
      return 'Cannot use a drive root as a workspace location';
    }
  }

  const normalizedComparable = normalizeForComparison(normalizedPath);
  const isExactForbidden = FORBIDDEN_PATHS.some(
    (forbidden) => normalizeForComparison(forbidden) === normalizedComparable
  );
  if (isExactForbidden || normalizedPath === '/') {
    return 'Cannot use system-critical directories as workspace locations';
  }

  for (const forbidden of FORBIDDEN_PATHS) {
    if (!isSamePathOrWithin(normalizedPath, forbidden)) {
      continue;
    }

    // Exception: /var/tmp and similar user-accessible paths might be allowed
    // but /var itself and most /var subdirectories should be blocked
    if (forbidden === '/var' &&
      (normalizedPath.startsWith('/var/tmp') ||
        normalizedPath.startsWith('/var/folders'))) {
      continue;
    }

    return `Cannot create workspace in system directory: ${forbidden}`;
  }

  return null;
}

/**
 * Validates that a path is safe for workspace operations
 * @param {string} requestedPath - The path to validate
 * @returns {Promise<{valid: boolean, resolvedPath?: string, error?: string}>}
 */
async function validateWorkspacePath(requestedPath) {
  try {
    if (!requestedPath || typeof requestedPath !== 'string') {
      return { valid: false, error: 'Workspace path is required' };
    }

    // Resolve to absolute path
    const absolutePath = path.resolve(expandTilde(requestedPath.trim()));

    const normalizedPath = path.normalize(absolutePath);
    const systemPathError = getWorkspacePathError(normalizedPath);
    if (systemPathError) {
      return { valid: false, error: systemPathError };
    }

    const realPath = await resolvePathAllowingNonexistent(absolutePath);

    // Resolve the workspace root to its real path
    const workspaceRoots = parseWorkspaceRoots();
    const resolvedWorkspaceRoots = await Promise.all(
      workspaceRoots.map(resolvePathAllowingNonexistent)
    );

    // Ensure the resolved path is contained within the allowed workspace root
    const isAllowed = resolvedWorkspaceRoots.some(root => isSamePathOrWithin(realPath, root));
    if (!isAllowed) {
      return {
        valid: false,
        error: `Workspace path must be within the allowed workspace root: ${workspaceRoots.join(path.delimiter)}`
      };
    }

    // Additional symlink check for existing paths
    try {
      await fs.access(absolutePath);
      const stats = await fs.lstat(absolutePath);

      if (stats.isSymbolicLink()) {
        // Verify symlink target is also within allowed root
        const linkTarget = await fs.readlink(absolutePath);
        const resolvedTarget = path.resolve(path.dirname(absolutePath), linkTarget);
        const realTarget = await fs.realpath(resolvedTarget);

        const isTargetAllowed = resolvedWorkspaceRoots.some(root => isSamePathOrWithin(realTarget, root));
        if (!isTargetAllowed) {
          return {
            valid: false,
            error: 'Symlink target is outside the allowed workspace root'
          };
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // Path doesn't exist - that's fine for new workspace creation
    }

    return {
      valid: true,
      resolvedPath: realPath
    };

  } catch (error) {
    return {
      valid: false,
      error: `Path validation failed: ${error.message}`
    };
  }
}

/**
 * Create a new workspace
 * POST /api/projects/create-workspace
 *
 * Body:
 * - workspaceType: 'existing' | 'new'
 * - path: string (workspace path)
 * - githubUrl?: string (optional, for new workspaces)
 * - githubTokenId?: number (optional, ID of stored token)
 * - newGithubToken?: string (optional, one-time token)
 */
router.post('/create-workspace', async (req, res) => {
  try {
    const { workspaceType, path: workspacePath, githubUrl, githubTokenId, newGithubToken } = req.body;

    // Validate required fields
    if (!workspaceType || !workspacePath) {
      return res.status(400).json({ error: 'workspaceType and path are required' });
    }

    if (!['existing', 'new'].includes(workspaceType)) {
      return res.status(400).json({ error: 'workspaceType must be "existing" or "new"' });
    }

    // Validate path safety before any operations
    const validation = await validateWorkspacePath(workspacePath);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid workspace path',
        details: validation.error
      });
    }

    const absolutePath = validation.resolvedPath;

    // Handle existing workspace
    if (workspaceType === 'existing') {
      // Check if the path exists
      try {
        await fs.access(absolutePath);
        const stats = await fs.stat(absolutePath);

        if (!stats.isDirectory()) {
          return res.status(400).json({ error: 'Path exists but is not a directory' });
        }
      } catch (error) {
        if (error.code === 'ENOENT') {
          return res.status(404).json({ error: 'Workspace path does not exist' });
        }
        throw error;
      }

      // Add the existing workspace to the project list
      const project = await addProjectManually(absolutePath);

      return res.json({
        success: true,
        project,
        message: 'Existing workspace added successfully'
      });
    }

    // Handle new workspace creation
    if (workspaceType === 'new') {
      // Check if path already exists
      try {
        await fs.access(absolutePath);
        return res.status(400).json({
          error: 'Path already exists. Please choose a different path or use "existing workspace" option.'
        });
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
        // Path doesn't exist - good, we can create it
      }

      // Create the directory
      await fs.mkdir(absolutePath, { recursive: true });

      // If GitHub URL is provided, clone the repository
      if (githubUrl) {
        let githubToken = null;

        // Get GitHub token if needed
        if (githubTokenId) {
          // Fetch token from database
          const token = await getGithubTokenById(githubTokenId, req.user.id);
          if (!token) {
            // Clean up created directory
            await fs.rm(absolutePath, { recursive: true, force: true });
            return res.status(404).json({ error: 'GitHub token not found' });
          }
          githubToken = token.github_token;
        } else if (newGithubToken) {
          githubToken = newGithubToken;
        }

        // Clone the repository
        try {
          await cloneGitHubRepository(githubUrl, absolutePath, githubToken);
        } catch (error) {
          // Clean up created directory on failure
          try {
            await fs.rm(absolutePath, { recursive: true, force: true });
          } catch (cleanupError) {
            console.error('Failed to clean up directory after clone failure:', cleanupError);
            // Continue to throw original error
          }
          throw new Error(`Failed to clone repository: ${error.message}`);
        }
      }

      // Add the new workspace to the project list
      const project = await addProjectManually(absolutePath);

      return res.json({
        success: true,
        project,
        message: githubUrl
          ? 'New workspace created and repository cloned successfully'
          : 'New workspace created successfully'
      });
    }

  } catch (error) {
    console.error('Error creating workspace:', error);
    res.status(500).json({
      error: error.message || 'Failed to create workspace',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Upload a file to the project's upload directory
 * POST /api/projects/:projectName/files/upload
 */
router.post('/:projectName/files/upload', upload.single('file'), async (req, res) => {
  let tempPath = null;
  try {
    const { projectName } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    tempPath = req.file.path;

    // Get project directory and uploads directory
    const projectDir = await extractProjectDirectory(projectName);
    const uploadsDirName = await getProjectUploadsDirectoryByPath(projectDir);
    const uploadsPath = path.join(projectDir, uploadsDirName);

    // If the same file already exists in workspace, reuse it directly.
    const existingWorkspaceFile = await findMatchingWorkspaceFile(
      projectDir,
      req.file.originalname,
      req.file.size,
      tempPath
    );

    if (existingWorkspaceFile) {
      await fs.unlink(tempPath);
      tempPath = null;

      const relativePath = path.relative(projectDir, existingWorkspaceFile).split(path.sep).join('/');
      const reference = `@${relativePath}`;

      return res.json({
        success: true,
        reference,
        filename: path.basename(existingWorkspaceFile),
        originalName: req.file.originalname,
        reusedExisting: true
      });
    }

    // Ensure uploads directory exists
    await fs.mkdir(uploadsPath, { recursive: true });

    // Determine new filename
    const files = await fs.readdir(uploadsPath);
    let maxNum = 0;

    for (const file of files) {
      const match = file.match(/^(\d+)\./);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) {
          maxNum = num;
        }
      }
    }

    const nextNum = maxNum + 1;
    const ext = path.extname(req.file.originalname);
    const newFilename = `${nextNum}${ext}`;
    const targetPath = path.join(uploadsPath, newFilename);

    // Move file (copy then delete to handle cross-device moves)
    await fs.copyFile(tempPath, targetPath);
    await fs.unlink(tempPath);
    tempPath = null; // Cleared so we don't try to delete it in catch block

    // Return the reference format
    const reference = `@${uploadsDirName}/${newFilename}`;

    res.json({
      success: true,
      reference,
      filename: newFilename,
      originalName: req.file.originalname
    });

  } catch (error) {
    console.error('File upload error:', error);

    // Clean up temp file if it still exists
    if (tempPath) {
      try {
        await fs.unlink(tempPath);
      } catch (cleanupError) {
        // Ignore cleanup error
      }
    }

    res.status(500).json({
      error: 'Failed to upload file',
      details: error.message
    });
  }
});

/**
 * Initialize uploads directory for a project
 * POST /api/projects/:projectName/files/init
 */
router.post('/:projectName/files/init', async (req, res) => {
  try {
    const { projectName } = req.params;

    // This function handles checking if it exists, conflict resolution, and config updating
    const uploadsDirName = await initializeProjectUploadsDirectory(projectName);

    res.json({
      success: true,
      uploadsDirectory: uploadsDirName
    });

  } catch (error) {
    console.error('Failed to initialize uploads directory:', error);
    res.status(500).json({
      error: 'Failed to initialize uploads directory',
      details: error.message
    });
  }
});

/**
 * Helper function to get GitHub token from database
 */
async function getGithubTokenById(tokenId, userId) {
  const { getDatabase } = await import('../database/db.js');
  const db = await getDatabase();

  const credential = await db.get(
    'SELECT * FROM user_credentials WHERE id = ? AND user_id = ? AND credential_type = ? AND is_active = 1',
    [tokenId, userId, 'github_token']
  );

  // Return in the expected format (github_token field for compatibility)
  if (credential) {
    return {
      ...credential,
      github_token: credential.credential_value
    };
  }

  return null;
}

/**
 * Helper function to clone a GitHub repository
 */
function cloneGitHubRepository(githubUrl, destinationPath, githubToken = null) {
  return new Promise((resolve, reject) => {
    // Parse GitHub URL and inject token if provided
    let cloneUrl = githubUrl;

    if (githubToken) {
      try {
        const url = new URL(githubUrl);
        // Format: https://TOKEN@github.com/user/repo.git
        url.username = githubToken;
        url.password = '';
        cloneUrl = url.toString();
      } catch (error) {
        return reject(new Error('Invalid GitHub URL format'));
      }
    }

    const gitProcess = spawn('git', ['clone', cloneUrl, destinationPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0' // Disable git password prompts
      }
    });

    let stdout = '';
    let stderr = '';

    gitProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    gitProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    gitProcess.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        // Parse git error messages to provide helpful feedback
        let errorMessage = 'Git clone failed';

        if (stderr.includes('Authentication failed') || stderr.includes('could not read Username')) {
          errorMessage = 'Authentication failed. Please check your GitHub token.';
        } else if (stderr.includes('Repository not found')) {
          errorMessage = 'Repository not found. Please check the URL and ensure you have access.';
        } else if (stderr.includes('already exists')) {
          errorMessage = 'Directory already exists';
        } else if (stderr) {
          errorMessage = stderr;
        }

        reject(new Error(errorMessage));
      }
    });

    gitProcess.on('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(new Error('Git is not installed or not in PATH'));
      } else {
        reject(error);
      }
    });
  });
}

export default router;

import path from 'path';
import { promises as fs } from 'fs';
import mime from 'mime-types';

const MAX_ASSET_BYTES = 20 * 1024 * 1024; // 20MB

export class SafeWriteError extends Error {
  constructor(status, error, message, details = undefined) {
    super(message);
    this.name = 'SafeWriteError';
    this.status = status;
    this.error = error;
    this.details = details;
  }
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function isAbsoluteOrWindowsDriveLike(filePath) {
  if (path.isAbsolute(filePath)) return true;
  if (/^[a-zA-Z]:/.test(filePath)) return true; // C:\ or C:foo
  if (filePath.startsWith('\\\\')) return true; // UNC
  return false;
}

export function resolvePathInRoot(rootDir, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath.trim()) {
    throw new SafeWriteError(400, 'INVALID_PATH', 'relativePath must be a non-empty string');
  }
  if (relativePath.includes('\0')) {
    throw new SafeWriteError(400, 'INVALID_PATH', 'relativePath contains invalid characters');
  }
  if (isAbsoluteOrWindowsDriveLike(relativePath)) {
    throw new SafeWriteError(400, 'INVALID_PATH', 'relativePath must be a project-root-relative path');
  }

  const resolvedRoot = path.resolve(rootDir);
  const normalizedRoot = resolvedRoot + path.sep;
  const resolvedTarget = path.resolve(resolvedRoot, relativePath);

  if (!resolvedTarget.startsWith(normalizedRoot)) {
    throw new SafeWriteError(403, 'PATH_TRAVERSAL', 'Path must be under project root', { relativePath });
  }

  const finalRelative = path.relative(resolvedRoot, resolvedTarget);
  return {
    absolutePath: resolvedTarget,
    relativePath: toPosixPath(finalRelative),
  };
}

function normalizeConflictStrategy(conflictStrategy, defaultStrategy) {
  if (!conflictStrategy) return defaultStrategy;
  const value = String(conflictStrategy).toLowerCase();
  if (!['overwrite', 'error', 'rename'].includes(value)) {
    throw new SafeWriteError(
      400,
      'INVALID_CONFLICT_STRATEGY',
      'conflictStrategy must be one of: overwrite, error, rename',
      { conflictStrategy }
    );
  }
  return value;
}

function withNumericSuffix(filePath, attempt) {
  const parsed = path.parse(filePath);
  return path.join(parsed.dir, `${parsed.name}-${attempt}${parsed.ext}`);
}

async function writeFileWithStrategy(rootDir, targetPath, data, { encoding, conflictStrategy }) {
  const strategy = normalizeConflictStrategy(conflictStrategy, 'overwrite');
  await fs.mkdir(path.dirname(targetPath), { recursive: true });

  const rootResolved = path.resolve(rootDir);
  const relForDetails = (absPath) => toPosixPath(path.relative(rootResolved, absPath));

  const mkOptions = (flag) => {
    const options = { flag };
    if (typeof encoding === 'string') options.encoding = encoding;
    return options;
  };

  if (strategy === 'overwrite') {
    await fs.writeFile(targetPath, data, typeof encoding === 'string' ? { encoding } : undefined);
    return targetPath;
  }

  if (strategy === 'error') {
    try {
      await fs.writeFile(targetPath, data, mkOptions('wx'));
      return targetPath;
    } catch (error) {
      if (error?.code === 'EEXIST') {
        throw new SafeWriteError(409, 'FILE_EXISTS', 'File already exists', { relativePath: relForDetails(targetPath) });
      }
      throw error;
    }
  }

  // rename
  for (let attempt = 0; attempt < 1000; attempt++) {
    const candidate = attempt === 0 ? targetPath : withNumericSuffix(targetPath, attempt);
    try {
      await fs.writeFile(candidate, data, mkOptions('wx'));
      return candidate;
    } catch (error) {
      if (error?.code === 'EEXIST') continue;
      throw error;
    }
  }

  throw new SafeWriteError(409, 'FILE_EXISTS', 'Unable to pick a unique filename after 1000 attempts');
}

export async function writeMarkdownFile(rootDir, { relativePath, content, conflictStrategy = 'overwrite' }) {
  if (typeof content !== 'string') {
    throw new SafeWriteError(400, 'INVALID_CONTENT', 'content must be a string');
  }
  if (!String(relativePath || '').toLowerCase().endsWith('.md')) {
    throw new SafeWriteError(400, 'INVALID_EXTENSION', 'Only .md files are supported for markdown writes', { relativePath });
  }

  const resolved = resolvePathInRoot(rootDir, relativePath);
  const writtenAbsolutePath = await writeFileWithStrategy(rootDir, resolved.absolutePath, content, {
    encoding: 'utf8',
    conflictStrategy,
  });

  return { relativePath: toPosixPath(path.relative(path.resolve(rootDir), writtenAbsolutePath)) };
}

function sanitizeFileName(fileName) {
  const base = path.basename(String(fileName || '').trim());
  if (!base) return '';
  return base.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function parseDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(String(dataUrl || '').trim());
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

export async function writeAssetFile(rootDir, {
  fileName,
  subdir = '',
  dataUrl,
  base64,
  mimeType,
  conflictStrategy = 'rename',
}) {
  const parsedDataUrl = dataUrl ? parseDataUrl(dataUrl) : null;
  const finalMimeType = mimeType || parsedDataUrl?.mimeType || undefined;
  const finalBase64 = base64 || parsedDataUrl?.base64 || '';

  if (!finalBase64) {
    throw new SafeWriteError(400, 'INVALID_CONTENT', 'base64 (or dataUrl) is required');
  }

  let safeName = sanitizeFileName(fileName);
  if (!safeName) {
    const ext = finalMimeType ? mime.extension(finalMimeType) : null;
    safeName = `asset-${Date.now()}${ext ? `.${ext}` : ''}`;
  }

  if (!path.extname(safeName) && finalMimeType) {
    const ext = mime.extension(finalMimeType);
    if (ext) safeName = `${safeName}.${ext}`;
  }

  if (typeof subdir !== 'string') {
    throw new SafeWriteError(400, 'INVALID_PATH', 'subdir must be a string');
  }

  const cleanedSubdir = subdir.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  if (cleanedSubdir.includes('\0')) {
    throw new SafeWriteError(400, 'INVALID_PATH', 'subdir contains invalid characters');
  }

  const relativeAssetPath = cleanedSubdir
    ? path.join('assets', cleanedSubdir, safeName)
    : path.join('assets', safeName);

  const resolved = resolvePathInRoot(rootDir, relativeAssetPath);
  if (!resolved.relativePath.toLowerCase().startsWith('assets/')) {
    throw new SafeWriteError(403, 'PATH_TRAVERSAL', 'Asset path must be under assets/', { relativePath: resolved.relativePath });
  }

  const buffer = Buffer.from(finalBase64, 'base64');
  if (buffer.length === 0) {
    throw new SafeWriteError(400, 'INVALID_CONTENT', 'Asset content is empty');
  }
  if (buffer.length > MAX_ASSET_BYTES) {
    throw new SafeWriteError(413, 'PAYLOAD_TOO_LARGE', `Asset exceeds maximum size of ${MAX_ASSET_BYTES} bytes`, {
      maxBytes: MAX_ASSET_BYTES,
      bytes: buffer.length,
    });
  }

  const writtenAbsolutePath = await writeFileWithStrategy(rootDir, resolved.absolutePath, buffer, {
    encoding: undefined,
    conflictStrategy,
  });

  return {
    relativePath: toPosixPath(path.relative(path.resolve(rootDir), writtenAbsolutePath)),
    mimeType: finalMimeType,
    bytes: buffer.length,
  };
}

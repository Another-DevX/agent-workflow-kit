import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

/** @param {string|Buffer} value */
export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** @param {string} value */
export function sha256Text(value) {
  return sha256(Buffer.from(value, 'utf8'));
}

/**
 * Normalize a template-relative destination path.
 *
 * Rejects absolute paths and any path that escapes the target root via `..`.
 * Returns forward-slash normalized relative path.
 *
 * @param {string} relPath
 * @returns {string}
 */
export function normalizeRelative(relPath) {
  return path.posix.normalize(relPath.replaceAll('\\', '/'));
}

/**
 * @param {string} root Absolute root directory.
 * @param {string} candidate Absolute candidate path.
 */
export function isWithin(root, candidate) {
  const rel = path.relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * @param {string} target
 */
export function lstatOrNull(target) {
  try {
    return fs.lstatSync(target);
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

/** @param {string} target */
export function exists(target) {
  return lstatOrNull(target) !== null;
}

/** @param {string} target */
export function isDirectory(target) {
  const stat = lstatOrNull(target);
  return Boolean(stat && stat.isDirectory());
}

/** @param {string} target @returns {string|null} */
export function readTextIfExists(target) {
  const stat = lstatOrNull(target);
  if (!stat || !stat.isFile()) return null;
  return fs.readFileSync(target, 'utf8');
}

/**
 * Walk up from `candidate` until an existing ancestor is found and confirm it
 * resolves inside the real target root. This blocks writes that would traverse
 * a symlinked directory out of the project.
 *
 * @param {string} realRoot
 * @param {string} candidate Absolute path (may not exist yet).
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function checkSymlinkEscape(realRoot, candidate) {
  const direct = lstatOrNull(candidate);
  if (direct && direct.isSymbolicLink()) {
    return { ok: false, reason: 'destination is a symbolic link' };
  }
  let current = path.dirname(candidate);
  while (true) {
    const stat = lstatOrNull(current);
    if (stat) {
      let real;
      try {
        real = fs.realpathSync(current);
      } catch {
        return { ok: false, reason: 'could not resolve destination directory' };
      }
      if (!isWithin(realRoot, real)) {
        return {
          ok: false,
          reason: `destination directory resolves outside the target (${real})`,
        };
      }
      return { ok: true };
    }
    const parent = path.dirname(current);
    if (parent === current) return { ok: true };
    current = parent;
  }
}

/**
 * Resolve a relative destination against the target root with escape and
 * symlink protection.
 *
 * @param {string} root Absolute target root.
 * @param {string} relPath Template-relative path.
 * @returns {{ abs: string, realRoot: string } | { error: string }}
 */
export function resolveDestination(root, relPath) {
  if (path.isAbsolute(relPath) || /^[A-Za-z]:[\\/]/.test(relPath)) {
    return { error: 'destination path must be relative' };
  }
  const normalized = normalizeRelative(relPath);
  if (normalized === '..' || normalized.startsWith('../')) {
    return { error: 'destination path escapes the target directory' };
  }
  const abs = path.resolve(root, normalized);
  if (!isWithin(root, abs)) {
    return { error: 'destination path escapes the target directory' };
  }
  const realRoot = realpath(root);
  const escape = checkSymlinkEscape(realRoot, abs);
  if (!escape.ok) return { error: escape.reason };
  return { abs, realRoot };
}

/** @param {string} target */
export function realpath(target) {
  try {
    return fs.realpathSync(target);
  } catch {
    return path.resolve(target);
  }
}

let tempCounter = 0;

/**
 * Atomically replace a file: write to a sibling temp file, fsync, then rename.
 *
 * @param {string} absPath
 * @param {string} content
 * @param {number} [mode] File mode to apply on creation.
 */
export async function atomicWriteFile(absPath, content, mode) {
  const dir = path.dirname(absPath);
  await fsp.mkdir(dir, { recursive: true });
  const existing = lstatOrNull(absPath);
  // Preserve the mode of an existing file; use the supplied (template) mode only
  // when creating. This keeps chmod decisions stable across updates.
  const fileMode = existing ? existing.mode & 0o777 : mode ?? 0o644;
  const tmp = path.join(
    dir,
    `.${path.basename(absPath)}.${process.pid}.${tempCounter++}.tmp`,
  );
  let handle;
  try {
    handle = await fsp.open(tmp, 'wx', fileMode);
    await handle.writeFile(content);
    await handle.sync().catch(() => {});
    await handle.close();
    handle = undefined;
    await fsp.rename(tmp, absPath);
  } catch (err) {
    if (handle) await handle.close().catch(() => {});
    await fsp.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

/**
 * @param {string} dir
 * @returns {Promise<string[]>} Absolute file paths, recursively.
 */
export async function listFiles(dir) {
  const result = [];
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await listFiles(full)));
    } else if (entry.isFile()) {
      result.push(full);
    }
  }
  return result;
}

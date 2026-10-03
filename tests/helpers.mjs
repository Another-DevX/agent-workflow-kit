// Shared helpers for the black-box CLI validation suite.
//
// The suite treats `bin/workflow.mjs` as an opaque executable: it only observes
// process exit codes and the resulting filesystem, never the exact wording of
// stdout/stderr. That keeps the tests meaningful without freezing output that
// the CLI is free to change.
//
// By default the suite runs the CLI from this repository. During local test
// development you can point it somewhere else with AGENT_WORKFLOW_CLI.

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import {
  mkdtemp,
  rm,
  readFile,
  writeFile,
  appendFile,
  readdir,
  lstat,
  readlink,
  symlink,
  mkdir,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const execFileP = promisify(execFile);

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const CLI = process.env.AGENT_WORKFLOW_CLI
  ? resolve(process.env.AGENT_WORKFLOW_CLI)
  : join(ROOT, 'bin', 'workflow.mjs');

/** Throw a clear error when the CLI under test is not present. */
export function assertCliPresent() {
  if (!existsSync(CLI)) {
    throw new Error(
      `Agent Workflow CLI not found at ${CLI}\n` +
        'This is a black-box suite and requires the integrated CLI. ' +
        'Set AGENT_WORKFLOW_CLI to point at a local build while developing tests.',
    );
  }
}

/**
 * Run the CLI as a child process.
 *
 * Resolves (never rejects) with { code, signal, stdout, stderr, error }.
 * A hard timeout kills runaway processes (for example an unexpected
 * interactive prompt) so the suite cannot hang.
 */
export function runCli(args = [], options = {}) {
  assertCliPresent();
  const { cwd, env, timeout = 30000, input } = options;

  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd,
      env: {
        ...process.env,
        NO_COLOR: '1',
        FORCE_COLOR: '0',
        CI: '1',
        ...env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolvePromise(result);
    };

    timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({
        code: null,
        signal: 'SIGKILL',
        stdout,
        stderr,
        error: new Error(`CLI timed out after ${timeout}ms`),
      });
    }, timeout);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => finish({ code: null, signal: null, stdout, stderr, error }));
    child.on('close', (code, signal) => finish({ code, signal, stdout, stderr, error: null }));

    child.stdin.end(input ?? '');
  });
}

/** Create a throwaway git repository with an initial commit. */
export async function makeTempRepo(prefix = 'awk-test-') {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    await execFileP('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  } catch {
    await execFileP('git', ['init', '-q'], { cwd: dir });
  }
  await execFileP('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  await execFileP('git', ['config', 'user.name', 'Workflow Test'], { cwd: dir });
  await execFileP('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir });
  await execFileP('git', ['config', 'tag.gpgsign', 'false'], { cwd: dir });

  await writeFile(join(dir, 'README.md'), '# temp project\n');
  await execFileP('git', ['add', '-A'], { cwd: dir });
  await execFileP('git', ['commit', '-q', '-m', 'chore: initial commit'], { cwd: dir });
  return dir;
}

export async function cleanup(dir) {
  await rm(dir, { recursive: true, force: true });
}

/** Run `fn` with a fresh temp repository, cleaning up afterwards. */
export async function withRepo(fn, prefix) {
  const dir = await makeTempRepo(prefix);
  try {
    return await fn(dir);
  } finally {
    await cleanup(dir);
  }
}

/**
 * A valid minimal set of check commands. Every command is intentionally cheap
 * and always exits 0, so tests observe scaffolding rather than the checks.
 */
export const DEFAULT_CHECKS = [
  '--verify',
  'node --version',
  '--verify-full',
  'node --version',
  '--setup',
  'node --version',
];

export async function git(dir, args) {
  return execFileP('git', args, { cwd: dir });
}

/** List every path below `root`, relative and sorted, excluding ignored roots. */
export async function listTree(root, { ignore = ['.git'] } = {}) {
  const out = [];

  async function walk(rel) {
    const abs = rel === '.' ? root : join(root, rel);
    let entries;
    try {
      entries = await readdir(abs, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const childRel = rel === '.' ? entry.name : `${rel}/${entry.name}`;
      if (ignore.some((i) => childRel === i || childRel.startsWith(`${i}/`))) continue;
      out.push(childRel);
      if (entry.isDirectory()) await walk(childRel);
    }
  }

  await walk('.');
  return out;
}

/** Hash-based snapshot of a directory tree, tolerant of symlinks and dirs. */
export async function snapshot(root, { ignore = ['.git'] } = {}) {
  const paths = await listTree(root, { ignore });
  const result = {};
  for (const rel of paths) {
    const abs = join(root, rel);
    const st = await lstat(abs);
    if (st.isSymbolicLink()) {
      result[rel] = `symlink:${await readlink(abs)}`;
    } else if (st.isFile()) {
      result[rel] = `file:${createHash('sha256').update(await readFile(abs)).digest('hex')}`;
    } else if (st.isDirectory()) {
      result[rel] = 'dir';
    } else {
      result[rel] = 'other';
    }
  }
  return result;
}

export async function readText(path) {
  return readFile(path, 'utf8');
}

export async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

export async function writeText(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

export async function appendText(path, content) {
  await appendFile(path, content);
}

/** Parse a JSON file, failing the test with a helpful message when invalid. */
export async function readJson(path) {
  const text = await readText(path);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Expected valid JSON at ${path}: ${error.message}`);
  }
}

/** Recursively check whether any string value looks like a sha256 hex hash. */
export function containsSha256(value) {
  // Match a sha256 digest even when prefixed (for example "sha256:...").
  const hex = /(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])/i;
  if (typeof value === 'string') return hex.test(value);
  if (Array.isArray(value)) return value.some(containsSha256);
  if (value && typeof value === 'object') {
    return Object.values(value).some(containsSha256);
  }
  return false;
}

/**
 * Find files below `root` whose basename (without extension) or path contains
 * one of the given names. Tolerant of unknown template file naming.
 */
export async function findNamedFiles(root, names) {
  const paths = await listTree(root);
  const matches = {};
  for (const name of names) matches[name] = [];
  for (const rel of paths) {
    const base = rel.split('/').pop().replace(/\.[^.]+$/, '');
    for (const name of names) {
      if (base === name || base.includes(name) || rel.includes(name)) {
        matches[name].push(rel);
      }
    }
  }
  return matches;
}

/** Pick a deterministic managed file to edit in drift tests. */
export async function pickManagedFile(root) {
  const paths = await listTree(root);
  // Prefer a managed template document, which is tracked for drift.
  const docs = paths.find(
    (p) => p.startsWith('docs/agent-workflow/') && !p.endsWith('/'),
  );
  if (docs) return docs;
  for (const rel of ['scripts/verify-full.sh', 'scripts/verify.sh']) {
    if (await pathExists(join(root, rel))) return rel;
  }
  const anyManaged = paths.find((p) => p.startsWith('.opencode/'));
  if (anyManaged) return anyManaged;
  throw new Error('Could not find a managed file to edit after init');
}

// Re-export a few fs primitives so test files only import from one module.
export { writeFile, readFile, mkdir, symlink, lstat };

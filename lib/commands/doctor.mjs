import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { exists, isDirectory, lstatOrNull, readTextIfExists, sha256Text } from '../fsutil.mjs';
import { readManifest } from '../manifest.mjs';
import { extractManagedBlock } from '../markers.mjs';
import { readProjectConfig, PROJECT_CONFIG_REL, MANIFEST_REL } from '../project-config.mjs';
import { PACKAGE_VERSION } from '../package-info.mjs';
import { VERIFY_SCRIPT_REL } from '../plan.mjs';

const NOOP_COMMANDS = new Set(['', 'true', ':', '/bin/true', 'exit 0', 'echo']);

/** @param {string} cwd @param {string[]} args */
function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return {
    status: result.status,
    signal: result.signal,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
    error: result.error,
  };
}

/**
 * @typedef {object} Check
 * @property {string} name
 * @property {boolean} ok
 * @property {string} [detail]
 * @property {string} [hint]
 */

/**
 * @param {{
 *   target: string,
 *   options: Record<string, any>,
 *   logger: ReturnType<import('../log.mjs').createLogger>,
 *   dryRun: boolean,
 * }} context
 * @returns {Promise<number>} Exit code: 0 when ready, 1 otherwise.
 */
export async function runDoctor(context) {
  const { target, logger } = context;
  /** @type {Check[]} */
  const checks = [];

  if (!exists(target) || !isDirectory(target)) {
    logger.error(`target is not a directory: ${target}`);
    return 1;
  }

  const gitCheck = checkGitRepository(target);
  checks.push(gitCheck);

  const manifestResult = readManifest(target);
  checks.push({
    name: 'manifest',
    ok: manifestResult.ok,
    detail: manifestResult.ok ? `${MANIFEST_REL} (version ${manifestResult.manifest.version ?? 'unknown'})` : manifestResult.error,
    hint: manifestResult.ok ? undefined : 'Run: agent-workflow init',
  });

  if (manifestResult.ok) {
    checks.push(checkInstalledFiles(target, manifestResult.manifest));
    if (manifestResult.manifest.version !== PACKAGE_VERSION) {
      checks.push({
        name: 'manifest-version',
        ok: false,
        detail: `manifest ${manifestResult.manifest.version} != CLI ${PACKAGE_VERSION}`,
        hint: 'Run: agent-workflow update',
      });
    }
  }

  checks.push(checkVerificationConfigured(target));

  if (gitCheck.ok) {
    checks.push(checkKnownGood(target));
  }

  report(logger, checks, target);
  return checks.every((check) => check.ok) ? 0 : 1;
}

/** @param {string} target */
export function checkGitRepository(target) {
  const result = git(target, ['rev-parse', '--is-inside-work-tree']);
  if (result.error) {
    return { name: 'git repository', ok: false, detail: 'git is not available', hint: 'Install git.' };
  }
  if (result.status === 0 && result.stdout === 'true') {
    return { name: 'git repository', ok: true, detail: 'inside a git work tree' };
  }
  return {
    name: 'git repository',
    ok: false,
    detail: 'target is not a git repository',
    hint: 'Run: git init',
  };
}

/**
 * @param {string} target
 * @param {Record<string, any>} manifest
 */
export function checkInstalledFiles(target, manifest) {
  const blockFiles = new Set(Array.isArray(manifest.blocks) ? manifest.blocks : []);
  const failures = [];
  for (const [rel, expected] of Object.entries(manifest.files ?? {})) {
    const abs = path.join(target, rel);
    const stat = lstatOrNull(abs);
    if (!stat) {
      failures.push(`missing: ${rel}`);
      continue;
    }
    if (stat.isSymbolicLink()) {
      failures.push(`symbolic link: ${rel}`);
      continue;
    }
    if (!stat.isFile()) {
      failures.push(`not a file: ${rel}`);
      continue;
    }
    const text = readTextIfExists(abs);
    if (text === null) {
      failures.push(`unreadable: ${rel}`);
      continue;
    }
    if (blockFiles.has(rel)) {
      const extracted = extractManagedBlock(text, rel);
      if (!extracted.found || extracted.malformed || extracted.block === null) {
        failures.push(`managed block missing: ${rel}`);
        continue;
      }
      if (sha256Text(extracted.block) !== expected) {
        failures.push(`managed block modified: ${rel}`);
      }
      continue;
    }
    if (sha256Text(text) !== expected) {
      failures.push(`modified: ${rel}`);
    }
  }
  return {
    name: 'installed files',
    ok: failures.length === 0,
    detail:
      failures.length === 0
        ? `${Object.keys(manifest.files ?? {}).length} file(s) match the manifest`
        : failures.join(', '),
    hint: failures.length === 0 ? undefined : 'Run: agent-workflow update (after reviewing local edits)',
  };
}

/** @param {string} target */
export function checkVerificationConfigured(target) {
  let config;
  try {
    config = readProjectConfig(target);
  } catch (err) {
    return {
      name: 'verification configured',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
      hint: `Fix or remove ${PROJECT_CONFIG_REL}.`,
    };
  }
  if (!config) {
    return {
      name: 'verification configured',
      ok: false,
      detail: `${PROJECT_CONFIG_REL} is missing`,
      hint: 'Run: agent-workflow init --verify "<command>"',
    };
  }
  const verifyCommand = typeof config.verifyCommand === 'string' ? config.verifyCommand.trim() : '';
  if (NOOP_COMMANDS.has(verifyCommand)) {
    return {
      name: 'verification configured',
      ok: false,
      detail: 'verifyCommand is missing or a no-op',
      hint: `Set a real verification command in ${PROJECT_CONFIG_REL}.`,
    };
  }

  // If verification delegates to scripts/verify.sh, that script must exist and
  // must not be the generic wrapper that reads this same config (self-recursion).
  if (verifyCommand.includes(VERIFY_SCRIPT_REL)) {
    const scriptPath = path.join(target, VERIFY_SCRIPT_REL);
    const stat = lstatOrNull(scriptPath);
    if (!stat || !stat.isFile()) {
      return {
        name: 'verification configured',
        ok: false,
        detail: `verifyCommand references ${VERIFY_SCRIPT_REL}, but it does not exist`,
        hint: 'Add the script or change verifyCommand.',
      };
    }
    const script = readTextIfExists(scriptPath) ?? '';
    if (script.includes('.agent-workflow/project.json')) {
      return {
        name: 'verification configured',
        ok: false,
        detail: `${VERIFY_SCRIPT_REL} reads verifyCommand from project config while being the verify command`,
        hint: 'Point verifyCommand at the real verification command to avoid self-recursion.',
      };
    }
  }

  return {
    name: 'verification configured',
    ok: true,
    detail: `verifyCommand = ${verifyCommand}`,
  };
}

/** @param {string} target */
export function checkKnownGood(target) {
  const result = git(target, ['rev-parse', '--verify', 'refs/tags/known-good']);
  if (result.status === 0) {
    return { name: 'known-good', ok: true, detail: 'tag known-good is present' };
  }
  return {
    name: 'known-good',
    ok: false,
    detail: 'tag known-good is missing',
    hint: 'Bootstrap needed: complete independent review and verification of the exact commit, then create the tag.',
  };
}

/**
 * @param {ReturnType<import('../log.mjs').createLogger>} logger
 * @param {Check[]} checks
 * @param {string} target
 */
function report(logger, checks, target) {
  logger.out(`doctor: ${target}`);
  for (const check of checks) {
    const status = check.ok ? 'ok  ' : 'fail';
    const detail = check.detail ? ` - ${check.detail}` : '';
    logger.out(`  [${status}] ${check.name}${detail}`);
    if (!check.ok && check.hint) logger.out(`         ${check.hint}`);
  }
  const failed = checks.filter((check) => !check.ok).length;
  if (failed === 0) {
    logger.out('ready');
  } else {
    logger.out(`not ready: ${failed} check(s) failed`);
  }
}

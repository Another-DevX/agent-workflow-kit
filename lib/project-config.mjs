import path from 'node:path';
import { readTextIfExists, sha256Text, exists, isDirectory } from './fsutil.mjs';

/** Relative path of the user-owned project configuration. */
export const PROJECT_CONFIG_REL = '.agent-workflow/project.json';
export const MANIFEST_REL = '.agent-workflow/manifest.json';

/** Keys the kit understands in `.agent-workflow/project.json`. */
export const PROJECT_CONFIG_KEYS = Object.freeze([
  'verifyCommand',
  'verifyFullCommand',
  'setupCommand',
  'scopeDocument',
]);

/**
 * Read the project config. Returns null when absent.
 *
 * @param {string} root
 * @returns {Record<string, unknown>|null}
 */
export function readProjectConfig(root) {
  const abs = path.join(root, PROJECT_CONFIG_REL);
  const text = readTextIfExists(abs);
  if (text === null) return null;
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('project config must be a JSON object');
    }
    return parsed;
  } catch (err) {
    const error = new Error(
      `could not parse ${PROJECT_CONFIG_REL}: ${err instanceof Error ? err.message : String(err)}`,
    );
    error.cause = err;
    throw error;
  }
}

/**
 * Fill in missing config keys without ever overwriting a value the user set.
 * The file stays user-owned; the kit only guarantees the keys its scripts read.
 *
 * @param {Record<string, unknown>|null} existing
 * @param {{ verifyCommand?: string|null, verifyFullCommand?: string|null, setupCommand?: string|null, scopeDocument?: string|null }} values
 * @returns {{ config: Record<string, unknown>, changed: boolean }}
 */
export function mergeProjectConfig(existing, values) {
  const config = existing ? { ...existing } : {};
  let changed = false;
  for (const key of PROJECT_CONFIG_KEYS) {
    const current = config[key];
    if (typeof current === 'string' && current.trim() !== '') continue;
    const value = values[key];
    if (typeof value === 'string' && value.trim() !== '') {
      config[key] = value;
      changed = true;
    }
  }
  return { config, changed };
}

/** @param {Record<string, unknown>} config */
export function serializeProjectConfig(config) {
  const ordered = {};
  for (const key of PROJECT_CONFIG_KEYS) {
    if (config[key] !== undefined) ordered[key] = config[key];
  }
  for (const [key, value] of Object.entries(config)) {
    if (!(key in ordered)) ordered[key] = value;
  }
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/** @param {string} root */
export function projectConfigExists(root) {
  const abs = path.join(root, PROJECT_CONFIG_REL);
  const statDir = path.dirname(abs);
  if (exists(abs)) return !isDirectory(abs);
  return false;
}

/** @param {string} root */
export function projectConfigHash(root) {
  const text = readTextIfExists(path.join(root, PROJECT_CONFIG_REL));
  return text === null ? null : sha256Text(text);
}

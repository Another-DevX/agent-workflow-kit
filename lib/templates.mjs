import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listFiles } from './fsutil.mjs';
import { renderTokens } from './tokens.mjs';

/** Package root: the directory containing package.json, bin/, and lib/. */
export const PACKAGE_ROOT = path.dirname(fileURLToPath(new URL('..', import.meta.url)));

/**
 * Template sections. `core` maps to the target root; `opencode` maps to
 * `<target>/.opencode`. Both contain destination-relative paths.
 */
export const TEMPLATE_SECTIONS = Object.freeze([
  { name: 'core', destPrefix: '' },
  { name: 'opencode', destPrefix: '.opencode' },
]);

const IGNORED_BASENAMES = new Set(['.DS_Store', 'Thumbs.db']);

/**
 * Resolve the template root. `AGENT_WORKFLOW_TEMPLATES` overrides the packaged
 * location; it is primarily a test seam and is honored everywhere.
 *
 * @param {{ env?: Record<string, string|undefined> }} [options]
 */
export function resolveTemplatesRoot(options = {}) {
  const env = options.env ?? process.env;
  if (env.AGENT_WORKFLOW_TEMPLATES) return path.resolve(env.AGENT_WORKFLOW_TEMPLATES);
  return path.join(PACKAGE_ROOT, 'templates');
}

/**
 * Discover template files.
 *
 * @param {string} templatesRoot
 * @returns {{ ok: true, files: { section: string, sourcePath: string, destRel: string }[] } | { ok: false, error: string }}
 */
export function discoverTemplates(templatesRoot) {
  if (!fs.existsSync(templatesRoot) || !fs.statSync(templatesRoot).isDirectory()) {
    return { ok: false, error: `template directory not found: ${templatesRoot}` };
  }
  const files = [];
  for (const section of TEMPLATE_SECTIONS) {
    const sectionRoot = path.join(templatesRoot, section.name);
    if (!fs.existsSync(sectionRoot) || !fs.statSync(sectionRoot).isDirectory()) continue;
    const sectionFiles = listFilesSync(sectionRoot);
    for (const sourcePath of sectionFiles) {
      const relative = path.relative(sectionRoot, sourcePath).split(path.sep).join('/');
      if (relative.split('/').some((part) => IGNORED_BASENAMES.has(part))) continue;
      const destRel = section.destPrefix
        ? path.posix.join(section.destPrefix, stripTemplateSuffix(relative))
        : stripTemplateSuffix(relative);
      files.push({ section: section.name, sourcePath, destRel });
    }
  }
  return { ok: true, files };
}

/** @param {string} value */
function stripTemplateSuffix(value) {
  return value.endsWith('.tmpl') ? value.slice(0, -'.tmpl'.length) : value;
}

/**
 * List files synchronously (discovery is cheap and keeps the plan sync-friendly).
 * @param {string} dir
 * @returns {string[]}
 */
function listFilesSync(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...listFilesSync(full));
    } else if (entry.isFile()) {
      result.push(full);
    }
  }
  return result;
}

/** @param {string} sourcePath */
export function readTemplate(sourcePath) {
  return fs.readFileSync(sourcePath, 'utf8');
}

/**
 * @param {string} sourcePath
 * @param {{ verifyCommand: string|null, verifyFullCommand: string|null, setupCommand: string|null, scopeDocument: string|null }} values
 */
export function renderTemplate(sourcePath, values) {
  return renderTokens(readTemplate(sourcePath), values);
}

// Kept exported for callers that need async listing.
export { listFiles };

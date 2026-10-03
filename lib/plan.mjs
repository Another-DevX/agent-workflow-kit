import fs from 'node:fs';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { CliError } from './errors.mjs';
import {
  atomicWriteFile,
  isWithin,
  lstatOrNull,
  normalizeRelative,
  readTextIfExists,
  resolveDestination,
  sha256Text,
} from './fsutil.mjs';
import {
  buildManagedBlock,
  isManagedBlockFile,
  mergeManagedBlock,
} from './markers.mjs';
import {
  buildOpenCodeDocument,
  ensureOpenCodeDocument,
  findExistingOpenCodeConfig,
  isOpenCodeConfigPath,
  mergeOpenCodeText,
} from './opencode-config.mjs';
import {
  PROJECT_CONFIG_REL,
  readProjectConfig,
  mergeProjectConfig,
  serializeProjectConfig,
} from './project-config.mjs';
import { MANIFEST_REL, manifestHash, serializeManifest } from './manifest.mjs';
import { PACKAGE_VERSION } from './package-info.mjs';
import { renderTemplate } from './templates.mjs';

const VERIFY_SCRIPT_REL = 'scripts/verify.sh';

/**
 * @typedef {object} PlanWrite
 * @property {string} rel
 * @property {string} abs
 * @property {'create'|'update'} action
 * @property {'file'|'block'|'opencode'|'config'|'manifest'} kind
 * @property {string} content
 * @property {number} [mode]
 */

/**
 * Build a write plan for init/update and detect every conflict up front.
 * Conflicts never produce writes.
 *
 * @param {{
 *   root: string,
 *   mode: 'init'|'update',
 *   manifest: Record<string, any>|null,
 *   templateFiles: { section: string, sourcePath: string, destRel: string }[],
 *   values: { verifyCommand: string|null, verifyFullCommand: string|null, setupCommand: string|null, scopeDocument: string|null },
 * }} input
 * @returns {{ writes: PlanWrite[], conflicts: import('./errors.mjs').Conflict[], notes: string[] }}
 */
export function buildPlan(input) {
  const { root, mode, manifest, templateFiles, values } = input;
  /** @type {PlanWrite[]} */
  const writes = [];
  /** @type {import('./errors.mjs').Conflict[]} */
  const conflicts = [];
  /** @type {string[]} */
  const notes = [];
  /** @type {Record<string, string>} */
  const filesMap = {};
  /** @type {string[]} */
  const blocks = [];
  /** @type {Set<string>} */
  const excluded = new Set();

  planOpenCode({ root, templateFiles, values, writes, conflicts, notes, excluded });

  // Project config is user-owned; we fill missing keys only.
  planProjectConfig({ root, values, writes, conflicts });

  for (const file of templateFiles) {
    if (excluded.has(file.destRel)) continue;
    if (isOpenCodeConfigPath(file.destRel)) continue; // handled by planOpenCode
    planTemplateFile({
      root,
      mode,
      manifest,
      file,
      values,
      writes,
      conflicts,
      notes,
      filesMap,
      blocks,
    });
  }

  // Note files that used to be managed but are no longer provided.
  if (manifest && manifest.files) {
    const provided = new Set(templateFiles.map((file) => normalizeRelative(file.destRel)));
    for (const rel of Object.keys(manifest.files)) {
      if (!provided.has(rel) && rel !== MANIFEST_REL) {
        notes.push(`no longer managed (left in place): ${rel}`);
      }
    }
  }

  planManifest({ root, filesMap, blocks, manifest, writes });

  // Manifest is written last so a partial failure never records a false state.
  writes.sort((a, b) => rank(a.kind) - rank(b.kind));

  return { writes, conflicts, notes };
}

/** @param {PlanWrite['kind']} kind */
function rank(kind) {
  return kind === 'manifest' ? 10 : 0;
}

/**
 * Template file mode for newly created destinations. Shell scripts are always
 * made executable so `./scripts/verify.sh` works as documented.
 *
 * @param {string} sourcePath
 * @param {string} destRel
 */
function templateMode(sourcePath, destRel) {
  let mode = fs.statSync(sourcePath).mode & 0o777;
  if (destRel.endsWith('.sh')) mode |= 0o111;
  return mode;
}

/**
 * @param {{
 *   root: string,
 *   templateFiles: { sourcePath: string, destRel: string }[],
 *   values: any,
 *   writes: PlanWrite[],
 *   conflicts: import('./errors.mjs').Conflict[],
 *   notes: string[],
 *   excluded: Set<string>,
 * }} input
 */
function planOpenCode(input) {
  const { root, templateFiles, values, writes, conflicts, notes, excluded } = input;
  const templateConfigs = templateFiles.filter((file) => isOpenCodeConfigPath(file.destRel));
  const existing = findExistingOpenCodeConfig(root);

  if (existing) {
    const merged = mergeOpenCodeText(existing.text);
    if (merged.conflicts.length > 0) {
      for (const conflict of merged.conflicts) {
        conflicts.push({
          ...conflict,
          path: conflict.path === 'opencode' ? existing.relPath : `${existing.relPath}:${conflict.path}`,
        });
      }
    } else if (merged.action === 'update') {
      const resolved = resolveDestination(root, existing.relPath);
      if ('error' in resolved) {
        conflicts.push({ kind: 'escape', path: existing.relPath, reason: resolved.error });
      } else {
        writes.push({
          rel: existing.relPath,
          abs: resolved.abs,
          action: 'update',
          kind: 'opencode',
          content: merged.text,
        });
        notes.push(`merged required settings into existing OpenCode config ${existing.relPath}`);
      }
    }
    for (const file of templateConfigs) excluded.add(file.destRel);
    if (templateConfigs.length > 0) {
      notes.push(
        `preserved existing OpenCode config; skipped template ${templateConfigs
          .map((file) => file.destRel)
          .join(', ')}`,
      );
    }
    return;
  }

  const template = templateConfigs[0];
  const destRel = template ? template.destRel : '.opencode/opencode.json';
  let content;
  if (template) {
    const rendered = renderTemplate(template.sourcePath, values);
    const ensured = ensureOpenCodeDocument(rendered);
    if (ensured.conflicts.length > 0) {
      for (const conflict of ensured.conflicts) {
        conflicts.push({ ...conflict, path: `${destRel}:${conflict.path}` });
      }
      return;
    }
    content = ensured.text;
    for (const file of templateConfigs.slice(1)) excluded.add(file.destRel);
  } else {
    content = buildOpenCodeDocument();
  }

  const resolved = resolveDestination(root, destRel);
  if ('error' in resolved) {
    conflicts.push({ kind: 'escape', path: destRel, reason: resolved.error });
    return;
  }
  const stat = lstatOrNull(resolved.abs);
  if (stat && !stat.isFile()) {
    conflicts.push({
      kind: 'directory',
      path: destRel,
      reason: 'a non-file already exists at this path',
      remedy: 'remove or rename it, then re-run',
    });
    return;
  }
  writes.push({ rel: destRel, abs: resolved.abs, action: 'create', kind: 'opencode', content });
}

/**
 * @param {{
 *   root: string,
 *   values: any,
 *   writes: PlanWrite[],
 *   conflicts: import('./errors.mjs').Conflict[],
 * }} input
 */
function planProjectConfig(input) {
  const { root, values, writes, conflicts } = input;
  let existing = null;
  try {
    existing = readProjectConfig(root);
  } catch (err) {
    conflicts.push({
      kind: 'config',
      path: PROJECT_CONFIG_REL,
      reason: err instanceof Error ? err.message : String(err),
      remedy: 'fix or remove the file, then re-run',
    });
    return;
  }
  const merged = mergeProjectConfig(existing, values);
  const resolved = resolveDestination(root, PROJECT_CONFIG_REL);
  if ('error' in resolved) {
    conflicts.push({ kind: 'escape', path: PROJECT_CONFIG_REL, reason: resolved.error });
    return;
  }
  if (existing === null) {
    writes.push({
      rel: PROJECT_CONFIG_REL,
      abs: resolved.abs,
      action: 'create',
      kind: 'config',
      content: serializeProjectConfig(merged.config),
    });
    return;
  }
  if (merged.changed) {
    writes.push({
      rel: PROJECT_CONFIG_REL,
      abs: resolved.abs,
      action: 'update',
      kind: 'config',
      content: serializeProjectConfig(merged.config),
    });
  }
}

/**
 * @param {{
 *   root: string,
 *   mode: 'init'|'update',
 *   manifest: Record<string, any>|null,
 *   file: { sourcePath: string, destRel: string },
 *   values: any,
 *   writes: PlanWrite[],
 *   conflicts: import('./errors.mjs').Conflict[],
 *   notes: string[],
 *   filesMap: Record<string, string>,
 *   blocks: string[],
 * }} input
 */
function planTemplateFile(input) {
  const { root, mode, manifest, file, values, writes, conflicts, notes, filesMap, blocks } = input;
  const destRel = normalizeRelative(file.destRel);
  const resolved = resolveDestination(root, destRel);
  if ('error' in resolved) {
    conflicts.push({ kind: 'escape', path: destRel, reason: resolved.error });
    return;
  }
  const { abs } = resolved;
  const stat = lstatOrNull(abs);

  // Preserve a pre-existing user verification wrapper instead of installing the
  // generic one; pointing the config at it avoids self-recursion.
  if (destRel === VERIFY_SCRIPT_REL && !(manifest && manifestHash(manifest, destRel))) {
    if (stat && stat.isFile()) {
      notes.push(`preserved existing ${VERIFY_SCRIPT_REL}; skipped installing the generic wrapper`);
      return;
    }
  }

  if (isManagedBlockFile(destRel)) {
    const body = renderTemplate(file.sourcePath, values);
    planBlockFile({ manifest, destRel, abs, body, writes, conflicts, filesMap, blocks });
    return;
  }

  const content = renderTemplate(file.sourcePath, values);
  const fileMode = templateMode(file.sourcePath, destRel);
  const newHash = sha256Text(content);
  if (!stat) {
    writes.push({ rel: destRel, abs, action: 'create', kind: 'file', content, mode: fileMode });
    filesMap[destRel] = newHash;
    return;
  }
  if (!stat.isFile()) {
    conflicts.push({
      kind: stat.isDirectory() ? 'directory' : 'type',
      path: destRel,
      reason: stat.isDirectory() ? 'a directory exists at this path' : 'a non-file exists at this path',
      remedy: 'remove or rename it, then re-run',
    });
    return;
  }
  const existingContent = fs.readFileSync(abs, 'utf8');
  const currentHash = sha256Text(existingContent);
  if (currentHash === newHash) {
    filesMap[destRel] = newHash;
    return;
  }
  const known = manifest ? manifestHash(manifest, destRel) : null;
  if (known && known === currentHash) {
    writes.push({ rel: destRel, abs, action: 'update', kind: 'file', content, mode: fileMode });
    filesMap[destRel] = newHash;
    return;
  }
  conflicts.push({
    kind: 'file',
    path: destRel,
    reason:
      known === null
        ? 'file already exists and differs from the template'
        : 'file has local edits since it was installed',
    remedy:
      mode === 'update'
        ? 'review the file; move local changes aside or re-run init in a clean project'
        : 'move the existing file aside (or delete it), then re-run',
  });
}

/**
 * @param {{
 *   manifest: Record<string, any>|null,
 *   destRel: string,
 *   abs: string,
 *   body: string,
 *   writes: PlanWrite[],
 *   conflicts: import('./errors.mjs').Conflict[],
 *   filesMap: Record<string, string>,
 *   blocks: string[],
 * }} input
 */
function planBlockFile(input) {
  const { manifest, destRel, abs, body, writes, conflicts, filesMap, blocks } = input;
  const existing = readTextIfExists(abs);
  let merged;
  try {
    merged = mergeManagedBlock(existing, destRel, body);
  } catch (err) {
    conflicts.push({
      kind: 'file',
      path: destRel,
      reason: err instanceof Error ? err.message : String(err),
      remedy: 'repair or remove the marker block, then re-run',
    });
    return;
  }
  const newBlock = buildManagedBlock(destRel, body);
  const blockHash = sha256Text(newBlock);
  const known = manifest ? manifestHash(manifest, destRel) : null;

  if (merged.action === 'create') {
    writes.push({ rel: destRel, abs, action: 'create', kind: 'file', content: merged.text });
    filesMap[destRel] = blockHash;
    blocks.push(destRel);
    return;
  }
  if (merged.action === 'append') {
    if (known) {
      conflicts.push({
        kind: 'file',
        path: destRel,
        reason: 'the managed block was removed from this file',
        remedy: 'restore the block or remove the manifest entry, then re-run',
      });
      return;
    }
    writes.push({ rel: destRel, abs, action: 'update', kind: 'file', content: merged.text });
    filesMap[destRel] = blockHash;
    blocks.push(destRel);
    return;
  }
  // replace
  if (merged.currentBlock === newBlock) {
    filesMap[destRel] = blockHash;
    blocks.push(destRel);
    return;
  }
  if (known && sha256Text(merged.currentBlock) === known) {
    writes.push({ rel: destRel, abs, action: 'update', kind: 'file', content: merged.text });
    filesMap[destRel] = blockHash;
    blocks.push(destRel);
    return;
  }
  conflicts.push({
    kind: 'file',
    path: destRel,
    reason: 'the managed block has local edits',
    remedy: 'revert the block or move custom text outside the begin/end markers',
  });
}

/**
 * Canonical managed state of a manifest document, ignoring generatedAt.
 * @param {string} text
 * @returns {string|null}
 */
function manifestState(text) {
  try {
    const parsed = JSON.parse(text);
    return JSON.stringify({
      version: parsed.version,
      files: Object.fromEntries(
        Object.keys(parsed.files ?? {})
          .sort()
          .map((key) => [key, parsed.files[key]]),
      ),
      blocks: [...(parsed.blocks ?? [])].sort(),
    });
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   root: string,
 *   filesMap: Record<string, string>,
 *   blocks: string[],
 *   manifest: Record<string, any>|null,
 *   writes: PlanWrite[],
 * }} input
 */
function planManifest(input) {
  const { root, filesMap, blocks, manifest, writes } = input;
  const content = serializeManifest({ files: filesMap, blocks }, PACKAGE_VERSION);
  const resolved = resolveDestination(root, MANIFEST_REL);
  if ('error' in resolved) return;
  const existingText = readTextIfExists(resolved.abs);
  if (existingText !== null) {
    // Compare managed state only; the generatedAt timestamp is not meaningful
    // for idempotency and must not force a rewrite on every run.
    const existingState = manifestState(existingText);
    const nextState = manifestState(content);
    if (existingState !== null && existingState === nextState) return;
  }
  const action = existingText === null ? 'create' : 'update';
  writes.push({ rel: MANIFEST_REL, abs: resolved.abs, action, kind: 'manifest', content });
}

/**
 * Apply a plan. All conflicts must be resolved by the caller before calling.
 *
 * @param {PlanWrite[]} writes
 * @param {{ dryRun?: boolean, logger: { action(line: string): void } }} options
 */
export async function applyPlan(writes, options) {
  const { dryRun = false, logger } = options;
  if (writes.length === 0) {
    logger.action('nothing to do; already up to date');
    return { written: [] };
  }
  if (dryRun) {
    for (const write of writes) logger.action(`${write.action} ${write.rel}`);
    return { written: [] };
  }
  /** @type {{ abs: string, before: string|null }[]} */
  const backups = [];
  try {
    for (const write of writes) {
      const before = readTextIfExists(write.abs);
      backups.push({ abs: write.abs, before });
      await atomicWriteFile(write.abs, write.content, write.mode);
      logger.action(`${write.action} ${write.rel}`);
    }
    return { written: writes.map((write) => write.rel) };
  } catch (err) {
    for (const backup of [...backups].reverse()) {
      try {
        if (backup.before === null) await fsp.rm(backup.abs, { force: true });
        else await atomicWriteFile(backup.abs, backup.before);
      } catch {
        // best effort rollback
      }
    }
    throw new CliError(
      `write failed: ${err instanceof Error ? err.message : String(err)}; rolled back completed writes`,
      { cause: err },
    );
  }
}

export { VERIFY_SCRIPT_REL, isWithin, normalizeRelative };

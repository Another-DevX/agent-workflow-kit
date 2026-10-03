import path from 'node:path';
import { readTextIfExists } from './fsutil.mjs';
import { MANIFEST_REL } from './project-config.mjs';
import { PACKAGE_VERSION } from './package-info.mjs';

export { MANIFEST_REL };

/**
 * Manifest shape:
 * {
 *   "version": "0.1.0",
 *   "generatedAt": "2026-...Z",
 *   "files": { "<relative path>": "<sha256>" },
 *   "blocks": ["AGENTS.md", ".gitignore"]
 * }
 *
 * For files listed in `blocks`, the hash covers only the managed marker block,
 * not the surrounding user content.
 */

/**
 * @param {string} root
 * @returns {{ ok: true, manifest: Record<string, any>, text: string } | { ok: false, error: string }}
 */
export function readManifest(root) {
  const abs = path.join(root, MANIFEST_REL);
  const text = readTextIfExists(abs);
  if (text === null) return { ok: false, error: 'manifest not found' };
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'manifest is not a JSON object' };
    }
    if (typeof parsed.files !== 'object' || parsed.files === null) {
      return { ok: false, error: 'manifest is missing a files map' };
    }
    return { ok: true, manifest: parsed, text };
  } catch (err) {
    return { ok: false, error: `manifest is not valid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * @param {{ files: Record<string, string>, blocks?: string[] }} input
 * @param {string} [version]
 */
export function serializeManifest(input, version = PACKAGE_VERSION) {
  const files = {};
  for (const key of Object.keys(input.files).sort()) files[key] = input.files[key];
  const manifest = {
    version,
    generatedAt: new Date().toISOString(),
    files,
    blocks: [...(input.blocks ?? [])].sort(),
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/** @param {Record<string, any>} manifest @param {string} relPath */
export function manifestHash(manifest, relPath) {
  const value = manifest?.files?.[relPath];
  return typeof value === 'string' ? value : null;
}

/** @param {Record<string, any>} manifest @param {string} relPath */
export function manifestIsBlock(manifest, relPath) {
  return Array.isArray(manifest?.blocks) && manifest.blocks.includes(relPath);
}

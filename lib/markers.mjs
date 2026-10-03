import { normalizeRelative } from './fsutil.mjs';

/**
 * Managed marker blocks let the kit own a region of a shared file (AGENTS.md,
 * .gitignore) while preserving everything the user wrote around it.
 *
 * The manifest stores the hash of the managed block only, so edits outside the
 * block never look like conflicts.
 */
export const MARKER_DEFS = {
  'AGENTS.md': {
    open: '<!-- agent-workflow:begin -->',
    close: '<!-- agent-workflow:end -->',
  },
  '.gitignore': {
    open: '# agent-workflow:begin',
    close: '# agent-workflow:end',
  },
};

/** @param {string} relPath */
export function isManagedBlockFile(relPath) {
  return Object.hasOwn(MARKER_DEFS, normalizeRelative(relPath));
}

/** @param {string} relPath */
export function markerDef(relPath) {
  return MARKER_DEFS[normalizeRelative(relPath)] ?? null;
}

/**
 * Build the canonical managed block for a file. A single trailing newline is
 * normalized so extraction and construction always agree.
 *
 * @param {string} relPath
 * @param {string} body
 */
export function buildManagedBlock(relPath, body) {
  const def = markerDef(relPath);
  if (!def) throw new Error(`${relPath} is not a managed block file`);
  const normalized = body.endsWith('\n') || body.length === 0 ? body : `${body}\n`;
  return `${def.open}\n${normalized}${def.close}`;
}

/**
 * @param {string} text
 * @param {string} relPath
 * @returns {{ found: boolean, malformed: boolean, block: string|null, start: number, end: number }}
 */
export function extractManagedBlock(text, relPath) {
  const def = markerDef(relPath);
  if (!def) return { found: false, malformed: false, block: null, start: -1, end: -1 };
  const start = text.indexOf(def.open);
  if (start === -1) return { found: false, malformed: false, block: null, start: -1, end: -1 };
  const closeStart = text.indexOf(def.close, start + def.open.length);
  if (closeStart === -1) {
    return { found: true, malformed: true, block: null, start, end: -1 };
  }
  const end = closeStart + def.close.length;
  return { found: true, malformed: false, block: text.slice(start, end), start, end };
}

/**
 * Merge a managed block into existing text (or create the file content).
 *
 * @param {string|null} existing
 * @param {string} relPath
 * @param {string} body
 * @returns {{ text: string, currentBlock: string|null, action: 'create'|'replace'|'append' }}
 */
export function mergeManagedBlock(existing, relPath, body) {
  const block = buildManagedBlock(relPath, body);
  if (existing === null) {
    return { text: `${block}\n`, currentBlock: null, action: 'create' };
  }
  const extracted = extractManagedBlock(existing, relPath);
  if (extracted.malformed) {
    throw new Error(
      `${relPath} contains a start marker without a matching end marker; refusing to merge automatically`,
    );
  }
  if (extracted.found) {
    const text = `${existing.slice(0, extracted.start)}${block}${existing.slice(extracted.end)}`;
    return { text, currentBlock: extracted.block, action: 'replace' };
  }
  let prefix = existing;
  if (prefix.length > 0 && !prefix.endsWith('\n')) prefix += '\n';
  if (prefix.length > 0) prefix += '\n';
  return { text: `${prefix}${block}\n`, currentBlock: null, action: 'append' };
}

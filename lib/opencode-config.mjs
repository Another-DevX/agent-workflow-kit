import path from 'node:path';
import { lstatOrNull, readTextIfExists } from './fsutil.mjs';

/** Candidate project OpenCode config files, in OpenCode precedence order. */
export const OPENCODE_BASENAMES = Object.freeze(['opencode.json', 'opencode.jsonc']);

/** Required project settings installed by `init`. */
export const REQUIRED_OPENCODE = Object.freeze({
  default_agent: 'orchestrator',
  worktree: { directory: '.worktrees' },
});

const SCHEMA_URL = 'https://opencode.ai/config.json';

/** @param {string} relPath */
export function isOpenCodeConfigPath(relPath) {
  const normalized = relPath.replaceAll('\\', '/');
  const base = path.posix.basename(normalized);
  return OPENCODE_BASENAMES.includes(base);
}

/**
 * Return every OpenCode config location for the target, in precedence order
 * (`.opencode/*` overrides direct `opencode.json(c)`).
 *
 * @param {string} root
 */
export function listOpenCodeConfigPaths(root) {
  const result = [];
  for (const base of OPENCODE_BASENAMES) result.push(`.opencode/${base}`);
  for (const base of OPENCODE_BASENAMES) result.push(base);
  return result;
}

/**
 * @param {string} root
 * @returns {{ relPath: string, absPath: string, text: string }|null}
 */
export function findExistingOpenCodeConfig(root) {
  for (const relPath of listOpenCodeConfigPaths(root)) {
    const absPath = path.join(root, relPath);
    const stat = lstatOrNull(absPath);
    if (stat && stat.isSymbolicLink()) continue;
    if (stat && stat.isFile()) {
      const text = readTextIfExists(absPath);
      if (text !== null) return { relPath, absPath, text };
    }
  }
  return null;
}

/** @param {string} text @param {number} start */
function skipTrivia(text, start) {
  let i = start;
  while (i < text.length) {
    const ch = text[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      i += 2;
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    break;
  }
  return i;
}

/** Remove line/block comments, preserving newlines. @param {string} text */
export function stripComments(text) {
  let out = '';
  let i = 0;
  let inString = false;
  while (i < text.length) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === '\\') {
        out += text[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        if (text[i] === '\n') out += '\n';
        i += 1;
      }
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** Remove trailing commas. @param {string} text */
export function stripTrailingCommas(text) {
  let out = '';
  let i = 0;
  let inString = false;
  while (i < text.length) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === '\\') {
        out += text[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === ',') {
      let j = i + 1;
      while (j < text.length && (text[j] === ' ' || text[j] === '\t' || text[j] === '\n' || text[j] === '\r')) {
        j += 1;
      }
      if (text[j] === '}' || text[j] === ']') {
        i += 1;
        continue;
      }
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** @param {string} text */
export function parseJsonc(text) {
  const stripped = stripTrailingCommas(stripComments(text));
  return JSON.parse(stripped);
}

/** @param {string} text */
export function hasJsoncFeatures(text) {
  const uncommented = stripComments(text);
  if (uncommented !== text) return true;
  return stripTrailingCommas(uncommented) !== uncommented;
}

/**
 * Minimal offset-aware JSONC parser. Only used to find insertion points; the
 * value shape is produced by `parseJsonc`.
 */
class JsoncTree {
  constructor(text) {
    this.text = text;
    this.i = 0;
  }

  error(message) {
    throw new Error(`${message} at position ${this.i}`);
  }

  skip() {
    this.i = skipTrivia(this.text, this.i);
  }

  peek() {
    return this.text[skipTrivia(this.text, this.i)];
  }

  parse() {
    this.skip();
    const node = this.parseValue();
    this.skip();
    if (this.i !== this.text.length) this.error('unexpected trailing content');
    return node;
  }

  parseValue() {
    this.skip();
    const ch = this.text[this.i];
    if (ch === '{') return this.parseObject();
    if (ch === '[') return this.parseArray();
    if (ch === '"') return this.parseString();
    return this.parseLiteral();
  }

  parseObject() {
    const start = this.i;
    this.i += 1;
    const node = {
      type: 'object',
      start,
      end: -1,
      entries: [],
      empty: false,
      insertIndex: -1,
      needsLeadingComma: false,
      childIndent: '  ',
    };
    this.skip();
    if (this.text[this.i] === '}') {
      this.i += 1;
      node.end = this.i;
      node.empty = true;
      node.insertIndex = start + 1;
      return node;
    }
    let last = null;
    while (true) {
      this.skip();
      if (this.text[this.i] === '}') {
        this.i += 1;
        break;
      }
      const keyStart = this.i;
      const key = this.parseString();
      this.skip();
      if (this.text[this.i] !== ':') this.error('expected ":"');
      this.i += 1;
      this.skip();
      const valueStart = this.i;
      const value = this.parseValue();
      const entry = {
        key: key.value,
        keyStart,
        keyEnd: key.end,
        valueStart,
        valueEnd: value.end,
        value,
      };
      node.entries.push(entry);
      last = entry;
      this.skip();
      if (this.text[this.i] === ',') {
        this.i += 1;
        const after = skipTrivia(this.text, this.i);
        if (this.text[after] === '}') {
          // Trailing comma: insert after the comma.
          node.insertIndex = this.i;
          node.needsLeadingComma = false;
        }
        continue;
      }
      if (this.text[this.i] === '}') {
        this.i += 1;
        break;
      }
      this.error('expected "," or "}"');
    }
    node.end = this.i;
    if (node.insertIndex === -1) {
      node.insertIndex = last.valueEnd;
      node.needsLeadingComma = true;
    }
    node.childIndent = detectChildIndent(this.text, node);
    return node;
  }

  parseArray() {
    const start = this.i;
    this.i += 1;
    const node = { type: 'array', start, end: -1, items: [] };
    this.skip();
    if (this.text[this.i] === ']') {
      this.i += 1;
      node.end = this.i;
      return node;
    }
    while (true) {
      this.skip();
      if (this.text[this.i] === ']') {
        this.i += 1;
        break;
      }
      const item = this.parseValue();
      node.items.push(item);
      this.skip();
      if (this.text[this.i] === ',') {
        this.i += 1;
        continue;
      }
      if (this.text[this.i] === ']') {
        this.i += 1;
        break;
      }
      this.error('expected "," or "]"');
    }
    node.end = this.i;
    return node;
  }

  parseString() {
    const start = this.i;
    this.i += 1;
    let escaped = false;
    while (this.i < this.text.length) {
      const ch = this.text[this.i];
      if (escaped) {
        escaped = false;
        this.i += 1;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        this.i += 1;
        continue;
      }
      if (ch === '"') {
        this.i += 1;
        return { type: 'string', start, end: this.i, value: JSON.parse(this.text.slice(start, this.i)) };
      }
      this.i += 1;
    }
    this.error('unterminated string');
  }

  parseLiteral() {
    const start = this.i;
    while (this.i < this.text.length && !/[\s,}\]]/.test(this.text[this.i])) this.i += 1;
    if (this.i === start) this.error('expected a value');
    const raw = this.text.slice(start, this.i);
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      this.error('invalid value');
    }
    return { type: typeof value, start, end: this.i, value };
  }
}

/** @param {string} text @param {object} node */
function detectChildIndent(text, node) {
  if (node.entries.length === 0) return '  ';
  const first = node.entries[0].keyStart;
  const lineStart = text.lastIndexOf('\n', first - 1) + 1;
  const indent = text.slice(lineStart, first);
  return /^[ \t]*$/.test(indent) ? indent || '  ' : '  ';
}

/** @param {object} node @param {string} key */
function getEntry(node, key) {
  if (!node || node.type !== 'object') return null;
  return node.entries.find((entry) => entry.key === key) ?? null;
}

/**
 * @typedef {import('./errors.mjs').Conflict} Conflict
 */

/**
 * Validate that an existing parsed config is compatible with the required
 * settings. Only detects conflicts; does not mutate.
 *
 * @param {unknown} parsed
 * @returns {Conflict[]}
 */
export function checkOpenCodeConflicts(parsed) {
  /** @type {Conflict[]} */
  const conflicts = [];
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return [
      {
        kind: 'opencode',
        path: 'opencode',
        reason: 'configuration root is not a JSON object',
        remedy: 'fix the OpenCode config, then re-run',
      },
    ];
  }
  const config = /** @type {Record<string, unknown>} */ (parsed);
  if (config.default_agent !== undefined && config.default_agent !== REQUIRED_OPENCODE.default_agent) {
    conflicts.push({
      kind: 'opencode',
      path: 'default_agent',
      reason: `already set to ${JSON.stringify(config.default_agent)} (want ${JSON.stringify(
        REQUIRED_OPENCODE.default_agent,
      )})`,
      remedy: 'remove or change the existing default_agent, or run with --dry-run to review',
    });
  }
  if (config.worktree !== undefined) {
    if (config.worktree === null || typeof config.worktree !== 'object' || Array.isArray(config.worktree)) {
      conflicts.push({
        kind: 'opencode',
        path: 'worktree',
        reason: 'expected an object',
        remedy: 'replace the worktree setting with an object or remove it',
      });
    } else {
      const worktree = /** @type {Record<string, unknown>} */ (config.worktree);
      if (worktree.directory !== undefined && worktree.directory !== REQUIRED_OPENCODE.worktree.directory) {
        conflicts.push({
          kind: 'opencode',
          path: 'worktree.directory',
          reason: `already set to ${JSON.stringify(worktree.directory)} (want ${JSON.stringify(
            REQUIRED_OPENCODE.worktree.directory,
          )})`,
          remedy: 'remove or change the existing worktree.directory, or run with --dry-run to review',
        });
      }
    }
  }
  return conflicts;
}

/**
 * Merge required settings into existing JSON/JSONC text without changing any
 * user value. Adds missing keys; preserves comments and formatting.
 *
 * @param {string} text
 * @returns {{ action: 'unchanged'|'update', text: string, conflicts: Conflict[] }}
 */
export function mergeOpenCodeText(text) {
  let parsed;
  try {
    parsed = parseJsonc(text);
  } catch (err) {
    return {
      action: 'unchanged',
      text,
      conflicts: [
        {
          kind: 'opencode',
          path: 'opencode',
          reason: `could not parse as JSON/JSONC (${err instanceof Error ? err.message : String(err)})`,
          remedy: 'fix the syntax manually, then re-run',
        },
      ],
    };
  }
  const conflicts = checkOpenCodeConflicts(parsed);
  if (conflicts.length > 0) return { action: 'unchanged', text, conflicts };

  const config = /** @type {Record<string, unknown>} */ (parsed);
  const missingDefaultAgent = config.default_agent === undefined;
  const worktreeEntry = config.worktree;
  const missingWorktree = worktreeEntry === undefined;
  const missingWorktreeDirectory =
    worktreeEntry !== undefined &&
    typeof worktreeEntry === 'object' &&
    !Array.isArray(worktreeEntry) &&
    /** @type {Record<string, unknown>} */ (worktreeEntry).directory === undefined;

  if (!missingDefaultAgent && !missingWorktree && !missingWorktreeDirectory) {
    return { action: 'unchanged', text, conflicts: [] };
  }

  // Plain JSON: parse + reserialize is safe and preserves settings.
  if (!hasJsoncFeatures(text)) {
    const next = structuredClone(config);
    if (missingDefaultAgent) next.default_agent = REQUIRED_OPENCODE.default_agent;
    if (missingWorktree || missingWorktreeDirectory) {
      if (missingWorktree) {
        next.worktree = { directory: REQUIRED_OPENCODE.worktree.directory };
      } else {
        next.worktree = { .../** @type {object} */ (next.worktree), directory: REQUIRED_OPENCODE.worktree.directory };
      }
    }
    return { action: 'update', text: `${JSON.stringify(next, null, 2)}\n`, conflicts: [] };
  }

  // JSONC with comments: offset-based insertion only, never rewrites values.
  try {
    const tree = new JsoncTree(text).parse();
    if (tree.type !== 'object') throw new Error('root is not an object');
    return {
      action: 'update',
      text: insertRequiredIntoTrees(text, tree, {
        missingDefaultAgent,
        missingWorktree,
        missingWorktreeDirectory,
      }),
      conflicts: [],
    };
  } catch (err) {
    return {
      action: 'unchanged',
      text,
      conflicts: [
        {
          kind: 'opencode',
          path: 'opencode',
          reason: `JSONC features could not be merged safely (${err instanceof Error ? err.message : String(err)})`,
          remedy: `add "default_agent": "orchestrator" and "worktree": { "directory": ".worktrees" } manually, then re-run`,
        },
      ],
    };
  }
}

/**
 * @param {string} text
 * @param {object} root
 * @param {{ missingDefaultAgent: boolean, missingWorktree: boolean, missingWorktreeDirectory: boolean }} flags
 */
function insertRequiredIntoTrees(text, root, flags) {
  /** @type {{ index: number, text: string }[]} */
  const insertions = [];

  const rootLines = [];
  if (flags.missingDefaultAgent) {
    rootLines.push(`${JSON.stringify('default_agent')}: ${JSON.stringify(REQUIRED_OPENCODE.default_agent)}`);
  }
  if (flags.missingWorktree) {
    rootLines.push(
      `${JSON.stringify('worktree')}: ${JSON.stringify({ directory: REQUIRED_OPENCODE.worktree.directory })}`,
    );
  }
  if (rootLines.length > 0) {
    insertions.push(buildObjectInsertion(root, rootLines));
  }

  if (flags.missingWorktreeDirectory) {
    const worktreeEntry = getEntry(root, 'worktree');
    const worktreeNode = worktreeEntry.value;
    if (worktreeNode.type !== 'object') throw new Error('worktree is not an object');
    insertions.push(
      buildObjectInsertion(worktreeNode, [
        `${JSON.stringify('directory')}: ${JSON.stringify(REQUIRED_OPENCODE.worktree.directory)}`,
      ]),
    );
  }

  let output = text;
  insertions.sort((a, b) => b.index - a.index);
  for (const insertion of insertions) {
    output = output.slice(0, insertion.index) + insertion.text + output.slice(insertion.index);
  }
  return output;
}

/** @param {object} node @param {string[]} lines */
function buildObjectInsertion(node, lines) {
  const childIndent = node.childIndent ?? '  ';
  const body = lines.map((line) => `${childIndent}${line}`).join(',\n');
  if (node.empty) {
    return { index: node.insertIndex, text: `\n${body}\n` };
  }
  const prefix = node.needsLeadingComma ? ',' : '';
  return { index: node.insertIndex, text: `${prefix}\n${body}` };
}

/** Build a fresh OpenCode config document. */
export function buildOpenCodeDocument() {
  return `${JSON.stringify(
    {
      $schema: SCHEMA_URL,
      default_agent: REQUIRED_OPENCODE.default_agent,
      worktree: { directory: REQUIRED_OPENCODE.worktree.directory },
    },
    null,
    2,
  )}\n`;
}

/**
 * Ensure rendered template content carries the required settings (used when the
 * CLI creates the OpenCode config from a template).
 *
 * @param {string} text
 */
export function ensureOpenCodeDocument(text) {
  const merged = mergeOpenCodeText(text);
  if (merged.conflicts.length > 0) return merged;
  if (merged.action === 'unchanged') return { action: 'unchanged', text, conflicts: [] };
  return merged;
}

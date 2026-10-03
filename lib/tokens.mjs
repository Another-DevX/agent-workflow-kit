/**
 * Template token contract.
 *
 * Supported raw tokens:
 *   {{VERIFY_COMMAND}} {{VERIFY_FULL_COMMAND}} {{SETUP_COMMAND}} {{SCOPE_DOCUMENT}}
 *
 * A `_JSON` suffix is also supported (e.g. {{VERIFY_COMMAND_JSON}}). It renders
 * the value escaped for use inside a JSON string, so templates that embed a
 * command in `opencode.json(c)` stay valid even when the command contains
 * quotes or backslashes.
 *
 * Safe default literals:
 *   - verifyFullCommand falls back to verifyCommand
 *   - setupCommand falls back to `true` (a POSIX no-op)
 *   - scopeDocument falls back to `AGENTS.md`
 *
 * verifyCommand has no default: init must supply `--verify`, answer the TTY
 * prompt, or run in a project with an existing `scripts/verify.sh`.
 */
export const DEFAULT_SCOPE_DOCUMENT = 'AGENTS.md';
export const DEFAULT_SETUP_COMMAND = 'true';

export const TOKEN_NAMES = Object.freeze([
  'VERIFY_COMMAND',
  'VERIFY_FULL_COMMAND',
  'SETUP_COMMAND',
  'SCOPE_DOCUMENT',
]);

/** @param {...(string|null|undefined)} candidates */
export function firstNonEmpty(...candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() !== '') return candidate;
  }
  return undefined;
}

/**
 * @param {{ args?: Record<string, string|undefined>, existing?: Record<string, string|undefined>, detectedVerify?: string, preferExisting?: boolean }} [input]
 */
export function resolveValues(input = {}) {
  const args = input.args ?? {};
  const existing = input.existing ?? {};
  const preferExisting = Boolean(input.preferExisting);
  // When a project config already exists it is authoritative: flags only fill
  // gaps so rendered files never disagree with the preserved config.
  const pick = (argValue, existingValue, fallback) =>
    preferExisting
      ? firstNonEmpty(existingValue, argValue, fallback)
      : firstNonEmpty(argValue, existingValue, fallback);

  const verifyCommand = pick(args.verify, existing.verifyCommand, input.detectedVerify) ?? null;
  const verifyFullCommand =
    pick(args.verifyFull, existing.verifyFullCommand, verifyCommand ?? undefined) ?? null;
  const setupCommand = pick(args.setup, existing.setupCommand, undefined) ?? DEFAULT_SETUP_COMMAND;
  const scopeDocument = pick(args.scope, existing.scopeDocument, undefined) ?? DEFAULT_SCOPE_DOCUMENT;
  return { verifyCommand, verifyFullCommand, setupCommand, scopeDocument };
}

/** JSON-escape a value for embedding between JSON string quotes. @param {string} value */
export function jsonEscape(value) {
  return JSON.stringify(value).slice(1, -1);
}

/**
 * @param {string} text
 * @param {{ verifyCommand?: string|null, verifyFullCommand?: string|null, setupCommand?: string|null, scopeDocument?: string|null }} values
 */
export function renderTokens(text, values) {
  const map = {
    VERIFY_COMMAND: values.verifyCommand ?? '',
    VERIFY_FULL_COMMAND: values.verifyFullCommand ?? '',
    SETUP_COMMAND: values.setupCommand ?? '',
    SCOPE_DOCUMENT: values.scopeDocument ?? '',
  };
  let output = text;
  for (const [name, value] of Object.entries(map)) {
    const raw = String(value);
    output = output.split(`{{${name}}}`).join(raw);
    output = output.split(`{{${name}_JSON}}`).join(jsonEscape(raw));
  }
  return output;
}

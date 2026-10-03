/**
 * Error types used across the CLI.
 *
 * `CliError` is the single error shape the command runner knows how to render.
 * `exitCode` lets callers distinguish usage errors (2) from operational
 * failures (1). `details` carries additional lines, typically conflict
 * descriptions that must be shown before the process exits without writing.
 */
export class CliError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: number, details?: string[], cause?: unknown }} [options]
   */
  constructor(message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'CliError';
    this.exitCode = options.code ?? 1;
    /** @type {string[]} */
    this.details = options.details ?? [];
  }
}

/** A usage / argument error. */
export class UsageError extends CliError {
  constructor(message, options = {}) {
    super(message, { ...options, code: 2 });
    this.name = 'UsageError';
  }
}

/**
 * A write conflict detected during preflight. No files have been written when
 * this is thrown.
 */
export class ConflictError extends CliError {
  /**
   * @param {string} message
   * @param {Conflict[]} conflicts
   */
  constructor(message, conflicts = []) {
    super(message, {
      code: 1,
      details: conflicts.map(describeConflict),
    });
    this.name = 'ConflictError';
    /** @type {Conflict[]} */
    this.conflicts = conflicts;
  }
}

/**
 * @typedef {object} Conflict
 * @property {'file'|'symlink'|'escape'|'directory'|'opencode'|'config'|'type'} kind
 * @property {string} path Relative destination path.
 * @property {string} reason Human readable reason.
 * @property {string} [remedy] Actionable next step.
 */

/**
 * @param {Conflict} conflict
 * @returns {string}
 */
export function describeConflict(conflict) {
  const base = `- ${conflict.path}: ${conflict.reason}`;
  return conflict.remedy ? `${base}\n  -> ${conflict.remedy}` : base;
}

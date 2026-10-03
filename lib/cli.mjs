import path from 'node:path';
import { CliError, UsageError } from './errors.mjs';
import { createLogger } from './log.mjs';
import { USAGE } from './help-text.mjs';
import { PACKAGE_VERSION } from './package-info.mjs';
import { runInit } from './commands/init.mjs';
import { runUpdate } from './commands/update.mjs';
import { runDoctor } from './commands/doctor.mjs';

const VALUE_OPTIONS = new Map([
  ['--target', 'target'],
  ['--verify', 'verify'],
  ['--verify-full', 'verifyFull'],
  ['--setup', 'setup'],
  ['--scope', 'scope'],
]);

const BOOLEAN_OPTIONS = new Map([
  ['--dry-run', 'dryRun'],
  ['--help', 'help'],
  ['-h', 'help'],
  ['--version', 'version'],
  ['-v', 'version'],
]);

const COMMANDS = new Set(['init', 'update', 'doctor', 'help']);

/**
 * @param {string[]} argv
 * @returns {{ command: string|null, options: Record<string, any>, positionals: string[] }}
 */
export function parseArgs(argv) {
  const positionals = [];
  /** @type {Record<string, any>} */
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    const equals = arg.startsWith('--') && arg.includes('=');
    if (equals) {
      const index = arg.indexOf('=');
      const flag = arg.slice(0, index);
      const value = arg.slice(index + 1);
      if (VALUE_OPTIONS.has(flag)) {
        options[VALUE_OPTIONS.get(flag)] = value;
        continue;
      }
      if (BOOLEAN_OPTIONS.has(flag)) throw new UsageError(`option ${flag} does not take a value`);
      throw new UsageError(`unknown option: ${flag}`);
    }
    if (VALUE_OPTIONS.has(arg)) {
      const key = VALUE_OPTIONS.get(arg);
      const value = argv[i + 1];
      if (value === undefined) throw new UsageError(`option ${arg} requires a value`);
      options[key] = value;
      i += 1;
      continue;
    }
    if (BOOLEAN_OPTIONS.has(arg)) {
      options[BOOLEAN_OPTIONS.get(arg)] = true;
      continue;
    }
    if (arg.startsWith('-') && arg !== '-') throw new UsageError(`unknown option: ${arg}`);
    positionals.push(arg);
  }
  const command = positionals.shift() ?? null;
  return { command, options, positionals };
}

/**
 * @param {string[]} argv
 * @param {{
 *   stdout?: NodeJS.WriteStream,
 *   stderr?: NodeJS.WriteStream,
 *   stdin?: NodeJS.ReadStream,
 *   env?: Record<string, string|undefined>,
 *   cwd?: string,
 * }} [deps]
 * @returns {Promise<number>} Exit code.
 */
export async function main(argv = process.argv.slice(2), deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const stdin = deps.stdin ?? process.stdin;
  const env = deps.env ?? process.env;
  const cwd = deps.cwd ?? process.cwd();

  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    return fail(err, stderr, stdout);
  }
  const { command, options, positionals } = parsed;
  const dryRun = Boolean(options.dryRun);
  const logger = createLogger({ stdout, stderr, dryRun });

  if (options.version) {
    stdout.write(`${PACKAGE_VERSION}\n`);
    return 0;
  }
  if (options.help || command === null || command === 'help') {
    stdout.write(USAGE);
    return 0;
  }
  if (!COMMANDS.has(command)) {
    return fail(new UsageError(`unknown command: ${command}`), stderr, stdout);
  }
  if (positionals.length > 0) {
    return fail(
      new UsageError(`unexpected argument(s): ${positionals.join(' ')}`),
      stderr,
      stdout,
    );
  }

  const target = path.resolve(cwd, options.target ?? '.');
  const context = { target, options, logger, dryRun, env, stdin, stdout };

  try {
    if (command === 'init') {
      await runInit(context);
      return 0;
    }
    if (command === 'update') {
      await runUpdate(context);
      return 0;
    }
    if (command === 'doctor') {
      return await runDoctor(context);
    }
  } catch (err) {
    return fail(err, stderr, stdout);
  }
  return 0;
}

/**
 * @param {unknown} err
 * @param {NodeJS.WriteStream} stderr
 * @param {NodeJS.WriteStream} stdout
 */
function fail(err, stderr, stdout) {
  if (err instanceof CliError) {
    stderr.write(`error: ${err.message}\n`);
    for (const detail of err.details) stderr.write(`${detail}\n`);
    if (err.exitCode === 2) stderr.write('\nRun "agent-workflow help" for usage.\n');
    return err.exitCode;
  }
  if (err instanceof Error) {
    stderr.write(`error: ${err.message}\n`);
    return 1;
  }
  stderr.write(`error: ${String(err)}\n`);
  return 1;
}

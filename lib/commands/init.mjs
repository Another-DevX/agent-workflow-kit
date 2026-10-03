import fs from 'node:fs';
import path from 'node:path';
import { CliError, ConflictError } from '../errors.mjs';
import { readManifest } from '../manifest.mjs';
import { PACKAGE_VERSION } from '../package-info.mjs';
import { buildPlan, applyPlan, VERIFY_SCRIPT_REL } from '../plan.mjs';
import { readProjectConfig } from '../project-config.mjs';
import { isInteractive, askVerifyCommand } from '../prompt.mjs';
import { discoverTemplates, resolveTemplatesRoot } from '../templates.mjs';
import { DEFAULT_SETUP_COMMAND, resolveValues, firstNonEmpty } from '../tokens.mjs';
import { isDirectory } from '../fsutil.mjs';

/** @param {string} target */
export function assertTargetDirectory(target) {
  if (!fs.existsSync(target)) {
    throw new CliError(`target does not exist: ${target}`, {
      details: ['Create the directory or pass --target <path>.'],
    });
  }
  if (!isDirectory(target)) {
    throw new CliError(`target is not a directory: ${target}`);
  }
}

/** @param {string} target */
export function detectExistingVerify(target) {
  const candidate = path.join(target, VERIFY_SCRIPT_REL);
  try {
    const stat = fs.statSync(candidate);
    if (stat.isFile()) return `bash ${VERIFY_SCRIPT_REL}`;
  } catch {
    // absent
  }
  return undefined;
}

/** @param {string} target */
export function readExistingProjectConfig(target) {
  try {
    return readProjectConfig(target);
  } catch {
    // A malformed config is reported later as a preflight conflict.
    return null;
  }
}

/** @param {Record<string, string|undefined>} env */
export function loadTemplateFiles(env) {
  const templatesRoot = resolveTemplatesRoot({ env });
  const discovery = discoverTemplates(templatesRoot);
  if (!discovery.ok) {
    throw new CliError(`templates unavailable: ${discovery.error}`, {
      details: [
        'Reinstall the package, or set AGENT_WORKFLOW_TEMPLATES to a template root.',
      ],
    });
  }
  return discovery.files;
}

/**
 * @param {{
 *   target: string,
 *   options: Record<string, any>,
 *   logger: ReturnType<typeof import('../log.mjs').createLogger>,
 *   dryRun: boolean,
 *   env: Record<string, string|undefined>,
 *   stdin: NodeJS.ReadStream,
 *   stdout: NodeJS.WriteStream,
 * }} context
 */
export async function runInit(context) {
  const { target, options, logger, dryRun, env, stdin, stdout } = context;
  assertTargetDirectory(target);

  const templateFiles = loadTemplateFiles(env);
  const manifestResult = readManifest(target);
  const manifest = manifestResult.ok ? manifestResult.manifest : null;
  if (manifest && manifest.version && manifest.version !== PACKAGE_VERSION) {
    logger.warn(`installed manifest version ${manifest.version} differs from CLI ${PACKAGE_VERSION}`);
  }

  const detectedVerify = detectExistingVerify(target);
  const existingConfig = readExistingProjectConfig(target);

  let values = resolveValues({
    args: options,
    existing: existingConfig ?? {},
    detectedVerify,
    preferExisting: existingConfig !== null,
  });

  if (!values.verifyCommand && !options.verify && isInteractive({ stdin, stdout })) {
    const answer = await askVerifyCommand({ stdin, stdout, defaultValue: detectedVerify });
    if (answer) {
      values = resolveValues({
        args: { ...options, verify: answer },
        existing: existingConfig ?? {},
        detectedVerify,
        preferExisting: existingConfig !== null,
      });
    }
  }

  if (!values.verifyCommand) {
    const details = ['Pass --verify "<command>".'];
    if (detectedVerify) {
      details.push(`Detected ${VERIFY_SCRIPT_REL}; use --verify "${detectedVerify}".`);
    } else {
      details.push(`Add ${VERIFY_SCRIPT_REL} or pass --verify "<command>".`);
    }
    throw new CliError('a verification command is required and none was provided', { details });
  }

  const plan = buildPlan({
    root: target,
    mode: 'init',
    manifest,
    templateFiles,
    values,
  });

  for (const note of plan.notes) logger.action(note);

  if (plan.conflicts.length > 0) {
    throw new ConflictError('init aborted: conflicts detected; no files were written', plan.conflicts);
  }

  const result = await applyPlan(plan.writes, { dryRun, logger });
  logSummary(logger, { dryRun, writes: plan.writes, values, target });
  return result;
}

/** @param {ReturnType<import('../log.mjs').createLogger>} logger */
export function logSummary(logger, { dryRun, writes, values, target }) {
  if (dryRun) {
    logger.out(`dry run complete: ${writes.length} change(s); no files written`);
  } else {
    logger.out(`installed in ${target}: ${writes.length} change(s)`);
  }
  const verify = firstNonEmpty(values.verifyCommand) ?? '(none)';
  logger.out(`verify command: ${verify}`);
  logger.out(`setup command: ${values.setupCommand ?? DEFAULT_SETUP_COMMAND}`);
  if (writes.length === 0) logger.out('already up to date');
}

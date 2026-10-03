import { CliError, ConflictError } from '../errors.mjs';
import { readManifest } from '../manifest.mjs';
import { PACKAGE_VERSION } from '../package-info.mjs';
import { buildPlan, applyPlan, VERIFY_SCRIPT_REL } from '../plan.mjs';
import { discoverTemplates, resolveTemplatesRoot } from '../templates.mjs';
import { resolveValues } from '../tokens.mjs';
import { assertTargetDirectory, detectExistingVerify, readExistingProjectConfig, logSummary } from './init.mjs';

/**
 * @param {{
 *   target: string,
 *   options: Record<string, any>,
 *   logger: ReturnType<import('../log.mjs').createLogger>,
 *   dryRun: boolean,
 *   env: Record<string, string|undefined>,
 * }} context
 */
export async function runUpdate(context) {
  const { target, options, logger, dryRun, env } = context;
  assertTargetDirectory(target);

  const manifestResult = readManifest(target);
  if (!manifestResult.ok) {
    throw new CliError(`update requires an existing installation (${manifestResult.error})`, {
      details: ['Run: agent-workflow init --target <path>'],
    });
  }
  const manifest = manifestResult.manifest;
  if (manifest.version && manifest.version !== PACKAGE_VERSION) {
    logger.warn(`installed manifest version ${manifest.version} differs from CLI ${PACKAGE_VERSION}`);
  }

  const templatesRoot = resolveTemplatesRoot({ env });
  const discovery = discoverTemplates(templatesRoot);
  if (!discovery.ok) {
    throw new CliError(`templates unavailable: ${discovery.error}`, {
      details: ['Reinstall the package, or set AGENT_WORKFLOW_TEMPLATES to a template root.'],
    });
  }

  const existingConfig = readExistingProjectConfig(target);
  const detectedVerify = detectExistingVerify(target);
  const values = resolveValues({ args: options, existing: existingConfig ?? {}, detectedVerify, preferExisting: true });

  if (!values.verifyCommand) {
    throw new CliError('no verification command configured', {
      details: [
        `Add "verifyCommand" to .agent-workflow/project.json or pass --verify "<command>".`,
        detectedVerify
          ? `Detected ${VERIFY_SCRIPT_REL}; use --verify "${detectedVerify}".`
          : `Add ${VERIFY_SCRIPT_REL} or pass --verify "<command>".`,
      ],
    });
  }

  const plan = buildPlan({
    root: target,
    mode: 'update',
    manifest,
    templateFiles: discovery.files,
    values,
  });

  for (const note of plan.notes) logger.action(note);

  if (plan.conflicts.length > 0) {
    throw new ConflictError('update aborted: conflicts detected; no files were written', plan.conflicts);
  }

  const result = await applyPlan(plan.writes, { dryRun, logger });
  logSummary(logger, { dryRun, writes: plan.writes, values, target });
  return result;
}

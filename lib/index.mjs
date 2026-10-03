export { main, parseArgs } from './cli.mjs';
export { runInit } from './commands/init.mjs';
export { runUpdate } from './commands/update.mjs';
export { runDoctor } from './commands/doctor.mjs';
export { buildPlan, applyPlan, VERIFY_SCRIPT_REL } from './plan.mjs';
export {
  discoverTemplates,
  resolveTemplatesRoot,
  renderTemplate,
  readTemplate,
  PACKAGE_ROOT,
  TEMPLATE_SECTIONS,
} from './templates.mjs';
export { renderTokens, resolveValues, DEFAULT_SCOPE_DOCUMENT, DEFAULT_SETUP_COMMAND } from './tokens.mjs';
export {
  readManifest,
  serializeManifest,
  manifestHash,
  manifestIsBlock,
  MANIFEST_REL,
} from './manifest.mjs';
export {
  readProjectConfig,
  mergeProjectConfig,
  serializeProjectConfig,
  PROJECT_CONFIG_REL,
  PROJECT_CONFIG_KEYS,
} from './project-config.mjs';
export {
  mergeOpenCodeText,
  ensureOpenCodeDocument,
  buildOpenCodeDocument,
  checkOpenCodeConflicts,
  findExistingOpenCodeConfig,
  listOpenCodeConfigPaths,
  isOpenCodeConfigPath,
  parseJsonc,
  REQUIRED_OPENCODE,
} from './opencode-config.mjs';
export {
  isManagedBlockFile,
  buildManagedBlock,
  extractManagedBlock,
  mergeManagedBlock,
  MARKER_DEFS,
} from './markers.mjs';
export { PACKAGE_NAME, PACKAGE_VERSION } from './package-info.mjs';
export { CliError, UsageError, ConflictError } from './errors.mjs';
export { createLogger } from './log.mjs';
export { resolveDestination, sha256Text, normalizeRelative } from './fsutil.mjs';
export { USAGE } from './help-text.mjs';

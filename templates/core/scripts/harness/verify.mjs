#!/usr/bin/env node
//
// Generic verification engine for the agent workflow kit.
//
// Reads .agent-workflow/project.json and runs the configured commands from the
// repository root. It contains no project-specific logic and performs no token
// replacement: the project owns its commands, this engine only invokes them.
//
//   node scripts/harness/verify.mjs          -> verifyCommand
//   node scripts/harness/verify.mjs --full   -> verifyCommand, then verifyFullCommand
//
// Exit 0 on success, non-zero on failure. It never modifies source, never
// commits, and never moves the known-good tag.
//
// Configuration (.agent-workflow/project.json):
//   verifyCommand      required, non-empty: the normal mechanical gate
//   verifyFullCommand  optional: expensive integration/E2E/release checks
//   setupCommand       optional: consumed by the orchestrator, never by this engine
//   scopeDocument      optional: project scope doc, consumed by agents
//
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const REL_CONFIG = path.join(".agent-workflow", "project.json");
const CONFIG_PATH = path.join(ROOT, REL_CONFIG);

// Commands that re-enter this engine, directly or through a wrapper. A project
// must configure its real gate, not the workflow wrapper.
const WRAPPERS = [
  "scripts/verify.sh",
  "scripts/verify-full.sh",
  "scripts/harness/verify.mjs",
];

const full = process.argv.slice(2).includes("--full");

const section = (title) => process.stdout.write(`\n=== ${title} ===\n`);
const info = (text) => process.stdout.write(`${text}\n`);
const fail = (message) => {
  process.stderr.write(`\nerror: ${message}\n`);
  process.exit(1);
};

// Runtime recursion guard: the wrappers invoke this engine, and this engine
// sets the marker for every command it runs. If a configured command re-enters
// the engine, the marker is already present.
if (process.env.AGENT_WORKFLOW_VERIFY_ACTIVE === "1") {
  fail(
    "recursive verification invocation detected. A verifyCommand must not call " +
      "scripts/verify.sh, scripts/verify-full.sh, or scripts/harness/verify.mjs.",
  );
}

if (!existsSync(CONFIG_PATH)) {
  fail(
    `missing configuration: ${REL_CONFIG}. Create it with at least a non-empty ` +
      `"verifyCommand".`,
  );
}

let config;
try {
  config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
} catch (error) {
  fail(`invalid JSON in ${REL_CONFIG}: ${error.message}`);
}
if (config === null || typeof config !== "object" || Array.isArray(config)) {
  fail(`${REL_CONFIG} must contain a JSON object`);
}

// Read a command field. Required fields must exist and be non-empty; optional
// fields may be absent, but a present field must still be a non-empty string.
function commandField(name, { required }) {
  const value = config[name];
  if (value === undefined || value === null) {
    if (required) fail(`"${name}" is required in ${REL_CONFIG}`);
    return null;
  }
  if (typeof value !== "string" || value.trim() === "") {
    fail(`"${name}" must be a non-empty string in ${REL_CONFIG}`);
  }
  return value.trim();
}

const verifyCommand = commandField("verifyCommand", { required: true });
const verifyFullCommand = commandField("verifyFullCommand", { required: false });

function looksLikeWrapper(command) {
  let normalized = command.trim().replace(/^(?:bash|sh|zsh|node|exec)\s+/, "");
  normalized = normalized.replace(/^\.\//, "").trim();
  return WRAPPERS.some(
    (wrapper) => normalized === wrapper || normalized.endsWith(`/${wrapper}`),
  );
}

if (looksLikeWrapper(verifyCommand)) {
  fail(
    `"verifyCommand" points at the workflow wrapper ("${verifyCommand}"). ` +
      `Set it to the project's real verification command instead; wrappers ` +
      `invoke this engine and would recurse.`,
  );
}

function run(label, command) {
  section(label);
  info(`$ ${command}`);
  const result = spawnSync(command, {
    cwd: ROOT,
    shell: true,
    stdio: "inherit",
    env: { ...process.env, AGENT_WORKFLOW_VERIFY_ACTIVE: "1" },
  });
  if (result.error) {
    info(`FAIL: ${result.error.message}`);
    return false;
  }
  if (result.status === 0) {
    info("PASS");
    return true;
  }
  const detail =
    result.status === null ? `signal ${result.signal}` : `exit ${result.status}`;
  info(`FAIL (${detail})`);
  return false;
}

section(full ? "VERIFY (normal, required)" : "VERIFY");
if (!run("VERIFY COMMAND", verifyCommand)) {
  if (full) {
    info("\nFull verification aborted: the normal verification command failed.");
  }
  process.stdout.write(
    "\n========================\nVERIFICATION FAILED\n========================\n",
  );
  process.exit(1);
}

if (full) {
  if (verifyFullCommand) {
    if (!run("FULL VERIFICATION (configured)", verifyFullCommand)) {
      process.stdout.write(
        "\n========================\nFULL VERIFICATION FAILED\n========================\n",
      );
      process.exit(1);
    }
  } else {
    section("FULL VERIFICATION (configured)");
    info('No "verifyFullCommand" is configured; only the normal verification ran.');
    info("Full verification is therefore identical to normal verification here.");
  }
}

process.stdout.write(
  `\n========================\n${
    full ? "FULL VERIFICATION PASSED" : "VERIFICATION PASSED"
  }\n========================\n`,
);
process.exit(0);

import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  runCli,
  withRepo,
  makeTempRepo,
  cleanup,
  pathExists,
  readJson,
  readText,
  containsSha256,
  findNamedFiles,
  snapshot,
  DEFAULT_CHECKS,
  ROOT,
} from './helpers.mjs';

test('help exits 0 and prints usage', async () => {
  const result = await runCli(['help']);
  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.trim().length > 0, 'help should print usage text');
});

test('fresh init scaffolds managed files, config and manifest', async () => {
  await withRepo(async (repo) => {
    const result = await runCli(['init', ...DEFAULT_CHECKS], { cwd: repo });
    assert.equal(result.code, 0, `init failed:\n${result.stderr}`);

    const expectedPaths = [
      '.agent-workflow/project.json',
      '.agent-workflow/manifest.json',
      'scripts/verify.sh',
      'scripts/verify-full.sh',
      'AGENTS.md',
      '.gitignore',
      'docs/agent-workflow',
      'scripts/harness',
      '.opencode',
    ];
    for (const rel of expectedPaths) {
      assert.ok(await pathExists(join(repo, rel)), `expected init to create ${rel}`);
    }

    // The agent/command definitions must exist, regardless of exact filenames.
    const names = ['orchestrator', 'reviewer', 'subreviewer', 'iterate', 'quickfix', 'bootstrap'];
    const found = await findNamedFiles(repo, names);
    for (const name of names) {
      assert.ok(
        found[name].some((p) => p.startsWith('.opencode/')),
        `expected a .opencode entry for "${name}", found: ${JSON.stringify(found[name])}`,
      );
    }

    // Config records the supplied check commands under the documented keys.
    const config = await readJson(join(repo, '.agent-workflow', 'project.json'));
    assert.equal(config.verifyCommand, 'node --version');
    assert.equal(config.verifyFullCommand, 'node --version');
    assert.equal(config.setupCommand, 'node --version');
    assert.ok('scopeDocument' in config, 'config should expose scopeDocument');

    // Manifest is versioned JSON that records content hashes. The exact shape
    // is intentionally not asserted.
    const manifest = await readJson(join(repo, '.agent-workflow', 'manifest.json'));
    const pkg = await readJson(join(ROOT, 'package.json'));
    assert.ok(
      JSON.stringify(manifest).includes(pkg.version),
      'manifest should record the package version',
    );
    assert.ok(containsSha256(manifest), 'manifest should record at least one sha256 hash');
  });
});

test('init --target writes into the target, not the current directory', async () => {
  const cwd = await makeTempRepo('awk-cwd-');
  const target = await makeTempRepo('awk-target-');
  try {
    const result = await runCli(['init', '--target', target, ...DEFAULT_CHECKS], { cwd });
    assert.equal(result.code, 0, `init failed:\n${result.stderr}`);

    assert.ok(
      await pathExists(join(target, '.agent-workflow', 'project.json')),
      'target should receive the scaffold',
    );
    assert.ok(
      !(await pathExists(join(cwd, '.agent-workflow'))),
      'cwd must not receive the scaffold when --target is used',
    );
  } finally {
    await cleanup(cwd);
    await cleanup(target);
  }
});

test('init is rejected when no check commands are provided', async () => {
  await withRepo(async (repo) => {
    const before = await snapshot(repo);
    const result = await runCli(['init'], { cwd: repo });
    assert.notEqual(result.code, 0, 'init without checks must not succeed');

    const after = await snapshot(repo);
    assert.deepEqual(after, before, 'a rejected init must not write anything');
  });
});

test('init --dry-run writes nothing', async () => {
  await withRepo(async (repo) => {
    const before = await snapshot(repo);
    const result = await runCli(['init', '--dry-run', ...DEFAULT_CHECKS], { cwd: repo });
    assert.equal(result.code, 0, `dry-run failed:\n${result.stderr}`);

    const after = await snapshot(repo);
    assert.deepEqual(after, before, 'a dry run must not modify the target');
  });
});

test('init is idempotent and does not duplicate managed content', async () => {
  await withRepo(async (repo) => {
    const first = await runCli(['init', ...DEFAULT_CHECKS], { cwd: repo });
    assert.equal(first.code, 0, `first init failed:\n${first.stderr}`);

    const afterFirst = await snapshot(repo);
    const agentsAfterFirst = await readText(join(repo, 'AGENTS.md'));

    const second = await runCli(['init', ...DEFAULT_CHECKS], { cwd: repo });
    assert.equal(second.code, 0, `second init failed:\n${second.stderr}`);

    const afterSecond = await snapshot(repo);
    assert.deepEqual(afterSecond, afterFirst, 'a repeated init must not change the project');

    const agentsAfterSecond = await readText(join(repo, 'AGENTS.md'));
    assert.equal(agentsAfterSecond, agentsAfterFirst, 'AGENTS.md must not be duplicated');
  });
});

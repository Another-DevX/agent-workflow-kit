import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chmod } from 'node:fs/promises';
import {
  runCli,
  withRepo,
  pathExists,
  readJson,
  readText,
  writeText,
  DEFAULT_CHECKS,
} from './helpers.mjs';

const AGENTS_SENTINEL = 'USER-AGENTS-SENTINEL-7f3a91c2';
const GITIGNORE_SENTINEL = 'user-only-dir/';

test('init preserves pre-existing user AGENTS.md and .gitignore content', async () => {
  await withRepo(async (repo) => {
    const agentsPath = join(repo, 'AGENTS.md');
    const gitignorePath = join(repo, '.gitignore');
    await writeText(agentsPath, `# My project\n\n${AGENTS_SENTINEL}\n`);
    await writeText(gitignorePath, `${GITIGNORE_SENTINEL}\n`);

    const result = await runCli(['init', ...DEFAULT_CHECKS], { cwd: repo });
    assert.equal(result.code, 0, `init failed:\n${result.stderr}`);

    const agents = await readText(agentsPath);
    assert.ok(agents.includes(AGENTS_SENTINEL), 'user content in AGENTS.md must be preserved');
    assert.notEqual(agents, `# My project\n\n${AGENTS_SENTINEL}\n`, 'a managed block should be added');

    const gitignore = await readText(gitignorePath);
    assert.ok(
      gitignore.includes(GITIGNORE_SENTINEL),
      'user content in .gitignore must be preserved',
    );
  });
});

test('init reuses an existing unmanaged scripts/verify.sh', async () => {
  await withRepo(async (repo) => {
    const verifyPath = join(repo, 'scripts', 'verify.sh');
    const sentinel = '#!/usr/bin/env bash\necho "USER-VERIFY-SENTINEL"\n';
    await writeText(verifyPath, sentinel);
    await chmod(verifyPath, 0o755);

    const result = await runCli(['init', ...DEFAULT_CHECKS], { cwd: repo });
    assert.equal(result.code, 0, `init failed:\n${result.stderr}`);

    assert.ok(await pathExists(verifyPath), 'scripts/verify.sh should still exist');
    assert.equal(
      await readText(verifyPath),
      sentinel,
      'an existing scripts/verify.sh must be reused, not overwritten',
    );
  });
});

test('update preserves user edits to project.json', async () => {
  await withRepo(async (repo) => {
    const init = await runCli(['init', ...DEFAULT_CHECKS], { cwd: repo });
    assert.equal(init.code, 0, `init failed:\n${init.stderr}`);

    const configPath = join(repo, '.agent-workflow', 'project.json');
    const config = await readJson(configPath);
    config.customUserField = 'keep-me-across-updates';
    await writeText(configPath, `${JSON.stringify(config, null, 2)}\n`);

    const update = await runCli(['update'], { cwd: repo });
    assert.equal(update.code, 0, `update failed:\n${update.stderr}`);

    const after = await readJson(configPath);
    assert.equal(
      after.customUserField,
      'keep-me-across-updates',
      'user configuration must survive an update',
    );
  });
});

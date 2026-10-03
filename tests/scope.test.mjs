import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runCli, withRepo, readJson, DEFAULT_CHECKS } from './helpers.mjs';

test('init --scope records the scope document in project.json', async () => {
  await withRepo(async (repo) => {
    const scope = 'docs/SCOPE.md';
    const result = await runCli(['init', '--scope', scope, ...DEFAULT_CHECKS], { cwd: repo });
    assert.equal(result.code, 0, `init failed:\n${result.stderr}`);

    const config = await readJson(join(repo, '.agent-workflow', 'project.json'));
    assert.equal(config.scopeDocument, scope, 'scopeDocument should reflect --scope');
  });
});

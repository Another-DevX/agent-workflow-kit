import test from 'node:test';
import assert from 'node:assert/strict';
import { runCli, withRepo, git, DEFAULT_CHECKS } from './helpers.mjs';

test('doctor fails without a bootstrap, then passes against a mock known-good', async () => {
  await withRepo(async (repo) => {
    // Fresh repository: nothing is bootstrapped yet.
    const before = await runCli(['doctor'], { cwd: repo });
    assert.notEqual(before.code, 0, 'doctor must report a missing bootstrap');

    const init = await runCli(['init', ...DEFAULT_CHECKS], { cwd: repo });
    assert.equal(init.code, 0, `init failed:\n${init.stderr}`);

    // Materialise a mock "known-good" baseline: commit the scaffold and tag it.
    await git(repo, ['add', '-A']);
    await git(repo, ['commit', '-q', '-m', 'chore: bootstrap workflow kit']);
    await git(repo, ['tag', 'known-good']);

    const after = await runCli(['doctor'], { cwd: repo });
    assert.equal(after.code, 0, `doctor failed after bootstrap:\n${after.stderr}`);
  });
});

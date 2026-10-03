import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdtemp, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  runCli,
  withRepo,
  makeTempRepo,
  cleanup,
  snapshot,
  readText,
  writeText,
  appendText,
  pickManagedFile,
  DEFAULT_CHECKS,
} from './helpers.mjs';

test('init rejects a path conflict during preflight without partial writes', async () => {
  await withRepo(async (repo) => {
    // A regular file where init needs the .agent-workflow directory.
    await writeText(join(repo, '.agent-workflow'), 'blocker\n');

    const before = await snapshot(repo);
    const result = await runCli(['init', ...DEFAULT_CHECKS], { cwd: repo });
    assert.notEqual(result.code, 0, 'init must fail on a path conflict');

    const after = await snapshot(repo);
    assert.deepEqual(after, before, 'a preflight failure must leave the tree untouched');
    assert.equal(await readText(join(repo, '.agent-workflow')), 'blocker\n');
  });
});

test('init refuses a symlinked managed directory that escapes the target', async () => {
  const repo = await makeTempRepo('awk-symlink-');
  const outside = await mkdtemp(join(tmpdir(), 'awk-outside-'));
  try {
    // `docs` is a managed parent directory; point it outside the repository.
    await symlink(outside, join(repo, 'docs'), 'dir');

    const before = await snapshot(repo);
    const result = await runCli(['init', ...DEFAULT_CHECKS], { cwd: repo });
    assert.notEqual(result.code, 0, 'init must refuse to write through an escaping symlink');

    const escaped = await readdir(outside);
    assert.deepEqual(escaped, [], 'nothing may be written outside the target');

    const after = await snapshot(repo);
    assert.deepEqual(after, before, 'the repository must be left untouched');
  } finally {
    await cleanup(repo);
    await rm(outside, { recursive: true, force: true });
  }
});

test('update refuses to overwrite a managed file edited by the user', async () => {
  await withRepo(async (repo) => {
    const init = await runCli(['init', ...DEFAULT_CHECKS], { cwd: repo });
    assert.equal(init.code, 0, `init failed:\n${init.stderr}`);

    const rel = await pickManagedFile(repo);
    const abs = join(repo, rel);
    const edit = '\n# local edit that must not be overwritten\n';
    await appendText(abs, edit);

    const update = await runCli(['update'], { cwd: repo });
    assert.notEqual(update.code, 0, 'update must refuse a drifted managed file');

    const content = await readText(abs);
    assert.ok(content.includes('# local edit that must not be overwritten'), 'the user edit must survive');
  });
});

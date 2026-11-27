import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const file = join(import.meta.dirname, '../.github/workflows/test.yml');

test('the Test workflow runs npm test on Node 22 and macOS with FFmpeg and a CJK font on Linux', () => {
  assert.ok(existsSync(file), '.github/workflows/test.yml exists');
  const yml = readFileSync(file, 'utf8');
  assert.match(yml, /pull_request:/);
  assert.match(yml, /node: 22/);
  assert.match(yml, /os: macos-latest/);
  assert.match(yml, /apt-get install -y ffmpeg fonts-noto-cjk/);
  assert.match(yml, /brew install ffmpeg/);
  const runs = [...yml.matchAll(/- run: (.+)/g)].map((m) => m[1].trim());
  assert.equal(runs.at(-1), 'npm test');
});

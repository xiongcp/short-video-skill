import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (name) => readFileSync(join(import.meta.dirname, '..', name), 'utf8');
const sections = (t) => (t.match(/^## /gm) ?? []).length;
const links = (t) => [...t.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]).filter((l) => !/^README(\.en)?\.md$/.test(l)).sort();

test('README.md and README.en.md have the same sections and links', () => {
  const zh = read('README.md');
  const en = read('README.en.md');
  assert.equal(sections(zh), sections(en));
  assert.deepEqual(links(zh), links(en));
});

test('both READMEs link the website and say L1 is in development', () => {
  assert.ok(read('README.md').includes('https://xiongcp.github.io/short-video-skill/'));
  assert.ok(read('README.md').includes('开发中'));
  assert.ok(read('README.en.md').includes('In development'));
});

test('both READMEs introduce the host 小青 with the cheatsheet and no longer name 晴', () => {
  for (const name of ['README.md', 'README.en.md']) {
    const text = read(name);
    assert.ok(text.includes('小青'), name);
    assert.ok(text.includes('](site/assets/host-cheatsheet.png)'), name);
    assert.ok(!text.includes('晴'), name);
  }
});

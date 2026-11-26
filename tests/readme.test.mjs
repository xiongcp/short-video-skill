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

test('both READMEs link the website and describe L1 local rendering with L0 fallback', () => {
  assert.ok(read('README.md').includes('https://xiongcp.github.io/short-video-skill/'));
  assert.ok(read('README.md').includes('L1 本地成片'));
  assert.ok(read('README.en.md').includes('L1 local render'));
});

test('both READMEs introduce the host 小青 with the cheatsheet and no longer name 晴', () => {
  for (const name of ['README.md', 'README.en.md']) {
    const text = read(name);
    assert.ok(text.includes('小青'), name);
    assert.ok(text.includes('](site/assets/host-cheatsheet.png)'), name);
    assert.ok(!text.includes('晴'), name);
  }
});

test('both READMEs say the voice has 8 male and female presets to audition', () => {
  assert.ok(read('README.md').includes('男女声 8 个人设，可以先试听'));
  assert.ok(read('README.en.md').includes('8 male and female voice presets you can audition first'));
});

test('both READMEs give 小青 the 呆毛 and the H counts', () => {
  assert.ok(read('README.md').includes('呆毛'));
  assert.ok(read('README.md').includes('17 个动作、9 种表情、6 件道具和 4 套服装'));
  assert.ok(read('README.en.md').includes('cowlick'));
  assert.ok(read('README.en.md').includes('17 gestures, 9 expressions, 6 props and 4 outfits'));
});

test('both READMEs describe style packs, hand-drawn scenes, 60 built-in props and stage layout', () => {
  const zh = read('README.md');
  const en = read('README.en.md');
  assert.ok(zh.includes('风格包') && zh.includes('手绘场景') && zh.includes('`stage`') && zh.includes('60'));
  assert.ok(en.includes('style packs') && en.includes('hand-drawn scenes') && en.includes('`stage`') && en.includes('60'));
});

test('both READMEs describe stage interactions, state/send and link the upgraded example prompt pack', () => {
  const zh = read('README.md');
  const en = read('README.en.md');
  assert.ok(zh.includes('提示词包.md') && zh.includes('同台互动') && zh.includes('`state`') && zh.includes('`send`'));
  assert.ok(en.includes('提示词包.md') && en.includes('stage interactions') && en.includes('`state`') && en.includes('`send`'));
});

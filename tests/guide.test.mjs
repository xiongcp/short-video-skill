import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const read = (f) => readFileSync(join(import.meta.dirname, '../docs/guide', f), 'utf8');

test('the install guide covers all three agents, L1 dependencies per OS, verification, upgrades and privacy', () => {
  const g = read('安装部署.md');
  for (const w of ['agy', 'Claude Code', 'Codex', '~/.claude/skills/', '.agents/skills/', 'npm install --prefix', 'brew install ffmpeg', 'apt-get install -y ffmpeg', 'winget', 'fonts-noto-cjk', 'doctor.mjs', 'l1_ready', 'tts_ready', '升级', '卸载', '需要联网']) assert.ok(g.includes(w), w);
});

test('the usage guide starts from one sentence and explains outputs, QA, revisions, portrait and L0', () => {
  const g = read('使用指南.md');
  for (const w of ['一句话', 'final.mp4', 'qa.md', 'not_checked', '返修', '--ratio 9:16', '--audition', '提示词包', '未审核初稿']) assert.ok(g.includes(w), w);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSubtitlesAss } from '../skills/topic-to-video/scripts/lib/encode.mjs';
import { FRAMES } from '../skills/topic-to-video/scripts/lib/frame.mjs';
import { buildShotPlans, evaluateFrame } from '../skills/topic-to-video/scripts/lib/scene.mjs';
import { buildTimeline } from '../skills/topic-to-video/scripts/lib/timebase.mjs';
import { subtitlePages } from '../skills/topic-to-video/scripts/lib/timing.mjs';
import { fakeTiming, goldenCases, manifest } from './helpers/golden.mjs';

const len = (s) => [...s].length;

test('subtitlePages packs clauses into pages of at most two 12-character lines', () => {
  assert.deepEqual(subtitlePages('你昨天见过的这张图标，今天再打开，还要从头下载吗？'), [['你昨天见过的这张图标', '今天再打开'], ['还要从头下载吗？']]);
  assert.deepEqual(subtitlePages('一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十。'), [['一二三四五六七八九十一', '二三四五六七八九十一二'], ['三四五六七八九十。']]);
  assert.deepEqual(subtitlePages('短句。'), [['短句。']]);
});

test('subtitlePages never splits a Latin word or a digit run', () => {
  const pages = subtitlePages('我们把热点数据放进Redis缓存里面然后返回304给浏览器。');
  const lines = pages.flat();
  assert.ok(lines.some((l) => l.includes('Redis')));
  assert.ok(lines.some((l) => l.includes('304')));
  for (const l of lines) assert.ok(len(l) <= 12, l);
});

test('every narration sentence in the fixtures fits the portrait page limits', () => {
  for (const p of Object.values(goldenCases())) {
    for (const sec of p.sections) {
      for (const page of subtitlePages(sec.text)) {
        assert.ok(page.length <= 2);
        for (const line of page) assert.ok(len(line) <= 12, line);
      }
    }
  }
});

test('portrait frames show one or two subtitle lines centred on x 540 around y 1330', () => {
  const p = goldenCases()['cache-speed'];
  const plans = buildShotPlans(p, buildTimeline(p, fakeTiming(p), 60), manifest, { frame: FRAMES['9:16'] });
  let seenTwo = false;
  for (const plan of plans) {
    for (let t = 0.1; t < plan.durationSec; t += 0.4) {
      const subs = evaluateFrame(manifest, plan, t).textItems.filter((ti) => ti.key.startsWith('sub-'));
      assert.ok(subs.length <= 2);
      if (subs.length === 2) {
        seenTwo = true;
        assert.deepEqual(subs.map((s) => s.y), [1290, 1370]);
      }
      if (subs.length === 1) assert.equal(subs[0].y, 1330);
      for (const s of subs) assert.equal(s.x, 540);
    }
  }
  assert.ok(seenTwo, 'some page has two lines');
});

test('portrait ASS uses a 1080×1920 canvas, 60 px and 170 px side margins', () => {
  const p = goldenCases()['cache-speed'];
  const ass = buildSubtitlesAss(p, buildTimeline(p, fakeTiming(p), 60), FRAMES['9:16']);
  assert.match(ass, /PlayResX: 1080\nPlayResY: 1920/);
  assert.match(ass, /Style: Default,Hiragino Sans GB,60,.*,2,170,170,520,1/);
  for (const line of ass.split('\n').filter((l) => l.startsWith('Dialogue:'))) {
    const text = line.split(',').slice(9).join(',').replace(/\{[^}]*\}/g, '');
    for (const part of text.split('\\N')) assert.ok(len(part) <= 12, part);
  }
});

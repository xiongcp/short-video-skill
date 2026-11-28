import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSubtitlesAss } from '../skills/topic-to-video/scripts/lib/encode.mjs';
import { FRAMES } from '../skills/topic-to-video/scripts/lib/frame.mjs';
import { captionKeywords } from '../skills/topic-to-video/scripts/lib/match.mjs';
import { buildShotPlans, evaluateFrame, shotCacheKey } from '../skills/topic-to-video/scripts/lib/scene.mjs';
import { buildTimeline } from '../skills/topic-to-video/scripts/lib/timebase.mjs';
import { captionPages } from '../skills/topic-to-video/scripts/lib/timing.mjs';
import { fakeTiming, goldenCases, manifest } from './helpers/golden.mjs';

const PORTRAIT = { maxChars: 12, maxLines: 2 };

test('captionPages turns a page when its first word is spoken and keeps the last page 120 ms past the sentence', () => {
  const text = '国内算力需求还在，订单自然流向国产芯片和设备。';
  // Estimated words: 订 starts after 8.6 of 21.6 weights of a 50–3900 ms speech span.
  assert.deepEqual(captionPages({ text, durationMs: 4000, speech: [50, 3900], words: [] }, { ...PORTRAIT, keywords: ['流向', '国产'] }), [
    { lines: ['国内算力需求还在'], startMs: 0, endMs: 1583 },
    { lines: ['订单自然流向', '国产芯片和设备。'], startMs: 1583, endMs: 4120 },
  ]);
  const words = [{ text: '国内算力需求还在', start_ms: 50, end_ms: 1400 }, { text: '订单自然流向国产芯片和设备', start_ms: 2222, end_ms: 3900 }];
  assert.deepEqual(captionPages({ text, durationMs: 4000, speech: [50, 3900], words }, PORTRAIT).map((pg) => pg.startMs), [0, 2222]);
});

test('landscape captions switch clauses by word time, and a short sentence with a comma stays whole (Review Focus 4)', () => {
  assert.deepEqual(captionPages({ text: '你昨天见过的这张图标，今天再打开，还要从头下载吗？', durationMs: 4000, speech: [50, 3900], words: [] }), [
    { lines: ['你昨天见过的这张图标'], startMs: 0, endMs: 1809 },
    { lines: ['今天再打开'], startMs: 1809, endMs: 2738 },
    { lines: ['还要从头下载吗？'], startMs: 2738, endMs: 4120 },
  ]);
  assert.deepEqual(captionPages({ text: '你好，世界。', durationMs: 1000, speech: [0, 1000], words: [] }), [{ lines: ['你好，世界。'], startMs: 0, endMs: 1120 }]);
});

test('captionKeywords keeps 2–6 character cue anchors, visual keywords and pronunciation terms', () => {
  const project = { sections: [{ id: 's01', text: '', pronunciation: [{ term: '科创50', reading: '科创五零' }, { term: 'A', reading: '诶' }] }] };
  const shot = {
    section: 's01',
    cues: [{ sentence: 0, do: 'reveal', target: 0, at: '国常会' }, { sentence: 0, do: 'reveal', target: 1, at: '一个很长很长的关键词' }],
    visual: { template: 'stage', data: { heading: '三股力量', objects: [{ prop: 'box', label: '国家队' }, { prop: 'box', label: '国常会' }] } },
  };
  assert.deepEqual(captionKeywords(project, shot), ['国常会', '三股力量', '国家队', '科创50']);
});

const assMs = (s) => {
  const [h, m, sec] = s.split(':');
  return ((Number(h) * 60 + Number(m)) * 60 + Number(sec)) * 1000;
};

test('burned-in subtitles and captions.ass show the same pages at the same times in both orientations', () => {
  const p = goldenCases()['cache-speed'];
  for (const frame of [FRAMES['16:9'], FRAMES['9:16']]) {
    const timeline = buildTimeline(p, fakeTiming(p), 60);
    const plans = buildShotPlans(p, timeline, manifest, { frame });
    const dialogues = buildSubtitlesAss(p, timeline, frame).split('\n').filter((l) => l.startsWith('Dialogue:'));
    assert.ok(dialogues.length >= 20, `${frame.ratio}: ${dialogues.length} dialogues`); // cache-speed has 21 sentences
    for (const line of dialogues) {
      const [, start, end] = line.split(',');
      const text = line.split(',').slice(9).join(',').replace(/\{[^}]*\}/g, '');
      const mid = (assMs(start) + assMs(end)) / 2;
      const k = timeline.shots.findIndex((s) => mid >= s.startMs && mid < s.endMs);
      const shown = evaluateFrame(manifest, plans[k], (mid - timeline.shots[k].startMs) / 1000).textItems
        .filter((ti) => ti.key.startsWith('sub-')).sort((a, b) => a.y - b.y).map((ti) => ti.text).join('\\N');
      assert.equal(shown, text, `${frame.ratio} ${start}`);
    }
  }
});

test('a caption change alone gives the shot a new cache key', () => {
  const p = goldenCases().minimal;
  const before = buildShotPlans(p, buildTimeline(p, fakeTiming(p), 60), manifest)[1];
  p.sections[0].text = '天空为什么是蓝的？答案就藏在阳光里，慢慢看。';
  const after = buildShotPlans(p, buildTimeline(p, fakeTiming(p), 60), manifest)[1];
  assert.deepEqual(after.audioHashes, before.audioHashes, 'same audio');
  assert.notEqual(shotCacheKey(after), shotCacheKey(before));
});

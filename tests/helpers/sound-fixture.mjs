// Shared three-shot project for the sound and music tests: host-left with reveal/highlight, a stage shot with
// a walk, open, stamp, send and jump, then the last section's full shot (音效与配乐设计 §4).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildShotPlans } from '../../skills/topic-to-video/scripts/lib/scene.mjs';
import { buildTimeline } from '../../skills/topic-to-video/scripts/lib/timebase.mjs';

export const manifest = JSON.parse(readFileSync(join(import.meta.dirname, '../../skills/topic-to-video/assets/host/manifest.json'), 'utf8'));
export const FPS = 60;

/** `gapMs: 0` shrinks the last shot to 50 ms. */
export function soundFixture({ gapMs } = {}) {
  const p = JSON.parse(readFileSync(join(import.meta.dirname, '../fixtures/minimal-project.json'), 'utf8'));
  p.world = { metaphor: '缓存是冰箱', style: 'paper', scene: 'kitchen' };
  if (gapMs !== undefined) p.settings.sentence_gap_ms = gapMs;
  p.sections = [
    { id: 's01', title: '开场', text: '冰箱里有什么？我们打开看看。' },
    { id: 's02', title: '结论', text: '这就是缓存。' },
  ];
  p.shots = [
    { id: 'sh01', section: 's01', sentences: [0], layout: 'host-left', host: { expr: 'curious', gesture: 'idle' },
      visual: { template: 'bullets', data: { items: ['冰箱', '超市', '电话'] } },
      cues: [{ sentence: 0, do: 'reveal', target: 1 }, { sentence: 0, do: 'highlight', target: 0 }], note: '开场' },
    { id: 'sh02', section: 's01', sentences: [1], layout: 'stage', host: { expr: 'happy', gesture: 'idle', at: 'left' },
      visual: { template: 'stage', data: { objects: [{ prop: 'fridge', label: '缓存', at: 'center', state: 'closed' }, { prop: 'box', label: '旧货', at: 'right' }], links: [{ from: 1, to: 0 }] } },
      cues: [
        { sentence: 1, do: 'open', target: 0 },
        { sentence: 1, do: 'state', target: 1, value: 'stamped' },
        { sentence: 1, do: 'send', target: 0, value: 'package' },
        { sentence: 1, do: 'gesture', target: 'jump' },
      ], note: '开冰箱' },
    { id: 'sh03', section: 's02', sentences: [0], layout: 'full',
      visual: { template: 'bullets', data: { items: ['缓存'] } }, cues: [{ sentence: 0, do: 'reveal', target: 0 }], note: '结论' },
  ];
  const timing = {};
  for (const key of ['s01-0', 's01-1', 's02-0']) timing[key] = { duration_ms: 2000, speech: [50, 1900], source: 'estimate', words: [] };
  timing['s01-1'] = { duration_ms: 5000, speech: [50, 4900], source: 'estimate', words: [] };
  if (gapMs === 0) timing['s02-0'] = { duration_ms: 50, speech: [0, 50], source: 'estimate', words: [] };
  const tl = buildTimeline(p, timing, FPS);
  return { project: p, plans: buildShotPlans(p, tl, manifest) };
}


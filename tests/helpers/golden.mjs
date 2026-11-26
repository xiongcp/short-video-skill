// Golden 16:9 frames (竖屏设计 §8.1): hashes of evaluateFrame output and the ASS file, recorded before the portrait
// refactor, so every later task can prove landscape output did not change.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { splitSentences } from '../../skills/topic-to-video/scripts/lib/captions.mjs';
import { buildSubtitlesAss } from '../../skills/topic-to-video/scripts/lib/encode.mjs';
import { buildShotPlans, evaluateFrame } from '../../skills/topic-to-video/scripts/lib/scene.mjs';
import { buildTimeline } from '../../skills/topic-to-video/scripts/lib/timebase.mjs';

const root = join(import.meta.dirname, '../..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

export const manifest = readJson('skills/topic-to-video/assets/host/manifest.json');

export function fakeTiming(project, ms = 2600) {
  const timing = {};
  for (const sec of project.sections) {
    splitSentences(sec.text).forEach((_, i) => {
      const key = `${sec.id}-${i}`;
      timing[key] = { file: `audio/${key}.wav`, duration_ms: ms, speech: [60, ms - 120], source: 'estimate', words: [], sha256: key };
    });
  }
  return timing;
}

const SCENES = ['blank', 'podium', 'lab', 'office', 'workshop', 'outdoor', 'street', 'kitchen'];
const EXTRA_SHOTS = [
  { layout: 'full', visual: { template: 'compare', data: { left: { label: '没变', rows: ['返回304', '继续用旧内容'] }, right: { label: '已更新', rows: ['传回新正文'] } } } },
  { layout: 'host-left', visual: { template: 'number', data: { value: '304', label: '状态码' } } },
  { layout: 'host-left', visual: { template: 'flow', data: { nodes: ['问', '答', '用'] } } },
  { layout: 'full', visual: { template: 'timeline', data: { items: [{ time: '第一天', label: '下载' }, { time: '第二天', label: '复用' }, { time: '第三天', label: '过期' }] } } },
  { layout: 'host-left', visual: { template: 'cycle', data: { items: [{ label: '请求' }, { label: '缓存' }, { label: '复用' }] } } },
  { layout: 'full', visual: { template: 'bars', data: { items: [{ label: '首次', value: 800 }, { label: '再次', value: 5 }], unit: '毫秒' } } },
  { layout: 'host-left', visual: { template: 'bullets', data: { items: ['新鲜直接拿', '过期先问', '没变就用'] } } },
  { layout: 'full', visual: { template: 'title', data: { heading: '缓存三招', sub: '记住就够' } } },
];

/** A synthetic project covering every scene, every template and every layout (stage, host-left, full). */
export function sceneTour() {
  const n = SCENES.length + EXTRA_SHOTS.length;
  const text = Array.from({ length: n }, (_, i) => `第${i + 1}句讲一件事。`).join('');
  const shots = [
    ...SCENES.map((scene, i) => ({
      id: `sh${String(i + 1).padStart(2, '0')}`, section: 's01', sentences: [i], layout: 'stage', scene,
      host: { expr: 'explaining', gesture: 'point', at: 'left' },
      visual: { template: 'stage', data: { heading: '场景', objects: [{ prop: 'box', label: '箱子', at: 'mid-left' }, { prop: 'lock', label: '锁', at: 'right' }], links: [{ from: 0, to: 1, style: 'dashed', label: '很远' }] } },
      cues: [{ sentence: i, do: 'move', target: 0 }],
      note: `场景 ${scene}`,
    })),
    ...EXTRA_SHOTS.map((s, k) => {
      const i = SCENES.length + k;
      return {
        id: `sh${String(i + 1).padStart(2, '0')}`, section: 's01', sentences: [i], ...s,
        ...(s.layout === 'host-left' ? { host: { expr: 'curious', gesture: 'idle' } } : {}),
        cues: s.visual.template === 'title' ? [] : [{ sentence: i, do: 'reveal', target: 1 }],
        note: s.visual.template,
      };
    }),
  ];
  return {
    version: 1, revision: 1, title: '场景巡游',
    brief: { topic: '测试', audience: '测试', promise: '测试', sources: [], open_questions: [] },
    settings: { ratio: '16:9', target_seconds: 60, lang: 'zh-CN', host: 'xiaoqing', theme: 'light' },
    voice: { provider: 'undecided' },
    world: { metaphor: '测试', style: 'paper', scene: 'blank' },
    sections: [{ id: 's01', title: '巡游', text }],
    shots, checkpoints: [], jobs: [],
  };
}

export function goldenCases() {
  return {
    'cache-speed': readJson('examples/cache-speed/project.json'),
    'world-flight': readJson('tests/fixtures/world-flight.json'),
    'world-cache': readJson('tests/fixtures/world-cache.json'),
    minimal: readJson('tests/fixtures/minimal-project.json'),
    'scene-tour': sceneTour(),
  };
}

/** Three moments per shot (start of the transition, middle, end) plus the ASS file. `opts` is passed to buildShotPlans. */
export function digestProject(project, opts) {
  const timeline = buildTimeline(project, fakeTiming(project), 60);
  const plans = opts ? buildShotPlans(project, timeline, manifest, opts) : buildShotPlans(project, timeline, manifest);
  const out = { ass: hash(buildSubtitlesAss(project, timeline)) };
  for (const plan of plans) {
    for (const t of [0.05, plan.durationSec / 2, Math.max(0.05, plan.durationSec - 0.05)]) {
      const f = evaluateFrame(manifest, plan, t);
      out[`${plan.id}@${t.toFixed(3)}`] = hash(f.vectorSvg + JSON.stringify(f.textItems));
    }
  }
  return out;
}

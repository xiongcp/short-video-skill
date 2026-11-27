import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRAMES } from '../skills/topic-to-video/scripts/lib/frame.mjs';
import { buildShotPlans, evaluateFrame } from '../skills/topic-to-video/scripts/lib/scene.mjs';
import { buildTimeline } from '../skills/topic-to-video/scripts/lib/timebase.mjs';
import { fakeTiming, goldenCases, manifest } from './helpers/golden.mjs';

const plansOf = (p, opts) => buildShotPlans(p, buildTimeline(p, fakeTiming(p), 60), manifest, opts);
const shownTexts = (f) => f.textItems.filter((it) => (it.opacity ?? 1) > 0.02 && it.text && !it.key?.startsWith('sub-') && it.key !== 'draft-badge');
const kindOf = ({ transition: tr }) => (tr.kind === 'crossfade' ? 'crossfade'
  : /full/.test(tr.layoutSwitch ?? '') && /stage/.test(tr.layoutSwitch ?? '') ? 'full<->stage'
    : tr.shared.length ? 'morph-shared' : 'morph');

// Frames of a transition where text only the old shot had and text only the new shot has are both visible (§5.4).
function overlaps(plans) {
  const bad = [];
  for (let i = 1; i < plans.length; i += 1) {
    const plan = plans[i];
    const prev = plans[i - 1];
    const tr = plan.transition;
    if (tr.kind === 'cut') continue;
    const before = new Set(shownTexts(evaluateFrame(manifest, prev, prev.durationSec - 1 / 60)).map((it) => it.text));
    const after = [...new Set(shownTexts(evaluateFrame(manifest, plan, Math.min(plan.durationSec - 1 / 60, tr.durationSec + 2))).map((it) => it.text))];
    for (let f = 0; f / 60 < tr.durationSec; f += 1) {
      const shown = shownTexts(evaluateFrame(manifest, plan, f / 60));
      const old = shown.find((it) => before.has(it.text) && !after.includes(it.text));
      // A title typed in letter by letter shows a prefix of its final text.
      const fresh = shown.find((it) => !before.has(it.text) && after.some((x) => x.startsWith(it.text)));
      if (old && fresh) bad.push(`${plan.id}@${f}: ${old.text} + ${fresh.text}`);
    }
  }
  return bad;
}

// The minimal fixture with both shots full and nothing in common: a crossfade.
function crossfadeProject() {
  const p = goldenCases().minimal;
  p.shots[0].layout = 'full';
  delete p.shots[0].host;
  return p;
}

test('no transition frame shows old and new text together (字幕与转场设计 §5.4)', () => {
  const kinds = new Set();
  for (const [name, p] of Object.entries({ ...goldenCases(), crossfade: crossfadeProject() })) {
    const plans = plansOf(p);
    plans.slice(1).filter((pl) => pl.transition.kind !== 'cut').forEach((pl) => kinds.add(kindOf(pl)));
    assert.deepEqual(overlaps(plans).slice(0, 3), [], name);
  }
  assert.deepEqual(overlaps(plansOf(goldenCases()['cache-speed'], { frame: FRAMES['9:16'] })).slice(0, 3), [], 'cache-speed 9:16');
  assert.deepEqual([...kinds].sort(), ['crossfade', 'full<->stage', 'morph', 'morph-shared']);
});

test('a crossfade lasts 0.4 s', () => {
  const [, second] = plansOf(crossfadeProject());
  assert.equal(second.transition.kind, 'crossfade');
  assert.equal(second.transition.durationSec, 0.4);
});

const sceneLayers = (svg) => [...svg.matchAll(/(?:<g opacity="([\d.]+)">)?<g data-scene="([\w-]+)"/g)].map((m) => [m[2], Number(m[1] ?? 1)]);

test('the scene background leaves with the old shot and enters with the new one (字幕与转场设计 §5.2)', () => {
  const plans = plansOf(goldenCases()['cache-speed']);
  const stage = (s) => s.shot.layout === 'stage';
  const find = (pred) => plans.find((pl) => pl.prevShot && pl.transition.kind !== 'cut' && pred(pl.prevShot, pl));
  const at = (pl, u) => sceneLayers(evaluateFrame(manifest, pl, u * pl.transition.durationSec).vectorSvg);
  const fading = (layers, name) => layers.length === 1 && layers[0][0] === name && layers[0][1] > 0.05 && layers[0][1] < 0.95;

  const change = find((a, b) => stage(a) && stage(b) && a.scene !== b.scene);
  assert.ok(fading(at(change, 0.2), change.prevShot.scene), JSON.stringify(at(change, 0.2)));
  assert.deepEqual(at(change, 0.45), []);
  assert.ok(fading(at(change, 0.7), change.scene), JSON.stringify(at(change, 0.7)));
  assert.deepEqual(at(change, 1.2), [[change.scene, 1]]);

  const same = find((a, b) => stage(a) && stage(b) && a.scene === b.scene);
  for (const u of [0.2, 0.45, 0.7]) assert.deepEqual(at(same, u), [[same.scene, 1]]);

  const enter = find((a, b) => a.shot.layout === 'full' && stage(b));
  assert.deepEqual(at(enter, 0.2), []);
  assert.ok(fading(at(enter, 0.7), enter.scene), JSON.stringify(at(enter, 0.7)));

  const leave = find((a, b) => stage(a) && b.shot.layout === 'full');
  assert.ok(fading(at(leave, 0.2), leave.prevShot.scene), JSON.stringify(at(leave, 0.2)));
  assert.deepEqual(at(leave, 0.7), []);
});

test('a host-left morph with no shared elements clears the old diagram, then brings in the new one', () => {
  const p = goldenCases().minimal;
  p.shots[1].layout = 'host-left';
  p.shots[1].host = { expr: 'explaining', gesture: 'point' };
  p.shots[1].cues = [];
  const [, second] = plansOf(p);
  const d = second.transition.durationSec;
  const shown = (u) => shownTexts(evaluateFrame(manifest, second, u * d)).map((it) => it.text);
  assert.ok(shown(0.2).includes('天空为什么是蓝的') && !shown(0.2).includes('阳光'), shown(0.2).join('、'));
  assert.ok(shown(0.7).includes('阳光') && !shown(0.7).includes('天空为什么是蓝的'), shown(0.7).join('、'));
});

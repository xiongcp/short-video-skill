import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loudestWindowRms, SAMPLE_RATE, SFX_DURATION_MS, SFX_KINDS, synthSfx } from '../skills/topic-to-video/scripts/lib/sound.mjs';

test('there are 17 effects plus the conclusion chime', () => {
  assert.equal(SFX_KINDS.length, 18);
  assert.ok(SFX_KINDS.includes('chime') && SFX_KINDS.includes('rise'));
});

for (const kind of SFX_KINDS) {
  test(`${kind} is deterministic, bounded, DC-free and fades out`, () => {
    const a = synthSfx(kind, { seed: 'sh01:3' });
    const b = synthSfx(kind, { seed: 'sh01:3' });
    assert.deepEqual(a, b);
    assert.equal(a.length, Math.round((SFX_DURATION_MS[kind] * SAMPLE_RATE) / 1000));
    let peak = 0;
    let sum = 0;
    for (const v of a) {
      assert.ok(Number.isFinite(v));
      peak = Math.max(peak, Math.abs(v));
      sum += v;
    }
    assert.ok(peak <= 0.99 && peak > 0.1, `peak ${peak}`);
    assert.ok(Math.abs(sum / a.length) < 1e-3, 'DC');
    assert.equal(a[a.length - 1], 0);
    const lastMs = a.subarray(a.length - 48);
    assert.ok(Math.max(...lastMs.map(Math.abs)) <= 0.04, 'faded tail, no click');
    assert.ok(loudestWindowRms(a) > 0);
  });
}

test('different seeds vary pitch a little but not the length', () => {
  const a = synthSfx('ding', { seed: 'a' });
  const b = synthSfx('ding', { seed: 'b' });
  assert.equal(a.length, b.length);
  assert.notDeepEqual(a, b);
  assert.deepEqual(synthSfx('ding', { seed: 'a', variation: false }), synthSfx('ding', { seed: 'b', variation: false }));
});

// Events (音效与配乐设计 §4.1–4.2)
import { hostPlanForShot } from '../skills/topic-to-video/scripts/lib/scene.mjs';
import { FPS, manifest, soundFixture } from './helpers/sound-fixture.mjs';
import { hostEventTimeline } from '../skills/topic-to-video/scripts/lib/motion.mjs';
import { collectSoundEvents, thinSoundEvents } from '../skills/topic-to-video/scripts/lib/sound.mjs';

const offsetMs = (plans, i) => (plans.slice(0, i).reduce((s, pl) => s + pl.frameCount, 0) * 1000) / FPS;
const near = (events, kind, tMs, tol = 1) => events.find((e) => e.kind === kind && Math.abs(e.tMs - tMs) <= tol);
const cueIdx = (plan, d) => plan.cues.findIndex((c) => c.do === d);
const cueStart = (plan, idx) => plan.endHostMeta?.interactionStarts?.get(idx) ?? plan.cues[idx].timeMs / 1000;

test('hostEventTimeline exposes walks, interactions and one-shot gestures', () => {
  const { plans } = soundFixture();
  const tl = hostEventTimeline(manifest, hostPlanForShot(plans[1]));
  assert.ok(tl.walks.length >= 1);
  assert.ok(tl.interactions.some((e) => e.kind === 'open'));
  assert.ok(tl.gestures.some((g) => g.gesture === 'jump'));
});

test('collectSoundEvents places effects at contact moments across shots', () => {
  const { project, plans } = soundFixture();
  const ev = collectSoundEvents(plans, manifest, { fps: FPS, lastSectionId: 's02' });
  const [p0, p1] = plans;
  const reveal = p0.cues.find((c) => c.do === 'reveal');
  assert.ok(near(ev, 'pop', reveal.timeMs + 50), 'reveal pop');
  assert.ok(near(ev, 'swish', p0.cues.find((c) => c.do === 'highlight').timeMs), 'highlight swish');
  const o1 = offsetMs(plans, 1);
  const walk = hostEventTimeline(manifest, hostPlanForShot(p1)).walks[0];
  assert.ok(ev.filter((e) => e.kind === 'step' && e.tMs >= o1 + walk.t0 * 1000 && e.tMs <= o1 + walk.t1 * 1000 + 1).length >= 2, 'steps');
  assert.ok(near(ev, 'click', o1 + (cueStart(p1, cueIdx(p1, 'open')) + 0.15) * 1000), 'open click');
  const stamp = near(ev, 'thump', o1 + (cueStart(p1, cueIdx(p1, 'state')) + 0.12) * 1000);
  assert.equal(stamp?.tier, 'accent');
  const sendT = o1 + cueStart(p1, cueIdx(p1, 'send')) * 1000;
  assert.ok(near(ev, 'whoosh', sendT) && near(ev, 'pop', sendT + 800), 'send');
  const jump = hostEventTimeline(manifest, hostPlanForShot(p1)).gestures.find((g) => g.gesture === 'jump');
  assert.equal(near(ev, 'rise', o1 + (jump.t0 + 0.15) * 1000)?.tier, 'accent');
  assert.equal(near(ev, 'thump', o1 + (jump.t0 + 0.5) * 1000)?.tier, 'normal');
  assert.ok(near(ev, 'page', o1), 'host-left -> stage is a page turn');
  const o2 = offsetMs(plans, 2);
  assert.ok(near(ev, 'whoosh', o2), 'stage -> full is a whoosh');
  assert.ok(near(ev, 'chime', o2 + 200), 'conclusion chime');
  assert.deepEqual(ev.map((e) => e.tMs), [...ev.map((e) => e.tMs)].sort((a, b) => a - b));
  assert.equal(project.sections.at(-1).id, 's02');
});

test('collectSoundEvents on a sample starts at the first selected shot and skips its transition', () => {
  const { plans } = soundFixture();
  const ev = collectSoundEvents(plans.slice(1), manifest, { fps: FPS, lastSectionId: 's02' });
  assert.ok(!near(ev, 'page', 0), 'no transition on the first sampled shot');
  assert.ok(ev.every((e) => e.tMs >= 0));
  assert.ok(near(ev, 'chime', offsetMs(plans.slice(1), 1) + 200));
});

test('events past the end of their shot are dropped', () => {
  const { plans } = soundFixture({ gapMs: 0 });
  assert.ok(plans[2].durationSec < 0.2);
  const ev = collectSoundEvents(plans, manifest, { fps: FPS, lastSectionId: 's02' });
  assert.equal(ev.filter((e) => e.kind === 'chime').length, 0);
});

test('thinSoundEvents keeps at most two effects a second and guards steps', () => {
  const e = (tMs, tier, kind) => ({ tMs, tier, kind, x: null, source: 't' });
  assert.deepEqual(thinSoundEvents([e(0, 'normal', 'pop'), e(300, 'accent', 'sparkle'), e(900, 'normal', 'ding')]).map((x) => x.kind), ['sparkle', 'ding']);
  assert.deepEqual(thinSoundEvents([e(0, 'normal', 'pop'), e(300, 'normal', 'swish')]).map((x) => x.kind), ['pop']);
  assert.deepEqual(thinSoundEvents([e(60, 'step', 'step'), e(100, 'normal', 'pop')]).map((x) => x.kind), ['pop']);
  assert.deepEqual(thinSoundEvents([e(0, 'step', 'step'), e(250, 'step', 'step')]).map((x) => x.tMs), [0, 250]);
});

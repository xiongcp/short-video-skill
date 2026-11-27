import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRAMES } from '../skills/topic-to-video/scripts/lib/frame.mjs';
import { buildShotPlans, evaluateFrame } from '../skills/topic-to-video/scripts/lib/scene.mjs';
import { buildTimeline } from '../skills/topic-to-video/scripts/lib/timebase.mjs';
import { digestProject, fakeTiming, manifest, sceneTour } from './helpers/golden.mjs';

const portraitPlans = (p) => buildShotPlans(p, buildTimeline(p, fakeTiming(p), 60), manifest, { frame: FRAMES['9:16'] });

test('buildShotPlans attaches the frame; 9:16 projects default to the portrait frame', () => {
  const p = sceneTour();
  assert.ok(portraitPlans(p).every((pl) => pl.frame.ratio === '9:16'));
  p.settings.ratio = '9:16';
  assert.ok(buildShotPlans(p, buildTimeline(p, fakeTiming(p), 60), manifest).every((pl) => pl.frame.ratio === '9:16'));
});

test('portrait frames are 1080×1920 with the host on ground 1180 and the camera centred on (540, 960)', () => {
  const plans = portraitPlans(sceneTour());
  const stage = plans.find((pl) => pl.shot.layout === 'stage');
  const f = evaluateFrame(manifest, stage, stage.durationSec - 0.05);
  assert.ok(f.vectorSvg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">'));
  assert.ok(f.vectorSvg.includes('translate(540 960)'));
  assert.ok(Math.abs(f.hostMeta.bodyBbox.y + f.hostMeta.bodyBbox.h - 1180) < 1);
});

test('host-left starts from the portrait home x and diagram text stays in the portrait zone', () => {
  const plans = portraitPlans(sceneTour());
  const hl = plans.find((pl) => pl.shot.layout === 'host-left' && pl.shot.visual.template === 'number');
  assert.equal(hl.startState.x, 200);
  for (const el of hl.elements) {
    const z = FRAMES['9:16'].zones['host-left'];
    assert.ok(el.bbox.x >= z.x - 1e-6 && el.bbox.x + el.bbox.w <= z.x + z.w + 1e-6);
  }
});

test('layout switches trot from off-screen and interpolate between the portrait zones', () => {
  const plans = portraitPlans(sceneTour());
  const i = plans.findIndex((pl, k) => k > 0 && pl.shot.layout === 'host-left' && plans[k - 1].shot.layout === 'full');
  assert.ok(i > 0, 'tour has full -> host-left');
  const f = evaluateFrame(manifest, plans[i], 0.05);
  assert.ok(f.isFastMotion);
  assert.ok(f.vectorSvg.includes('data-host="xiaoqing"'));
  const out = plans.findIndex((pl, k) => k > 0 && pl.shot.layout === 'full' && plans[k - 1].shot.layout !== 'full');
  const g = evaluateFrame(manifest, plans[out], 0.1);
  assert.ok(g.vectorSvg.includes('data-host="xiaoqing"'), 'trots out');
  for (const ti of g.textItems) assert.ok(ti.x < 1080 + 400, `text ${ti.key} not at landscape x ${ti.x}`);
});

test('portrait subtitles are centred at x 540 in 60 px', () => {
  const plans = portraitPlans(sceneTour());
  const f = evaluateFrame(manifest, plans[0], plans[0].durationSec / 2);
  const sub = f.textItems.find((t) => t.key.startsWith('sub-'));
  assert.deepEqual([sub.x, sub.fontSize], [540, 60]);
});

test('passing the 16:9 frame explicitly gives the same digest as the default', () => {
  const p = sceneTour();
  assert.deepEqual(digestProject(p, { frame: FRAMES['16:9'] }), digestProject(p));
});

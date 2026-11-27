import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { isDraft } from '../skills/topic-to-video/scripts/lib/project.mjs';
import { buildShotPlans, evaluateFrame, portraitLayoutIssues, shotCacheKey } from '../skills/topic-to-video/scripts/lib/scene.mjs';
import { buildTimeline } from '../skills/topic-to-video/scripts/lib/timebase.mjs';
import { fakeTiming, manifest } from './helpers/golden.mjs';

const example = () => JSON.parse(readFileSync(join(import.meta.dirname, '../examples/cache-speed/project.json'), 'utf8'));

test('isDraft is true without a plan confirmation for the current revision', () => {
  const p = example();
  assert.equal(isDraft(p), false);
  assert.equal(isDraft({ ...p, revision: 2 }), true);
  assert.equal(isDraft({ ...p, checkpoints: [] }), true);
});

test('a draft shot draws the badge and gets its own cache key; a confirmed one is unchanged', () => {
  const p = example();
  const plans = buildShotPlans(p, buildTimeline(p, fakeTiming(p), 60), manifest);
  const plain = plans[0];
  const draft = { ...plain, draft: true };
  const opts = { fps: 60, width: 1920, height: 1080, motionBlur: false, rigVersion: manifest.rig_version };
  assert.notEqual(shotCacheKey(draft, opts), shotCacheKey(plain, opts));
  const f = evaluateFrame(manifest, draft, 1);
  assert.ok(f.textItems.some((i) => i.key === 'draft-badge' && i.text === '未审核初稿'));
  assert.match(f.vectorSvg, /data-badge="draft"/);
  const g = evaluateFrame(manifest, plain, 1);
  assert.ok(!g.textItems.some((i) => i.key === 'draft-badge'));
  assert.doesNotMatch(g.vectorSvg, /data-badge/);
});

test('the portrait safe-zone scan ignores the draft badge', () => {
  const p = { ...example(), settings: { ...example().settings, ratio: '9:16' } };
  const plans = buildShotPlans(p, buildTimeline(p, fakeTiming(p), 60), manifest).map((pl) => ({ ...pl, draft: true }));
  assert.ok(!portraitLayoutIssues(manifest, plans).some((i) => i.keys?.includes('draft-badge')));
});

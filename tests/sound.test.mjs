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

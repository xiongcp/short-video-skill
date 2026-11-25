import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { JOINTS } from '../skills/topic-to-video/scripts/lib/rig.mjs';

const SKILL = join(import.meta.dirname, '../skills/topic-to-video');
const HOST = join(SKILL, 'assets/host');
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
const manifest = json(join(HOST, 'manifest.json'));
const profile = json(join(HOST, 'profile.json'));
const schema = json(join(SKILL, 'schema/project.schema.json'));
const sorted = (xs) => [...xs].sort();

test('manifest has the 17 joints, and standing straight they add up to H', () => {
  assert.deepEqual(Object.keys(manifest.joints), JOINTS);
  const len = (...joints) => joints.reduce((sum, j) => sum + manifest.joints[j].length, 0);
  assert.ok(Math.abs(len('l_hip', 'l_knee', 'waist', 'chest', 'neck', 'head') - 1) < 1e-9, 'height');
  assert.ok(Math.abs(len('l_hip', 'l_knee', 'waist', 'chest') - 0.725) < 1e-9, 'shoulder height');
  assert.ok(Math.abs(len('l_shoulder', 'l_elbow', 'l_wrist') - 0.35) < 1e-9, 'arm length');
  for (const [name, j] of Object.entries(manifest.joints)) assert.ok(j.range[0] < j.range[1], name);
});

test('profile, manifest and schema list the same expressions, gestures and props', () => {
  assert.deepEqual(profile.expressions, schema.$defs.expr.enum);
  assert.deepEqual(profile.gestures, schema.$defs.gesture.enum);
  assert.deepEqual(profile.props, schema.$defs.prop.enum);
  assert.deepEqual(sorted(Object.keys(manifest.expressions)), sorted(profile.expressions));
  assert.deepEqual(sorted(Object.keys(manifest.poses)), sorted(profile.gestures));
  assert.deepEqual(sorted(Object.keys(manifest.props)), sorted(profile.props));
});

test('profile names the host and locks its look for external models', () => {
  assert.deepEqual([profile.id, profile.name, manifest.host, manifest.name], ['xiaoqing', '小青', 'xiaoqing', '小青']);
  assert.match(profile.prompt_lock.zh, /火柴人.*青色围巾/);
  assert.match(profile.prompt_lock.en, /stick-figure.*teal scarf/);
});

test('host folder stays within 1.2 MB and declares a usage state', () => {
  const total = readdirSync(HOST).reduce((sum, f) => sum + statSync(join(HOST, f)).size, 0);
  assert.ok(total <= 1.2 * 1024 * 1024, `host assets are ${total} bytes`);
  assert.ok(['pending', 'cleared'].includes(json(join(HOST, 'rights.json')).usage));
});

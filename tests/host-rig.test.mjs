import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SKILL = join(import.meta.dirname, '../skills/topic-to-video');
const HOST = join(SKILL, 'assets/host');
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
const profile = json(join(HOST, 'profile.json'));
const schema = json(join(SKILL, 'schema/project.schema.json'));

test('profile lists the expressions, gestures and props of the schema', () => {
  assert.deepEqual(profile.expressions, schema.$defs.expr.enum);
  assert.deepEqual(profile.gestures, schema.$defs.gesture.enum);
  assert.deepEqual(profile.props, schema.$defs.prop.enum);
});

test('profile names the host and locks its look for external models', () => {
  assert.deepEqual([profile.id, profile.name], ['xiaoqing', '小青']);
  assert.match(profile.prompt_lock.zh, /火柴人.*青色围巾/);
  assert.match(profile.prompt_lock.en, /stick-figure.*teal scarf/);
});

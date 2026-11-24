import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHARS_PER_SECOND, DEFAULT_SENTENCE_GAP_MS, MAX_SENTENCE_CHARS } from '../skills/topic-to-video/scripts/lib/project.mjs';

const SKILL = join(import.meta.dirname, '../skills/topic-to-video');
const ref = (name) => readFileSync(join(SKILL, 'references', name), 'utf8');
const schema = JSON.parse(readFileSync(join(SKILL, 'schema/project.schema.json'), 'utf8'));

test('script.md states the same planning constants as project.mjs', () => {
  const text = ref('script.md');
  assert.ok(text.includes(`每秒 ${CHARS_PER_SECOND} 个字`));
  assert.ok(text.includes(`${DEFAULT_SENTENCE_GAP_MS / 1000} 秒停顿`));
  assert.ok(text.includes(`每句不超过 ${MAX_SENTENCE_CHARS} 字`));
  assert.ok(text.includes('±10%'));
});

test('storyboard.md documents every template, expression and gesture in the schema', () => {
  const text = ref('storyboard.md');
  const templates = schema.$defs.visual.oneOf.map((v) => schema.$defs[v.$ref.split('/').at(-1)].properties.template.const);
  for (const name of [...templates, ...schema.$defs.expr.enum, ...schema.$defs.gesture.enum]) {
    assert.ok(text.includes(`\`${name}\``), name);
  }
});

test('prompt-pack.md uses the host prompt lock and reference image', () => {
  const text = ref('prompt-pack.md');
  assert.ok(text.includes('prompt_lock'));
  assert.ok(text.includes('body-idle.png'));
});

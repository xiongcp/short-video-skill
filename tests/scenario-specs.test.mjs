import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(import.meta.dirname, 'scenarios');
const specs = readdirSync(DIR).filter((f) => /^\d{2}-.+\.json$/.test(f)).sort();

test('there are eleven scenarios numbered 01–11', () => {
  assert.deepEqual(specs.map((f) => f.slice(0, 2)), ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11']);
});

test('scenarios 10 and 11 render an MP4 and check final.mp4, qa.json and the draft flag', () => {
  for (const id of ['10', '11']) {
    const s = JSON.parse(readFileSync(join(DIR, specs.find((f) => f.startsWith(`${id}-`))), 'utf8'));
    assert.equal(s.level, 'L1');
    const checks = s.checks.join('\n');
    for (const word of ['final.mp4', 'qa.json', 'draft']) assert.ok(checks.includes(word), `${id}: ${word}`);
  }
});

for (const file of specs) {
  test(`${file} is well formed`, () => {
    const s = JSON.parse(readFileSync(join(DIR, file), 'utf8'));
    assert.equal(s.id, file.slice(0, 2));
    assert.ok(['L0', 'L1'].includes(s.level));
    assert.ok(s.turns.length >= 1 && s.turns.every((t) => typeof t === 'string' && t.length > 0));
    assert.ok(s.checks.length >= 3);
    if (s.level === 'L0') for (const fixture of s.fixtures) assert.ok(existsSync(join(DIR, 'fixtures', fixture)), fixture);
  });
}

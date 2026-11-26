import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(import.meta.dirname, 'scenarios');
const specs = readdirSync(DIR).filter((f) => /^\d{2}-.+\.json$/.test(f)).sort();

test('there are eight scenarios numbered 01–08', () => {
  assert.deepEqual(specs.map((f) => f.slice(0, 2)), ['01', '02', '03', '04', '05', '06', '07', '08']);
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

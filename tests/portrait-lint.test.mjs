import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintStoryboard } from '../skills/topic-to-video/scripts/lib/match.mjs';
import { sceneTour } from './helpers/golden.mjs';

const crowded = (ratio) => {
  const p = sceneTour();
  p.settings.ratio = ratio;
  p.shots[0].visual.data.objects = [{ prop: 'fridge' }, { prop: 'box' }, { prop: 'shop' }, { prop: 'table' }];
  p.shots[1].visual.data.objects = [{ prop: 'cloud', layer: 'air' }, { prop: 'plane', layer: 'air' }, { prop: 'rocket', layer: 'air' }];
  return lintStoryboard(p).filter((w) => w.code === 'PORTRAIT_CROWDED');
};

test('PORTRAIT_CROWDED warns about more than 3 lower or 2 air objects in 9:16 projects only', () => {
  const warns = crowded('9:16');
  assert.deepEqual(warns.map((w) => w.path), ['/shots/0/visual/data/objects', '/shots/1/visual/data/objects']);
  assert.match(warns[0].message, /地面和中间层有 4 件/);
  assert.deepEqual(crowded('16:9'), []);
});

test('lintStoryboard guards PROP_META against prototype-key prop names', () => {
  const p = sceneTour();
  p.settings.ratio = '9:16';
  p.shots[0].visual.data.objects = [{ prop: 'constructor' }, { prop: 'toString' }, { prop: 'valueOf' }, { prop: 'hasOwnProperty' }];
  const warns = lintStoryboard(p).filter((w) => w.code === 'PORTRAIT_CROWDED');
  assert.equal(warns.length, 1);
  assert.match(warns[0].message, /地面和中间层有 4 件/);
});

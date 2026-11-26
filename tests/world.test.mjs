import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GROUND_Y,
  SCENE_NAMES,
  STYLE_NAMES,
  STYLE_PALETTES,
  resolveStyle,
  sceneBackgroundSvg,
  styleBackgroundSvg,
} from '../skills/topic-to-video/scripts/lib/world.mjs';
import {
  COMMON_STATES,
  ICONS,
  PROP_META,
  customPropMeta,
  drawCustomProp,
  drawIcon,
  isCountState,
  propSupportsState,
  validateCustomProps,
} from '../skills/topic-to-video/scripts/lib/icons.mjs';
import { paperBackgroundSvg, THEME_PALETTE } from '../skills/topic-to-video/scripts/lib/templates.mjs';

const EXPECTED_LIGHT = {
  paper: '#fbfaf6',
  grid: '#eeeae0',
  ink: '#1f1f1f',
  muted: '#575757',
  card: '#ffffff',
  teal: '#20a5a3',
  yellow: '#f6c945',
  red: '#e05a47',
  softTeal: '#d7f0ef',
  softYellow: '#fdf1c8',
  softRed: '#fadcd7',
  textStroke: '#1f1f1f',
};

const EXPECTED_DARK = {
  paper: '#181b22',
  grid: '#232833',
  ink: '#f2f2f2',
  muted: '#adb5c2',
  card: '#222630',
  teal: '#2ec4c1',
  yellow: '#f6c945',
  red: '#eb6f5c',
  softTeal: '#1e3c3c',
  softYellow: '#3b341c',
  softRed: '#3d2421',
  textStroke: '#111318',
};

const SEMANTIC_COLOR_KEYS = [
  'paper',
  'grid',
  'ink',
  'muted',
  'card',
  'accent',
  'yellow',
  'red',
  'soft_accent',
  'soft_yellow',
  'soft_red',
];

function extractPathPoints(d) {
  const pts = [];
  const tokens = d.match(/[MLQA]|-?\d+(?:\.\d+)?/g) ?? [];
  let cmd = '';
  let i = 0;
  while (i < tokens.length) {
    if (/^[MLQA]$/.test(tokens[i])) {
      cmd = tokens[i];
      i += 1;
      continue;
    }
    if (cmd === 'M' || cmd === 'L') {
      pts.push([Number(tokens[i]), Number(tokens[i + 1])]);
      i += 2;
    } else if (cmd === 'Q') {
      pts.push([Number(tokens[i]), Number(tokens[i + 1])]);
      pts.push([Number(tokens[i + 2]), Number(tokens[i + 3])]);
      i += 4;
    } else if (cmd === 'A') {
      // A rx ry x-axis-rotation large-arc-flag sweep-flag x y
      pts.push([Number(tokens[i + 5]), Number(tokens[i + 6])]);
      i += 7;
    } else {
      i += 1;
    }
  }
  return pts;
}

test('STYLE_NAMES has 5 styles and STYLE_PALETTES preserves exact light/dark colors and semantic keys', () => {
  assert.equal(GROUND_Y, 930);
  assert.deepEqual(STYLE_NAMES, ['paper', 'chalkboard', 'blueprint', 'kraft', 'night']);
  assert.equal(STYLE_NAMES.length, 5);

  for (const name of STYLE_NAMES) {
    const pal = STYLE_PALETTES[name];
    assert.ok(pal, `missing palette ${name}`);
    assert.equal(typeof pal.isDark, 'boolean', `${name}.isDark must be boolean`);
    for (const key of SEMANTIC_COLOR_KEYS) {
      assert.match(pal[key], /^#[0-9a-f]{6}$/i, `${name}.${key} must be hex`);
    }
    assert.match(pal.textStroke, /^#[0-9a-f]{6}$/i, `${name}.textStroke must be hex`);
    assert.equal(pal.teal, pal.accent, `${name}.teal alias`);
    assert.equal(pal.softTeal, pal.soft_accent, `${name}.softTeal alias`);
    assert.equal(pal.softYellow, pal.soft_yellow, `${name}.softYellow alias`);
    assert.equal(pal.softRed, pal.soft_red, `${name}.softRed alias`);
  }

  for (const [k, v] of Object.entries(EXPECTED_LIGHT)) {
    assert.equal(STYLE_PALETTES.paper[k], v, `paper.${k}`);
    assert.equal(THEME_PALETTE.light[k], v, `THEME_PALETTE.light.${k}`);
  }
  for (const [k, v] of Object.entries(EXPECTED_DARK)) {
    assert.equal(STYLE_PALETTES.night[k], v, `night.${k}`);
    assert.equal(THEME_PALETTE.dark[k], v, `THEME_PALETTE.dark.${k}`);
  }

  for (const darkName of ['chalkboard', 'blueprint', 'night']) {
    assert.equal(STYLE_PALETTES[darkName].isDark, true, `${darkName}.isDark`);
    assert.notEqual(STYLE_PALETTES[darkName].ink, '#1f1f1f', `${darkName} ink is not dark charcoal`);
  }
  for (const lightName of ['paper', 'kraft']) {
    assert.equal(STYLE_PALETTES[lightName].isDark, false, `${lightName}.isDark`);
  }
});

test('resolveStyle resolves style names, light/dark aliases, and project objects', () => {
  assert.equal(resolveStyle('chalkboard').name, 'chalkboard');
  assert.equal(resolveStyle('chalkboard').palette, STYLE_PALETTES.chalkboard);
  assert.equal(resolveStyle('light').name, 'paper');
  assert.equal(resolveStyle('dark').name, 'night');
  assert.equal(resolveStyle({ theme: 'light' }).name, 'paper');
  assert.equal(resolveStyle({ theme: 'dark' }).name, 'night');
  assert.equal(resolveStyle({ theme: 'dark', world: { style: 'blueprint' } }).name, 'blueprint');
  assert.equal(resolveStyle({}).name, 'paper');
  assert.throws(() => resolveStyle('neon'), /unknown style/i);
});

test('styleBackgroundSvg renders deterministic pure vector SVG with parallax for all 5 styles', () => {
  for (const name of STYLE_NAMES) {
    const a = styleBackgroundSvg(name, 1920, 1080, [0, 0]);
    const b = styleBackgroundSvg(name, 1920, 1080, [0, 0]);
    const shifted = styleBackgroundSvg(name, 1920, 1080, [14, 9]);
    assert.equal(a, b, `${name} deterministic`);
    assert.ok(a.includes(STYLE_PALETTES[name].paper), `${name} base fill`);
    assert.ok(!a.includes('<text'), `${name} has no <text>`);
    assert.ok(!a.includes('<filter'), `${name} has no <filter> noise`);
    assert.notEqual(a, shifted, `${name} responds to parallax`);
  }
  assert.equal(paperBackgroundSvg('light', 1920, 1080, [5, 7]), styleBackgroundSvg('paper', 1920, 1080, [5, 7]));
  assert.equal(paperBackgroundSvg('dark', 1920, 1080, [5, 7]), styleBackgroundSvg('night', 1920, 1080, [5, 7]));
  assert.throws(() => styleBackgroundSvg('unknown-style'), /unknown style/i);
});

test('chalkboard and kraft parallax moves smoothly across zero without modulo jumps', () => {
  for (const name of ['chalkboard', 'kraft']) {
    const atZero = styleBackgroundSvg(name, 1920, 1080, [0, 0]);
    const atNeg = styleBackgroundSvg(name, 1920, 1080, [-1, -1]);
    const zeroPaths = [...atZero.matchAll(/<path[^>]*\bd="([^"]+)"/g)].map((m) => extractPathPoints(m[1]));
    const negPaths = [...atNeg.matchAll(/<path[^>]*\bd="([^"]+)"/g)].map((m) => extractPathPoints(m[1]));
    assert.equal(zeroPaths.length, negPaths.length, `${name} path count stays equal`);
    assert.ok(zeroPaths.length > 0, `${name} emits paths`);
    for (let i = 0; i < zeroPaths.length; i += 1) {
      assert.equal(zeroPaths[i].length, negPaths[i].length, `${name} path ${i} point count`);
      for (let j = 0; j < zeroPaths[i].length; j += 1) {
        const dx = negPaths[i][j][0] - zeroPaths[i][j][0];
        const dy = negPaths[i][j][1] - zeroPaths[i][j][1];
        assert.ok(Math.abs(dx) <= 2 && Math.abs(dy) <= 2, `${name} path ${i} pt ${j} jumped by (${dx}, ${dy})`);
      }
    }
  }
});

test('SCENE_NAMES has 8 scenes with ground line at y=930 and clear central stage', () => {
  assert.deepEqual(SCENE_NAMES, ['blank', 'podium', 'kitchen', 'street', 'lab', 'office', 'outdoor', 'workshop']);
  assert.equal(SCENE_NAMES.length, 8);

  for (const name of SCENE_NAMES) {
    const svgA = sceneBackgroundSvg(name, { style: 'paper', seed: 'sh01' });
    const svgB = sceneBackgroundSvg(name, { style: 'paper', seed: 'sh01' });
    assert.equal(svgA, svgB, `${name} deterministic`);
    assert.match(svgA, new RegExp(`^<g[^>]*data-scene="${name}"`));
    assert.ok(!svgA.includes('<text'), `${name} has no <text>`);
    assert.ok(svgA.includes('data-ground="930"'), `${name} marks ground line at y=930`);

    // Check every path coordinate in scene output
    const pathTags = [...svgA.matchAll(/<path\b([^>]*)>/g)];
    assert.ok(pathTags.length >= 1, `${name} emits at least ground path`);

    let hasGroundAt930 = false;
    for (const [, attrs] of pathTags) {
      const d = attrs.match(/\bd="([^"]+)"/)?.[1] ?? '';
      const pts = extractPathPoints(d);
      assert.ok(pts.length >= 2, `${name} path has points`);
      const isGround = attrs.includes('data-ground="930"');
      for (const [x, y] of pts) {
        assert.ok(y <= 935, `${name} y=${y} must not cross below y=935 into subtitle area`);
        if (isGround) {
          assert.ok(Math.abs(y - 930) <= 5, `${name} ground path y=${y} stays near 930`);
          hasGroundAt930 = true;
        } else {
          const inCenter = x >= 560 && x <= 1360 && y >= 360 && y <= 920;
          assert.equal(inCenter, false, `${name} non-ground point (${x}, ${y}) must not enter central stage 560..1360 x 360..920`);
        }
      }
    }
    assert.ok(hasGroundAt930, `${name} includes y=930 ground line`);
  }

  assert.throws(() => sceneBackgroundSvg('spaceship'), /unknown scene/i);
});

const ORIGINAL_24_ICONS = [
  'browser', 'server', 'database', 'cache', 'clock', 'doc', 'user', 'phone',
  'cloud', 'lock', 'key', 'chart', 'check', 'cross', 'warn', 'bulb',
  'gear', 'network', 'folder', 'image', 'search', 'money', 'plane', 'globe',
];

const SAMPLE_FISHTANK = {
  id: 'c_fishtank',
  label: '鱼缸',
  height: 0.5,
  layer: 'ground',
  parts: [
    { shape: 'rect', x: -0.9, y: -0.5, w: 1.8, h: 1.5, fill: 'soft_accent' },
    { shape: 'circle', cx: -0.3, cy: 0.2, r: 0.15, fill: 'yellow' },
    { shape: 'poly', points: [[0.1, 0.2], [0.4, 0.05], [0.4, 0.35]], fill: 'yellow' },
    { shape: 'line', points: [[-0.9, -0.3], [0.9, -0.3]] },
  ],
};

test('ICONS has 60 props preserving original 24 order and complete PROP_META with valid bounds and anchors', () => {
  assert.equal(ICONS.length, 60);
  assert.equal(new Set(ICONS).size, 60);
  assert.deepEqual(ICONS.slice(0, 24), ORIGINAL_24_ICONS);
  assert.deepEqual(COMMON_STATES, ['normal', 'active', 'dim', 'crossed', 'stamped', 'broken']);

  assert.equal(isCountState('count:3'), true);
  assert.equal(isCountState('count:9999'), true);
  assert.equal(isCountState('count:'), false);
  assert.equal(isCountState('count:12345'), false);
  assert.equal(isCountState('normal'), false);

  for (const name of ICONS) {
    const meta = PROP_META[name];
    assert.ok(meta, `missing PROP_META for ${name}`);
    assert.ok(Number.isFinite(meta.height) && meta.height >= 0.1 && meta.height <= 1.5, `${name}.height=${meta.height}`);
    assert.ok(Number.isFinite(meta.aspect) && meta.aspect >= 0.3 && meta.aspect <= 3.0, `${name}.aspect=${meta.aspect}`);
    assert.ok(['ground', 'mid', 'air'].includes(meta.layer), `${name}.layer=${meta.layer}`);
    assert.equal(typeof meta.carry, 'boolean', `${name}.carry`);
    if (meta.carry) assert.ok(meta.height <= 0.45, `${name} carryable height ${meta.height} <= 0.45`);
    assert.ok(Array.isArray(meta.states), `${name}.states`);
    for (const k of ['handle', 'top', 'front']) {
      const pt = meta.anchors?.[k];
      assert.ok(Array.isArray(pt) && pt.length === 2, `${name}.anchors.${k}`);
      assert.ok(pt[0] >= 0 && pt[0] <= 1 && pt[1] >= 0 && pt[1] <= 1, `${name}.anchors.${k}=${pt}`);
    }
    if (meta.anchors.seat !== undefined) {
      const s = meta.anchors.seat;
      assert.ok(Array.isArray(s) && s.length === 2 && s[0] >= 0 && s[0] <= 1 && s[1] >= 0 && s[1] <= 1, `${name}.anchors.seat=${s}`);
    }
  }
  for (const sitProp of ['chair', 'box', 'table']) {
    assert.ok(PROP_META[sitProp].anchors.seat, `${sitProp} has seat anchor`);
  }

  assert.equal(propSupportsState('fridge', 'open'), true);
  assert.equal(propSupportsState('fridge', 'normal'), true);
  assert.equal(propSupportsState('fridge', 'count:3'), true);
  assert.equal(propSupportsState('cup', 'open'), false);
  assert.equal(propSupportsState('c_fishtank', 'normal', [SAMPLE_FISHTANK]), true);
  assert.equal(propSupportsState('c_fishtank', 'count:2', [SAMPLE_FISHTANK]), true);
  assert.equal(propSupportsState('c_fishtank', 'open', [SAMPLE_FISHTANK]), false);
  assert.equal(propSupportsState('no_such_prop', 'normal'), false);
});

test('all 60 props draw deterministically across styles with no <text>, light ink on dark styles, and >=4.4px strokes at stage scale', () => {
  for (const name of ICONS) {
    const meta = PROP_META[name];
    const h = 400 * meta.height;
    const w = h * meta.aspect;
    for (const style of ['paper', 'chalkboard']) {
      const a = drawIcon(name, { x: 500, y: 500, width: w, height: h, style, seed: 'st01' });
      const b = drawIcon(name, { x: 500, y: 500, width: w, height: h, style, seed: 'st01' });
      assert.equal(a, b, `${name} ${style} deterministic`);
      assert.ok(a.includes(`data-icon="${name}"`), `${name} data-icon`);
      assert.ok(a.includes('data-state="normal"'), `${name} data-state`);
      assert.ok(!a.includes('<text'), `${name} ${style} has no <text>`);
      if (STYLE_PALETTES[style].isDark) {
        assert.ok(!a.includes('#1f1f1f'), `${name} ${style} has no #1f1f1f`);
      }
      // Every inkStroke outline ends with circular caps A{r} {r} 0 0 0 where stroke width is 2 * r
      const caps = [...a.matchAll(/A(\d+(?:\.\d+)?) (\d+(?:\.\d+)?) 0 0 0/g)];
      assert.ok(caps.length > 0, `${name} emits inkStroke paths`);
      for (const [, rx] of caps) {
        assert.ok(Number(rx) * 2 >= 4.4 - 1e-6, `${name} ${style} stroke width ${Number(rx) * 2} < 4.4`);
      }
    }
  }
});

test('prop exclusive states, common states, and count:* emit distinct pure-vector SVGs with data-state', () => {
  const pairedChecks = [
    ['fridge', 'open', 'closed'],
    ['fridge', 'full', 'empty'],
    ['fridge', 'fresh', 'expired'],
    ['lock', 'locked', 'unlocked'],
    ['bulb', 'lit', 'off'],
    ['ticket', 'fresh', 'expired'],
    ['door', 'open', 'closed'],
    ['laptop', 'lit', 'off'],
  ];
  for (const [name, s1, s2] of pairedChecks) {
    const meta = PROP_META[name];
    const h = 400 * meta.height;
    const w = h * meta.aspect;
    const svg1 = drawIcon(name, { x: 400, y: 400, width: w, height: h, style: 'paper', seed: 'st02', state: s1 });
    const svg2 = drawIcon(name, { x: 400, y: 400, width: w, height: h, style: 'paper', seed: 'st02', state: s2 });
    assert.ok(svg1.includes(`data-state="${s1}"`), `${name}:${s1}`);
    assert.ok(svg2.includes(`data-state="${s2}"`), `${name}:${s2}`);
    assert.ok(!svg1.includes('<text') && !svg2.includes('<text'));
    assert.notEqual(svg1, svg2, `${name} ${s1} vs ${s2} must differ`);
  }

  for (const name of ICONS) {
    const meta = PROP_META[name];
    const h = 400 * meta.height;
    const w = h * meta.aspect;
    for (const st of meta.states) {
      const svg = drawIcon(name, { x: 400, y: 400, width: w, height: h, style: 'paper', seed: 'st03', state: st });
      assert.ok(svg.includes(`data-state="${st}"`), `${name} state ${st}`);
      assert.ok(!svg.includes('<text'), `${name} state ${st} no <text>`);
    }
  }

  const normalSvg = drawIcon('box', { x: 300, y: 300, width: 168, height: 168, style: 'paper', seed: 'st04', state: 'normal' });
  const seen = new Set([normalSvg]);
  for (const st of ['active', 'dim', 'crossed', 'stamped', 'broken', 'count:3']) {
    const svg = drawIcon('box', { x: 300, y: 300, width: 168, height: 168, style: 'paper', seed: 'st04', state: st });
    assert.ok(svg.includes(`data-state="${st}"`), `common state ${st}`);
    assert.ok(!svg.includes('<text'), `common state ${st} no <text>`);
    assert.equal(seen.has(svg), false, `state ${st} renders distinct SVG`);
    seen.add(svg);
  }
});

test('validateCustomProps accepts valid c_fishtank and rejects invalid definitions with CUSTOM_PROP_INVALID', () => {
  assert.deepEqual(validateCustomProps([SAMPLE_FISHTANK]), []);
  assert.deepEqual(validateCustomProps([]), []);

  const assertInvalid = (input, label) => {
    const errs = validateCustomProps(input);
    assert.ok(errs.length > 0, `expected error for ${label}`);
    assert.ok(errs.every((e) => e.code === 'CUSTOM_PROP_INVALID' && typeof e.path === 'string' && typeof e.message === 'string'), label);
  };

  // > 4 items
  assertInvalid(Array.from({ length: 5 }, (_, i) => ({ ...SAMPLE_FISHTANK, id: `c_p${i}` })), 'over 4 props');
  // > 12 parts
  assertInvalid([{
    ...SAMPLE_FISHTANK,
    parts: Array.from({ length: 13 }, () => ({ shape: 'circle', cx: 0, cy: 0, r: 0.1, fill: 'yellow' })),
  }], 'over 12 parts');
  // id not starting with c_
  assertInvalid([{ ...SAMPLE_FISHTANK, id: 'fishtank' }], 'missing c_ prefix');
  // id colliding with built-in (and c_-stripped or built-in name)
  assertInvalid([{ ...SAMPLE_FISHTANK, id: 'fridge' }], 'collides with built-in');
  // duplicate id
  assertInvalid([SAMPLE_FISHTANK, { ...SAMPLE_FISHTANK }], 'duplicate id');
  // out of range coords & NaN
  assertInvalid([{ ...SAMPLE_FISHTANK, parts: [{ shape: 'rect', x: -1.2, y: 0, w: 0.5, h: 0.5 }] }], 'x < -1');
  assertInvalid([{ ...SAMPLE_FISHTANK, parts: [{ shape: 'rect', x: 0.5, y: 0, w: 0.8, h: 0.5 }] }], 'x + w > 1');
  assertInvalid([{ ...SAMPLE_FISHTANK, parts: [{ shape: 'circle', cx: Number.NaN, cy: 0, r: 0.2 }] }], 'NaN coord');
  // unknown shape & unknown fill
  assertInvalid([{ ...SAMPLE_FISHTANK, parts: [{ shape: 'path', d: 'M0 0' }] }], 'unknown shape');
  assertInvalid([{ ...SAMPLE_FISHTANK, parts: [{ shape: 'circle', cx: 0, cy: 0, r: 0.2, fill: '#ff0000' }] }], 'raw hex fill');
  // line point limits
  assertInvalid([{ ...SAMPLE_FISHTANK, parts: [{ shape: 'line', points: [[0, 0]] }] }], 'line < 2 points');
  assertInvalid([{
    ...SAMPLE_FISHTANK,
    parts: [{ shape: 'line', points: Array.from({ length: 7 }, (_, i) => [-0.8 + i * 0.2, 0]) }],
  }], 'line > 6 points');
  // poly point limits
  assertInvalid([{ ...SAMPLE_FISHTANK, parts: [{ shape: 'poly', points: [[0, 0], [0.5, 0]] }] }], 'poly < 3 points');
  assertInvalid([{
    ...SAMPLE_FISHTANK,
    parts: [{ shape: 'poly', points: Array.from({ length: 9 }, (_, i) => [Math.cos(i) * 0.5, Math.sin(i) * 0.5]) }],
  }], 'poly > 8 points');
  // height out of [0.1, 1.5]
  assertInvalid([{ ...SAMPLE_FISHTANK, height: 0.05 }], 'height < 0.1');
  assertInvalid([{ ...SAMPLE_FISHTANK, height: 1.8 }], 'height > 1.5');
});

test('customPropMeta and drawCustomProp render safe hand-drawn SVG and sanitize/clamp untrusted input', () => {
  const meta = customPropMeta(SAMPLE_FISHTANK);
  assert.equal(meta.height, 0.5);
  assert.equal(meta.aspect, 1);
  assert.equal(meta.layer, 'ground');
  assert.equal(meta.carry, false);
  assert.deepEqual(meta.states, []);
  assert.ok(meta.anchors.seat, 'height <= 0.6 gets seat anchor');
  for (const pt of [meta.anchors.handle, meta.anchors.top, meta.anchors.front, meta.anchors.seat]) {
    assert.ok(pt[0] >= 0 && pt[0] <= 1 && pt[1] >= 0 && pt[1] <= 1);
  }

  const smallMeta = customPropMeta({ ...SAMPLE_FISHTANK, height: 0.3 });
  assert.equal(smallMeta.carry, true);

  const svg = drawCustomProp(SAMPLE_FISHTANK, { x: 400, y: 800, w: 200, h: 200, style: 'paper', seed: 'cp01' });
  assert.ok(svg.includes('data-icon="c_fishtank"'));
  assert.ok(svg.includes('data-state="normal"'));
  assert.ok(!svg.includes('<text'));
  assert.ok(!svg.includes('<script'));

  const hostile = {
    id: 'c_tank<script>alert(1)</script>',
    height: 99,
    parts: [
      { shape: 'rect', x: -999, y: -999, w: 500, h: 500, fill: 'red" onload="alert(1)' },
      { shape: 'script', content: '<script>evil()</script>' },
      { shape: 'circle', cx: Number.NaN, cy: 50, r: 20, fill: 'yellow' },
    ],
  };
  const safeSvg = drawCustomProp(hostile, { x: 500, y: 500, w: 200, h: 200, style: 'chalkboard', seed: 'evil', state: 'active' });
  assert.ok(!safeSvg.toLowerCase().includes('<script'));
  assert.ok(!safeSvg.includes('<text'));
  assert.ok(!safeSvg.includes('onload='));
  assert.ok(!safeSvg.includes('#1f1f1f'));
  for (const [, coord] of safeSvg.matchAll(/M(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)) {
    assert.ok(Number.isFinite(Number(coord)));
  }
});

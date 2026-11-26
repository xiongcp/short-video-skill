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

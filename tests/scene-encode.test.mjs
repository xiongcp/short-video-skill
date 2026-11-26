import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { buildTimeline } from '../skills/topic-to-video/scripts/lib/timebase.mjs';
import { makeWavBuffer } from '../skills/topic-to-video/scripts/lib/mouth.mjs';
import { buildShotPlans, evaluateFrame, SCENE_VERSION, shotCacheKey } from '../skills/topic-to-video/scripts/lib/scene.mjs';
import { buildChapters, buildSubtitlesAss, buildSubtitlesSrt, renderProject } from '../skills/topic-to-video/scripts/lib/encode.mjs';

const manifest = JSON.parse(readFileSync(join(import.meta.dirname, '../skills/topic-to-video/assets/host/manifest.json'), 'utf8'));
const minimal = () => JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/minimal-project.json'), 'utf8'));

test('scene chains host continuity across shots, computes morph/layout transitions, and builds frame-number-free cache keys', () => {
  const p = minimal();
  p.shots[0].visual = { template: 'flow', data: { nodes: ['阳光', '空气'] } };
  p.shots[1].visual = { template: 'flow', data: { nodes: ['空气', '散射'] } };
  p.shots[1].cues = [{ sentence: 1, do: 'reveal', target: 1 }];
  const timing = {
    's01-0': { file: 'audio/s01-0.wav', duration_ms: 1500, speech: [50, 1400], source: 'estimate', words: [], sha256: 'aaa' },
    's01-1': { file: 'audio/s01-1.wav', duration_ms: 1500, speech: [50, 1400], source: 'estimate', words: [], sha256: 'bbb' },
  };
  const tl = buildTimeline(p, timing, 60);
  const plans = buildShotPlans(p, tl, manifest);
  assert.equal(plans.length, 2);
  // Shot 1 transitions from host-left -> full and shares element "空气"
  assert.equal(plans[1].transition.kind, 'morph');
  assert.equal(plans[1].transition.layoutSwitch, 'host-left->full');
  const early = evaluateFrame(manifest, plans[1], 0.15);
  assert.ok(!early.vectorSvg.includes('<text'), 'vectorSvg stays text-free for fast resvg');
  assert.ok(early.vectorSvg.includes('data-host="xiaoqing"'), 'host trots out during layout switch');
  assert.equal(early.isFastMotion, true);

  // Cache key of shot 1 does NOT depend on shot 0's duration (only prevEndState + shot 1's own audio hashes)
  const keyA = shotCacheKey(plans[1], { fps: 60, width: 1920, height: 1080, motionBlur: false });
  const tl2 = buildTimeline(p, { ...timing, 's01-0': { ...timing['s01-0'], duration_ms: 2500 } }, 60);
  const plans2 = buildShotPlans(p, tl2, manifest);
  const keyB = shotCacheKey(plans2[1], { fps: 60, width: 1920, height: 1080, motionBlur: false });
  assert.equal(keyA, keyB, 'later shot cache key is invariant to earlier shot duration');
});

test('host smoothly walks back to left column after a previous shot moved right, and resets to left after a full shot', () => {
  const p = minimal();
  p.sections[0].text = '第一句往右走。第二句换镜回来。第三句全屏。第四句再进场。';
  p.shots = [
    { id: 'sh01', section: 's01', sentences: [0], layout: 'host-left', host: { expr: 'explaining', gesture: 'point' }, visual: { template: 'title', data: { heading: '一' } }, cues: [{ sentence: 0, do: 'move', target: 'right' }], note: 'move right' },
    { id: 'sh02', section: 's01', sentences: [1], layout: 'host-left', host: { expr: 'curious', gesture: 'think' }, visual: { template: 'title', data: { heading: '二' } }, note: 'auto return' },
    { id: 'sh03', section: 's01', sentences: [2], layout: 'full', visual: { template: 'title', data: { heading: '三' } }, note: 'full' },
    { id: 'sh04', section: 's01', sentences: [3], layout: 'host-left', host: { expr: 'proud', gesture: 'emphasize' }, visual: { template: 'title', data: { heading: '四' } }, note: 'reenter' },
  ];
  const timing = Object.fromEntries([0, 1, 2, 3].map((n) => [`s01-${n}`, { file: `audio/s01-${n}.wav`, duration_ms: 4000, speech: [50, 3900], source: 'estimate', words: [], sha256: `h${n}` }]));
  const tl = buildTimeline(p, timing, 60);
  const plans = buildShotPlans(p, tl, manifest);
  assert.ok(plans[0].endHostState.x > 1000, 'sh01 ends on the right');
  assert.ok(plans[1].cues.some((c) => c.do === 'move' && c.target === 'left' && c.source === 'auto_return'), 'sh02 schedules smooth walk back to left');
  assert.equal(plans[1].endHostState.x, 320, 'sh02 finishes back at host-left x=320');
  assert.equal(plans[1].endHostState.facing, 1, 'sh02 turns back to face right toward diagram');
  assert.equal(plans[3].startState.x, 320, 'sh04 re-entering from full starts cleanly at x=320');
});

test('subtitles (SRT + ASS with keyword highlight) and chapters are generated accurately', () => {
  const p = minimal();
  p.shots[1].cues[0].at = '阳光';
  const timing = {
    's01-0': { file: 'audio/s01-0.wav', duration_ms: 1500, speech: [0, 1500], source: 'estimate', words: [] },
    's01-1': { file: 'audio/s01-1.wav', duration_ms: 1500, speech: [0, 1500], source: 'estimate', words: [] },
  };
  const tl = buildTimeline(p, timing, 60);
  const srt = buildSubtitlesSrt(p, tl);
  const ass = buildSubtitlesAss(p, tl);
  const chapters = buildChapters(p, tl);
  assert.ok(srt.includes('天空为什么是蓝的？'));
  assert.ok(srt.includes('答案藏在阳光里。'));
  assert.ok(ass.includes('{\\c&HA3A520&}阳光{\\r}'), 'ASS preserves keyword color highlight');
  assert.ok(chapters.includes('00:00 开场'));
});

test('renderProject renders a valid 60fps BT.709 MP4, cover, captions and chapters end-to-end (smoke test)', async (t) => {
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
    t.skip('ffmpeg unavailable');
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'svs-render-smoke-'));
  try {
    const p = minimal();
    p.settings.fps = 60;
    p.voice = { provider: 'import' };
    mkdirSync(join(dir, 'audio'), { recursive: true });
    // Two 0.6s 48kHz speech-like WAVs
    for (const [key, freq] of [['s01-0', 320], ['s01-1', 440]]) {
      const sr = 48000;
      const samples = new Int16Array(Math.round(sr * 0.6));
      for (let i = 2000; i < samples.length - 2000; i += 1) {
        samples[i] = Math.round(9000 * Math.sin((2 * Math.PI * freq * i) / sr));
      }
      writeFileSync(join(dir, `audio/${key}.wav`), makeWavBuffer(samples, sr));
    }
    writeFileSync(join(dir, 'project.json'), JSON.stringify(p, null, 2));

    // Pass a relative projectDir to verify FFmpeg concat handles relative paths cleanly
    const relDir = relative(process.cwd(), dir);
    const res = await renderProject(relDir, { preview: true, workers: 2, runQa: false });
    assert.ok(existsSync(res.videoPath), 'preview.mp4 created');
    assert.ok(existsSync(join(dir, 'out/captions.srt')));
    assert.ok(existsSync(join(dir, 'out/captions.ass')));
    assert.ok(existsSync(join(dir, 'out/cover.png')));
    assert.ok(existsSync(join(dir, 'out/chapters.txt')));

    const probe = JSON.parse(spawnSync('ffprobe', [
      '-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', res.videoPath,
    ], { encoding: 'utf8' }).stdout);
    const v = probe.streams.find((s) => s.codec_type === 'video');
    const a = probe.streams.find((s) => s.codec_type === 'audio');
    assert.equal(v.width, 960);
    assert.equal(v.height, 540);
    assert.equal(v.r_frame_rate, '30/1');
    assert.equal(v.pix_fmt, 'yuv420p');
    assert.equal(v.color_space, 'bt709');
    assert.equal(a.sample_rate, '48000');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('settings.outfit dresses the host in every frame and is part of the shot cache key', () => {
  const p = minimal();
  const timing = {
    's01-0': { file: 'audio/s01-0.wav', duration_ms: 1500, speech: [50, 1400], source: 'estimate', words: [], sha256: 'aaa' },
    's01-1': { file: 'audio/s01-1.wav', duration_ms: 1500, speech: [50, 1400], source: 'estimate', words: [], sha256: 'bbb' },
  };
  const plain = buildShotPlans(p, buildTimeline(p, timing, 60), manifest);
  p.settings.outfit = 'hardhat';
  const dressed = buildShotPlans(p, buildTimeline(p, timing, 60), manifest);
  assert.equal(plain[0].outfit, 'none');
  assert.equal(dressed[0].outfit, 'hardhat');
  assert.match(evaluateFrame(manifest, dressed[0], 0.5).vectorSvg, /data-outfit="hardhat"/);
  assert.doesNotMatch(evaluateFrame(manifest, plain[0], 0.5).vectorSvg, /data-outfit/);
  assert.match(evaluateFrame(manifest, plain[0], 0.5).vectorSvg, /data-part="ahoge"/, 'an older project gets the 呆毛 without any change');
  assert.notEqual(shotCacheKey(dressed[0]), shotCacheKey(plain[0]));
});

test('the automatic snap count carries from one host-left shot to the next', () => {
  const p = minimal();
  p.sections[0].text = '原来是缓存。原来是副本。原来如此。';
  p.shots = [0, 1, 2].map((n) => ({ id: `sh0${n + 1}`, section: 's01', sentences: [n], layout: 'host-left', host: { expr: 'explaining', gesture: 'idle' }, visual: { template: 'title', data: { heading: `${n}` } }, note: 'reveal' }));
  const timing = Object.fromEntries([0, 1, 2].map((n) => [`s01-${n}`, { file: `audio/s01-${n}.wav`, duration_ms: 2000, speech: [50, 1900], source: 'estimate', words: [], sha256: `h${n}` }]));
  const plans = buildShotPlans(p, buildTimeline(p, timing, 60), manifest);
  assert.deepEqual(plans.map((pl) => pl.startState.autoSnaps), [0, 1, 2]);
  assert.notEqual(evaluateFrame(manifest, plans[2], 0.5).vectorSvg.match(/data-gesture="(\w+)"/)[1], 'snap');
});

test('a newer highlight or reveal fades out the previous highlight circle instead of leaving both lit', () => {
  const p = minimal();
  p.sections[0].text = '先看左边。再看右边。';
  p.shots = [{
    id: 'sh01', section: 's01', sentences: [0, 1], layout: 'full',
    visual: { template: 'compare', data: { left: { label: '甲', rows: ['一'] }, right: { label: '乙', rows: ['二'] } } },
    cues: [
      { sentence: 0, do: 'highlight', target: 0 },
      { sentence: 1, do: 'highlight', target: 1 },
    ],
    note: 'switch highlight',
  }];
  const timing = {
    's01-0': { file: 'audio/s01-0.wav', duration_ms: 1500, speech: [50, 1400], source: 'estimate', words: [], sha256: 'a' },
    's01-1': { file: 'audio/s01-1.wav', duration_ms: 1500, speech: [50, 1400], source: 'estimate', words: [], sha256: 'b' },
  };
  const [shotPlan] = buildShotPlans(p, buildTimeline(p, timing, 60), manifest);
  assert.match(evaluateFrame(manifest, shotPlan, 0.8).vectorSvg, /data-highlight="0"/);
  const later = evaluateFrame(manifest, shotPlan, 2.5).vectorSvg;
  assert.match(later, /data-highlight="1"/);
  assert.doesNotMatch(later, /data-highlight="0"/, 'earlier highlight clears once focus moves');
});

test('a host-left morph with no shared elements cross-dissolves without a mid-transition blank gap', () => {
  const p = minimal();
  p.shots[1].layout = 'host-left';
  p.shots[1].host = { expr: 'explaining', gesture: 'point' };
  p.shots[1].cues = [];
  const timing = {
    's01-0': { file: 'audio/s01-0.wav', duration_ms: 1500, speech: [50, 1400], source: 'estimate', words: [], sha256: 'a' },
    's01-1': { file: 'audio/s01-1.wav', duration_ms: 1500, speech: [50, 1400], source: 'estimate', words: [], sha256: 'b' },
  };
  const plans = buildShotPlans(p, buildTimeline(p, timing, 60), manifest);
  const mid = evaluateFrame(manifest, plans[1], 0.18);
  const textOpacities = mid.textItems.filter((ti) => !ti.key?.startsWith('sub-')).map((ti) => ti.opacity);
  const maxOp = Math.max(0, ...textOpacities);
  assert.ok(maxOp >= 0.4, `mid-transition diagram faded to near-blank (maxOpacity=${maxOp.toFixed(3)})`);
});

test('host-left diagram bottom leaves vertical room above the host 呆毛', () => {
  const p = minimal();
  p.shots[0].visual = { template: 'compare', data: { left: { label: '甲', rows: ['一'] }, right: { label: '乙', rows: ['二'] } } };
  const timing = {
    's01-0': { file: 'audio/s01-0.wav', duration_ms: 1500, speech: [50, 1400], source: 'estimate', words: [], sha256: 'a' },
    's01-1': { file: 'audio/s01-1.wav', duration_ms: 1500, speech: [50, 1400], source: 'estimate', words: [], sha256: 'b' },
  };
  const [shotPlan] = buildShotPlans(p, buildTimeline(p, timing, 60), manifest);
  const diagBottom = Math.max(...shotPlan.elements.map((e) => e.bbox.y + e.bbox.h));
  const frame = evaluateFrame(manifest, shotPlan, 0.5);
  assert.ok(diagBottom < frame.hostMeta.bodyBbox.y, `diagram bottom ${diagBottom} overlaps host top ${frame.hostMeta.bodyBbox.y}`);
});

test('stage shot renders style background, scene layer, props, host in exact layer order with chalkboard ink', () => {
  const p = {
    ...minimal(),
    world: {
      metaphor: '缓存是家门口的冰箱',
      style: 'chalkboard',
      scene: 'kitchen',
      custom_props: [{
        id: 'c_tray',
        label: '托盘',
        height: 0.25,
        layer: 'mid',
        parts: [{ shape: 'rect', x: -0.8, y: 0.2, w: 1.6, h: 0.6, fill: 'soft_accent' }],
      }],
    },
    sections: [{ id: 's01', title: '舞台', text: '冰箱就在厨房里。' }],
    shots: [{
      id: 'sh01',
      section: 's01',
      sentences: [0],
      layout: 'stage',
      host: { expr: 'happy', gesture: 'point' },
      visual: {
        template: 'stage',
        data: {
          heading: '厨房里的冰箱',
          objects: [
            { prop: 'fridge', label: '缓存', at: 'center' },
            { prop: 'c_tray', label: '托盘', at: 'right' },
          ],
        },
      },
      cues: [{ sentence: 0, do: 'highlight', target: 0 }],
      note: 'stage shot',
    }],
  };
  const timing = { 's01-0': { file: 'audio/s01-0.wav', duration_ms: 2000, speech: [50, 1900], source: 'estimate', words: [], sha256: 'st1' } };
  const [plan] = buildShotPlans(p, buildTimeline(p, timing, 60), manifest);
  assert.equal(SCENE_VERSION, 4);
  assert.equal(plan.style, 'chalkboard');
  assert.equal(plan.scene, 'kitchen');
  assert.equal(plan.customProps.length, 1);
  assert.ok(plan.stageLayout);

  const frame = evaluateFrame(manifest, plan, 0.8);
  const svg = frame.vectorSvg;
  assert.ok(!svg.includes('<text'), 'vectorSvg remains <text>-free');
  const idxBg = svg.indexOf('#1d3328');
  const idxScene = svg.indexOf('data-scene="kitchen"');
  const idxProp = svg.indexOf('data-icon="fridge"');
  const idxCustom = svg.indexOf('data-icon="c_tray"');
  const idxHost = svg.indexOf('data-host="xiaoqing"');
  assert.ok(idxBg >= 0 && idxScene > idxBg && idxProp > idxScene && idxCustom > idxScene && idxHost > idxProp,
    `layer order bg(${idxBg}) -> scene(${idxScene}) -> prop(${idxProp}) -> host(${idxHost})`);
  assert.ok(svg.includes('#f2f2f2'), 'chalkboard draws host in #f2f2f2');
  assert.ok(svg.includes('#20a5a3'), 'chalkboard keeps teal scarf #20a5a3');
  assert.ok(frame.textItems.some((ti) => ti.text === '厨房里的冰箱'), 'stage heading textItem present');
  assert.ok(frame.textItems.some((ti) => ti.text === '缓存'), 'stage object label textItem present');
  assert.ok(frame.textItems.some((ti) => ti.key.startsWith('sub-') && ti.color === '#f3f1e8'), 'subtitle uses chalkboard ink color');
});

test('stage <-> host-left preserves x continuity on y=930 without auto_return, and stage <-> full trots in/out', () => {
  const p = {
    ...minimal(),
    world: { metaphor: '演示舞台切换', style: 'paper', scene: 'podium' },
    sections: [{ id: 's01', title: '衔接', text: '第一句开场。第二句进舞台。第三句回左栏。第四句再上台。第五句切全屏。第六句回舞台。' }],
    shots: [
      { id: 'sh01', section: 's01', sentences: [0], layout: 'host-left', host: { expr: 'explaining', gesture: 'idle' }, visual: { template: 'title', data: { heading: '开场' } }, cues: [{ sentence: 0, do: 'move', target: 'center' }], note: 'move center' },
      { id: 'sh02', section: 's01', sentences: [1], layout: 'stage', host: { expr: 'explaining', gesture: 'present' }, visual: { template: 'stage', data: { objects: [{ prop: 'box', label: '盒子', at: 'right' }] } }, cues: [{ sentence: 1, do: 'move', target: 0 }], note: 'to stage' },
      { id: 'sh03', section: 's01', sentences: [2], layout: 'host-left', host: { expr: 'proud', gesture: 'idle' }, visual: { template: 'title', data: { heading: '回左栏' } }, note: 'back to host-left' },
      { id: 'sh04', section: 's01', sentences: [3], layout: 'stage', host: { expr: 'curious', gesture: 'idle' }, visual: { template: 'stage', data: { objects: [{ prop: 'cup', label: '杯子', at: 'center' }] } }, note: 'back to stage' },
      { id: 'sh05', section: 's01', sentences: [4], layout: 'full', visual: { template: 'title', data: { heading: '全屏' } }, note: 'stage to full' },
      { id: 'sh06', section: 's01', sentences: [5], layout: 'stage', host: { expr: 'happy', gesture: 'idle' }, visual: { template: 'stage', data: { objects: [{ prop: 'cup', label: '杯子', at: 'center' }] } }, note: 'full to stage' },
    ],
  };
  const timing = Object.fromEntries([0, 1, 2, 3, 4, 5].map((n) => [`s01-${n}`, { file: `audio/s01-${n}.wav`, duration_ms: 3500, speech: [50, 3400], source: 'estimate', words: [], sha256: `t${n}` }]));
  const plans = buildShotPlans(p, buildTimeline(p, timing, 60), manifest);

  // host-left -> stage keeps x=960 continuously on ground 930
  assert.equal(plans[1].transition.layoutSwitch, 'host-left->stage');
  assert.equal(plans[1].startState.x, plans[0].endHostState.x);
  assert.equal(evaluateFrame(manifest, plans[1], 0).hostMeta.ground, 930);

  // stage -> host-left does NOT inject auto_return and starts at stage endHostState.x
  assert.equal(plans[2].transition.layoutSwitch, 'stage->host-left');
  assert.equal(plans[2].cues.some((c) => c.source === 'auto_return'), false);
  assert.equal(plans[2].startState.x, plans[1].endHostState.x);
  const fStageToLeft = evaluateFrame(manifest, plans[2], 0);
  assert.equal(fStageToLeft.hostMeta.x, plans[1].endHostState.x);
  assert.equal(fStageToLeft.hostMeta.ground, 930);

  // stage -> full trots out (0.4s)
  assert.equal(plans[4].transition.layoutSwitch, 'stage->full');
  assert.equal(plans[4].transition.durationSec, 0.4);
  const fStageToFull = evaluateFrame(manifest, plans[4], 0.15);
  assert.ok(fStageToFull.vectorSvg.includes('data-host="xiaoqing"'));
  assert.equal(fStageToFull.isFastMotion, true);

  // full -> stage trots in (0.6s)
  assert.equal(plans[5].transition.layoutSwitch, 'full->stage');
  assert.equal(plans[5].transition.durationSec, 0.6);
  const fFullToStage = evaluateFrame(manifest, plans[5], 0.2);
  assert.ok(fFullToStage.vectorSvg.includes('data-host="xiaoqing"'));
  assert.equal(fFullToStage.isFastMotion, true);
});

test('shotCacheKey invalidates on world.style, shot.scene, or world.custom_props, while legacy projects without world stay compatible', () => {
  const legacy = minimal();
  const timing = {
    's01-0': { file: 'audio/s01-0.wav', duration_ms: 1500, speech: [50, 1400], source: 'estimate', words: [], sha256: 'a' },
    's01-1': { file: 'audio/s01-1.wav', duration_ms: 1500, speech: [50, 1400], source: 'estimate', words: [], sha256: 'b' },
  };
  const legacyPlans = buildShotPlans(legacy, buildTimeline(legacy, timing, 60), manifest);
  const legacyFrame = evaluateFrame(manifest, legacyPlans[1], 0.5);
  assert.ok(legacyFrame.vectorSvg.includes('#fbfaf6'));
  assert.ok(!legacyFrame.vectorSvg.includes('data-scene'));

  const makeWorldProj = (overrides = {}) => ({
    ...minimal(),
    world: {
      metaphor: '比喻',
      style: overrides.style ?? 'paper',
      scene: overrides.defaultScene ?? 'kitchen',
      custom_props: overrides.custom_props ?? [{
        id: 'c_tray',
        label: '托盘',
        height: 0.25,
        layer: 'mid',
        parts: [{ shape: 'rect', x: -0.8, y: 0.2, w: 1.6, h: 0.6, fill: 'soft_accent' }],
      }],
    },
    shots: [{
      id: 'sh01',
      section: 's01',
      sentences: [0],
      layout: 'stage',
      ...(overrides.shotScene ? { scene: overrides.shotScene } : {}),
      host: { expr: 'explaining', gesture: 'idle' },
      visual: { template: 'stage', data: { objects: [{ prop: 'c_tray', label: '托盘', at: 'center' }] } },
      note: 'stage',
    }],
  });
  const baseKey = shotCacheKey(buildShotPlans(makeWorldProj(), buildTimeline(makeWorldProj(), timing, 60), manifest)[0]);
  const styleKey = shotCacheKey(buildShotPlans(makeWorldProj({ style: 'blueprint' }), buildTimeline(makeWorldProj({ style: 'blueprint' }), timing, 60), manifest)[0]);
  const sceneKey = shotCacheKey(buildShotPlans(makeWorldProj({ shotScene: 'lab' }), buildTimeline(makeWorldProj({ shotScene: 'lab' }), timing, 60), manifest)[0]);
  const propKey = shotCacheKey(buildShotPlans(makeWorldProj({
    custom_props: [{
      id: 'c_tray',
      label: '托盘',
      height: 0.4,
      layer: 'mid',
      parts: [{ shape: 'rect', x: -0.8, y: 0.2, w: 1.6, h: 0.6, fill: 'yellow' }],
    }],
  }), buildTimeline(makeWorldProj(), timing, 60), manifest)[0]);

  assert.notEqual(baseKey, styleKey, 'changing world.style must change shotCacheKey');
  assert.notEqual(baseKey, sceneKey, 'changing shot.scene must change shotCacheKey');
  assert.notEqual(baseKey, propKey, 'changing world.custom_props must change shotCacheKey');
});

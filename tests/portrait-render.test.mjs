import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderProject } from '../skills/topic-to-video/scripts/lib/encode.mjs';
import { FRAMES } from '../skills/topic-to-video/scripts/lib/frame.mjs';
import { makeWavBuffer } from '../skills/topic-to-video/scripts/lib/mouth.mjs';
import { runQa } from '../skills/topic-to-video/scripts/lib/qa.mjs';
import { buildShotPlans, evaluateFrame, portraitLayoutIssues, shotCacheKey } from '../skills/topic-to-video/scripts/lib/scene.mjs';
import { panGains } from '../skills/topic-to-video/scripts/lib/sound.mjs';
import { buildTimeline } from '../skills/topic-to-video/scripts/lib/timebase.mjs';
import { parseArgs } from '../skills/topic-to-video/scripts/render.mjs';
import { fakeTiming, goldenCases, manifest, sceneTour } from './helpers/golden.mjs';
import { pngSize } from './helpers/png.mjs';

const plansOf = (p, frame) => buildShotPlans(p, buildTimeline(p, fakeTiming(p), 60), manifest, frame ? { frame } : undefined);

test('parseArgs reads --ratio', () => {
  assert.equal(parseArgs(['proj', '--ratio', '9:16', '--preview']).ratio, '9:16');
  assert.equal(parseArgs(['proj']).ratio, undefined);
});

test('16:9 cache keys do not change; portrait keys differ', () => {
  const p = sceneTour();
  const land = plansOf(p);
  const explicit = plansOf(p, FRAMES['16:9']);
  const port = plansOf(p, FRAMES['9:16']);
  const key = (pl, w, h) => shotCacheKey(pl, { fps: 60, width: w, height: h, motionBlur: false });
  land.forEach((pl, i) => {
    assert.equal(key(pl, 1920, 1080), key(explicit[i], 1920, 1080));
    assert.notEqual(key(pl, 1920, 1080), key(port[i], 1080, 1920));
  });
});

test('panGains is proportional to the frame width', () => {
  assert.deepEqual(panGains(540, 1080), panGains(960));
  for (const v of panGains(540, 1080)) assert.ok(Math.abs(v - 1) < 1e-9);
  assert.deepEqual(panGains(1080, 1080), panGains(1920));
  for (const v of panGains(960)) assert.ok(Math.abs(v - 1) < 1e-9);
});

test('portraitLayoutIssues flags crowded stages and text outside the safe box, nothing in landscape', () => {
  const p = sceneTour();
  p.shots[0].visual.data.objects = ['fridge', 'box', 'shop', 'table', 'chair'].map((prop) => ({ prop }));
  p.shots[0].cues = [];
  p.shots[1].visual.data.heading = '一个特别特别特别长的竖屏标题文字';
  const issues = portraitLayoutIssues(manifest, plansOf(p, FRAMES['9:16']));
  assert.ok(issues.some((i) => i.code === 'STAGE_CROWDED' && i.shotId === 'sh01'));
  assert.ok(issues.some((i) => i.code === 'SAFE_ZONE_TEXT' && i.shotId === 'sh02'));
  assert.deepEqual(portraitLayoutIssues(manifest, plansOf(p)), []);
});

test('--ratio 9:16 on a 16:9 project renders 540×960 into out/9x16 with a portrait cover, ASS and safe sheet', async (t) => {
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
    t.skip('ffmpeg unavailable');
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'svs-portrait-'));
  try {
    const p = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/minimal-project.json'), 'utf8'));
    p.voice = { provider: 'import' };
    mkdirSync(join(dir, 'audio'), { recursive: true });
    for (const key of ['s01-0', 's01-1']) {
      const sr = 48000;
      const samples = new Int16Array(Math.round(sr * 0.6));
      for (let i = 2000; i < samples.length - 2000; i += 1) samples[i] = Math.round(9000 * Math.sin((2 * Math.PI * 330 * i) / sr));
      writeFileSync(join(dir, `audio/${key}.wav`), makeWavBuffer(samples, sr));
    }
    writeFileSync(join(dir, 'project.json'), JSON.stringify(p, null, 2));
    const res = await renderProject(dir, { preview: true, ratio: '9:16', workers: 2 });
    assert.equal(res.outDir, join(dir, 'out/9x16'));
    assert.ok(res.videoPath.endsWith(join('out', '9x16', 'preview.mp4')));
    assert.ok(!existsSync(join(dir, 'out/preview.mp4')), 'landscape location untouched');
    const probe = JSON.parse(spawnSync('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_streams', res.videoPath], { encoding: 'utf8' }).stdout);
    const v = probe.streams.find((s) => s.codec_type === 'video');
    assert.deepEqual([v.width, v.height], [540, 960]);
    assert.deepEqual(pngSize(readFileSync(join(res.outDir, 'cover.png'))), { width: 1080, height: 1920 });
    assert.match(readFileSync(join(res.outDir, 'captions.ass'), 'utf8'), /PlayResX: 1080/);
    const qa = await runQa(dir, {
      videoPath: res.videoPath, outDir: res.outDir, frame: res.frame, expectedSize: { width: res.width, height: res.height },
      expectedFps: res.fps, timeline: res.timeline, shotPlans: res.shotPlans, qaByShot: res.qaByShot, audio: res.audio, layoutIssues: res.layoutIssues,
    });
    assert.ok(!qa.issues.some((i) => i.code === 'SIZE_MISMATCH'));
    assert.ok(existsSync(join(res.outDir, 'contact.png')) && existsSync(join(res.outDir, 'contact-safe.png')));
    assert.match(readFileSync(join(res.outDir, 'qa.md'), 'utf8'), /真机遮挡：`not_checked`/);
    const wrong = await runQa(dir, { videoPath: res.videoPath, outDir: res.outDir, frame: res.frame, expectedSize: { width: 1080, height: 1920 }, expectedFps: res.fps, timeline: res.timeline, shotPlans: res.shotPlans });
    assert.ok(wrong.issues.some((i) => i.code === 'SIZE_MISMATCH'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--master separates portrait intermediates from landscape and cover.png throws when ffmpeg fails', async (t) => {
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
    t.skip('ffmpeg unavailable');
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'svs-portrait-master-'));
  try {
    const p = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/minimal-project.json'), 'utf8'));
    p.voice = { provider: 'import' };
    mkdirSync(join(dir, 'audio'), { recursive: true });
    for (const key of ['s01-0', 's01-1']) {
      const sr = 48000;
      const samples = new Int16Array(Math.round(sr * 0.25));
      for (let i = 1000; i < samples.length - 1000; i += 1) samples[i] = Math.round(9000 * Math.sin((2 * Math.PI * 330 * i) / sr));
      writeFileSync(join(dir, `audio/${key}.wav`), makeWavBuffer(samples, sr));
    }
    writeFileSync(join(dir, 'project.json'), JSON.stringify(p, null, 2));

    const probeVideo = (file) => {
      const out = JSON.parse(spawnSync('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_streams', file], { encoding: 'utf8' }).stdout);
      return out.streams.find((s) => s.codec_type === 'video');
    };

    await renderProject(dir, { preview: true, master: true, workers: 1 });
    await renderProject(dir, { preview: true, ratio: '9:16', master: true, skipTts: true, workers: 1 });

    const landInter = join(dir, 'cache/shots/sh01-master.mp4');
    const portInter = join(dir, 'cache/shots/sh01-9x16-master.mp4');
    const portMaster = join(dir, 'out/9x16/master.mp4');
    assert.ok(existsSync(landInter), 'landscape master intermediate preserved');
    assert.ok(existsSync(portInter), 'portrait master intermediate separated');
    assert.ok(existsSync(portMaster), 'portrait master written');

    const lv = probeVideo(landInter);
    assert.deepEqual([lv.width, lv.height, lv.pix_fmt], [960, 540, 'yuv444p']);
    const pv = probeVideo(portInter);
    assert.deepEqual([pv.width, pv.height, pv.pix_fmt], [540, 960, 'yuv444p']);
    const pm = probeVideo(portMaster);
    assert.deepEqual([pm.width, pm.height, pm.pix_fmt], [540, 960, 'yuv444p']);

    const failCover = join(dir, 'fail-cover-ffmpeg.sh');
    writeFileSync(failCover, '#!/bin/sh\nfor a in "$@"; do\n  case "$a" in *cover.png) echo "simulated cover error" >&2; exit 1 ;; esac\ndone\nexec ffmpeg "$@"\n');
    chmodSync(failCover, 0o755);
    await assert.rejects(
      () => renderProject(dir, { preview: true, ratio: '9:16', skipTts: true, workers: 1, ffmpeg: failCover }),
      /cover.*simulated cover error/i,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('examples/cache-speed in 9:16 has zero HOST_OCCLUSION, STAGE_CROWDED, SAFE_ZONE_TEXT and HOST_OBJECT_OVERLAP', () => {
  const p = goldenCases()['cache-speed'];
  const plans = plansOf(p, FRAMES['9:16']);
  assert.deepEqual(portraitLayoutIssues(manifest, plans), []);

  const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  for (const plan of plans) {
    if (plan.shot.layout === 'full') continue;
    for (let f = 0; f < plan.frameCount; f += 6) {
      const frame = evaluateFrame(manifest, plan, f / 60);
      const hm = frame.hostMeta;
      if (!hm?.bodyBbox || hm.lift > 0.01) continue;
      if (plan.shot.layout === 'stage') {
        if (!hm.interacting) {
          const t = f / 60;
          const sw = hm.sitWalk;
          const hit = (frame.objectBoxes ?? []).find((box, idx) => {
            if (!box || !overlaps(hm.bodyBbox, box)) return false;
            const winSec = Math.max(0.8, ((box.w * 0.5 + hm.bodyBbox.w * 0.5) / 360) * 3.0 + 0.2);
            if (sw && ((sw.enterIdx === idx && t >= sw.enterT1 - winSec && t <= sw.enterT1) || (sw.exitIdx === idx && t >= sw.exitT0 && t <= sw.exitT0 + winSec))) return false;
            return true;
          });
          assert.equal(hit, undefined, `${plan.id} f=${f}: host overlaps stage object`);
        }
      } else {
        const hit = plan.elements.find((el, idx) => idx !== hm.focusIdx && overlaps(hm.bodyBbox, el.bbox));
        assert.equal(hit, undefined, `${plan.id} f=${f}: host occludes host-left element`);
      }
    }
  }
});

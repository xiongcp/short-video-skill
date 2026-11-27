// L1 video quality audit: ffprobe media & BT.709 color checks, A/V duration diff, anchor sync,
// frame-to-frame jump MAD, motion freeze detection, host occlusion & rushed move checks,
// 3x4 contact sheet, transition strip, qa.json and qa.md (出片质量设计 §9, 火柴人主持人设计 §7.6, §12).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { splitSentences } from './captions.mjs';
import { FRAMES, isPortrait } from './frame.mjs';
import { lintStoryboard, visualKeywords } from './match.mjs';
import { buildTimeline } from './timebase.mjs';

const PROBE_W = 160;
const PROBE_H = 90;
const JUMP_MAD_THRESHOLD = 12;

/** Computes frame-to-frame mean absolute luminance differences to detect unplanned jumps and freezes. */
export function analyzeFrameDiffs(frames, { cutFrames = new Set([0]), motionFrames = new Set(), jumpThreshold = JUMP_MAD_THRESHOLD } = {}) {
  const jumps = [];
  const freezes = [];
  let freezeStart = -1;
  let freezeLen = 0;

  for (let i = 1; i < frames.length; i += 1) {
    const a = frames[i - 1];
    const b = frames[i];
    const n = Math.min(a.length, b.length);
    let diff = 0;
    for (let k = 0; k < n; k += 1) diff += Math.abs(b[k] - a[k]);
    const mad = n ? diff / n : 0;

    if (mad > jumpThreshold && !cutFrames.has(i)) {
      jumps.push({ frame: i, mad: Number(mad.toFixed(2)) });
    }
    if (motionFrames.has(i) && mad < 0.05) {
      if (freezeStart < 0) { freezeStart = i - 1; freezeLen = 2; }
      else freezeLen += 1;
    } else {
      if (freezeLen >= 3) freezes.push({ startFrame: freezeStart, length: freezeLen });
      freezeStart = -1;
      freezeLen = 0;
    }
  }
  if (freezeLen >= 3) freezes.push({ startFrame: freezeStart, length: freezeLen });
  return { jumps, freezes };
}

/** Verifies every anchored cue lands within <= 1 frame of (anchorMs - leadMs). */
export function checkAnchorSync(cueEntries, fps = 60) {
  const maxErrMs = 1000 / fps;
  const issues = [];
  for (const c of cueEntries) {
    const expected = Math.max(0, c.anchorMs - (c.leadMs ?? 0));
    const errMs = Math.abs((c.actualMs ?? c.timeMs) - expected);
    if (errMs > maxErrMs + 0.5) {
      issues.push({
        code: 'SYNC_DRIFT',
        shotId: c.shotId,
        cue: `${c.do}:${c.at ?? ''}`,
        errMs: Number(errMs.toFixed(1)),
        source: c.source ?? 'estimate',
        message: `镜头 ${c.shotId} 的锚点 “${c.at ?? c.do}” 偏差 ${errMs.toFixed(1)} ms（上限 ${maxErrMs.toFixed(1)} ms / 1 帧）`,
      });
    }
  }
  return issues;
}

function probeMedia(videoPath, ffprobe = 'ffprobe') {
  const res = spawnSync(ffprobe, [
    '-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', videoPath,
  ], { encoding: 'utf8' });
  if (res.error || res.status !== 0) throw new Error(`ffprobe failed: ${res.stderr || res.error?.message}`);
  return JSON.parse(res.stdout);
}

export function extractLumaFrames(videoPath, ffmpeg = 'ffmpeg', frame = FRAMES['16:9']) {
  const [w, h] = isPortrait(frame ?? FRAMES['16:9']) ? [PROBE_H, PROBE_W] : [PROBE_W, PROBE_H];
  const res = spawnSync(ffmpeg, [
    '-v', 'error', '-i', videoPath,
    '-vf', `scale=${w}:${h},format=gray`,
    '-f', 'rawvideo', 'pipe:1',
  ], { maxBuffer: 256 * 1024 * 1024 });
  if (res.error || res.status !== 0) return [];
  const buf = res.stdout;
  const frameSize = w * h;
  const count = Math.floor(buf.length / frameSize);
  const frames = [];
  for (let i = 0; i < count; i += 1) frames.push(buf.subarray(i * frameSize, (i + 1) * frameSize));
  return frames;
}

function generateContactSheet(videoPath, outPng, durationSec, ffmpeg = 'ffmpeg', frame = FRAMES['16:9'], safeBox = false) {
  const interval = Math.max(0.05, durationSec / 12);
  const portrait = isPortrait(frame);
  const [tw, th] = portrait ? [180, 320] : [480, 270];
  const k = tw / frame.width;
  const s = frame.textSafe;
  const box = safeBox ? `,drawbox=x=${Math.round(s.x * k)}:y=${Math.round(s.y * k)}:w=${Math.round(s.w * k)}:h=${Math.round(s.h * k)}:color=red@0.8:t=2` : '';
  spawnSync(ffmpeg, [
    '-y', '-loglevel', 'error', '-i', videoPath,
    '-vf', `fps=1/${interval.toFixed(4)},scale=${tw}:${th}${box},tile=${portrait ? '6x2' : '4x3'}:padding=8:margin=8:color=0xfbfaf6`,
    '-frames:v', '1', outPng,
  ]);
}

function generateTransitionStrip(videoPath, outPng, cutFrames, fps, ffmpeg = 'ffmpeg', frame = FRAMES['16:9']) {
  const firstCut = [...cutFrames].find((f) => f > 2);
  if (!firstCut) return;
  const start = Math.max(0, firstCut - 2);
  const end = start + 5;
  spawnSync(ffmpeg, [
    '-y', '-loglevel', 'error', '-i', videoPath,
    '-vf', `select='between(n,${start},${end})',scale=${isPortrait(frame) ? '180:320' : '320:180'},tile=6x1:padding=4:margin=4:color=0xfbfaf6`,
    '-fps_mode', 'vfr', '-frames:v', '1', outPng,
  ]);
}

const MIX_CHECKS = [
  { key: 'musicMarginDb', stem: 'musicMid', windowMs: 400, stepMs: 200, floorDb: 15, code: 'MUSIC_TOO_LOUD', label: '音乐' },
  { key: 'sfxMarginDb', stem: 'sfxMid', windowMs: 100, stepMs: 50, floorDb: 8, code: 'SFX_OVER_VOICE', label: '音效' },
];

function rmsOf(x, start, end) {
  let sum = 0;
  for (let i = start; i < end; i += 1) sum += (x[i] ?? 0) ** 2;
  return end > start ? Math.sqrt(sum / (end - start)) : 0;
}

/**
 * Checks that the music stays 15 dB and the effects 8 dB under the voice in every speech span (音效与配乐设计 §7).
 * Windows lie wholly inside a span (a span shorter than a window is one window); each code is reported once per span.
 */
export function analyzeMixLevels({ voice, sfxMid, musicMid, intervals, sampleRate = 48000 }) {
  const stems = { sfxMid, musicMid };
  const out = { musicMarginDb: null, sfxMarginDb: null, issues: [] };
  for (const { start, end } of intervals) {
    const vDb = 20 * Math.log10(Math.max(rmsOf(voice, start, end), 1e-9));
    for (const c of MIX_CHECKS) {
      const win = Math.round((c.windowMs * sampleRate) / 1000);
      const step = Math.round((c.stepMs * sampleRate) / 1000);
      const starts = [];
      if (end - start <= win) starts.push([start, end]);
      else for (let a = start; a + win <= end; a += step) starts.push([a, a + win]);
      let worst = null;
      for (const [a, b] of starts) {
        const margin = vDb - 20 * Math.log10(Math.max(rmsOf(stems[c.stem], a, b), 1e-9));
        if (!worst || margin < worst.margin) worst = { margin, atSec: (a + b) / 2 / sampleRate };
      }
      if (!worst) continue;
      if (out[c.key] === null || worst.margin < out[c.key]) out[c.key] = worst.margin;
      if (worst.margin < c.floorDb) {
        out.issues.push({
          code: c.code,
          atSec: Number(worst.atSec.toFixed(1)),
          marginDb: Number(worst.margin.toFixed(1)),
          message: `${worst.atSec.toFixed(1)} 秒处${c.label}只比人声低 ${worst.margin.toFixed(1)} dB（下限 ${c.floorDb} dB）`,
        });
      }
    }
  }
  return out;
}

function soundSection(audio) {
  if (!audio) return ['- 没有音效和音乐'];
  const margin = (v, floor) => (audio.voiceMissing ? '没有人声，未检查' : v === null || v === undefined ? '未检查' : `最少 ${v.toFixed(1)} dB（下限 ${floor} dB）`);
  const counts = Object.entries(audio.sfxCounts ?? {});
  const total = counts.reduce((s, [, n]) => s + n, 0);
  const license = audio.musicSource?.startsWith('synth:') ? '内置合成，无版权问题' : audio.musicLicense;
  return [
    `- 音乐比人声低：${margin(audio.levels?.musicMarginDb, 15)}`,
    `- 音效比人声低：${margin(audio.levels?.sfxMarginDb, 8)}`,
    `- 音效：${counts.length ? `${counts.map(([k, n]) => `${k} ${n}`).join('、')}（共 ${total} 个）` : '无'}`,
    `- 音乐：${audio.musicSource ? `${audio.musicSource}（许可：${license}）` : '无'}`,
  ];
}

/**
 * Runs complete L1 QA on a rendered video and writes `out/qa.json` and `out/qa.md`.
 */
export async function runQa(projectDir, {
  videoPath = join(projectDir, 'out/final.mp4'),
  outDir = join(projectDir, 'out'),
  frame = null,
  expectedSize = null,
  layoutIssues = [],
  expectedFps = null,
  timeline = null,
  shotPlans = null,
  qaByShot = {},
  audio = null,
  ffmpeg = process.env.FFMPEG ?? 'ffmpeg',
  ffprobe = process.env.FFPROBE ?? 'ffprobe',
} = {}) {
  const project = JSON.parse(readFileSync(join(projectDir, 'project.json'), 'utf8'));
  const ratio = project.settings?.ratio;
  const fr = frame ?? (typeof ratio === 'string' && Object.hasOwn(FRAMES, ratio) ? FRAMES[ratio] : FRAMES['16:9']);
  mkdirSync(outDir, { recursive: true });
  const issues = [];
  const warnings = [];

  const probe = probeMedia(videoPath, ffprobe);
  const v = probe.streams.find((s) => s.codec_type === 'video');
  const a = probe.streams.find((s) => s.codec_type === 'audio');
  const fps = expectedFps ?? project.settings?.fps ?? 60;

  if (!v) issues.push({ code: 'MISSING_VIDEO', message: '缺少视频流' });
  if (!a) issues.push({ code: 'MISSING_AUDIO', message: '缺少音频流' });

  if (v) {
    if (v.r_frame_rate !== `${fps}/1`) {
      issues.push({ code: 'FPS_MISMATCH', message: `帧率是 ${v.r_frame_rate}，期望 ${fps}/1` });
    }
    if (expectedSize && (v.width !== expectedSize.width || v.height !== expectedSize.height)) {
      issues.push({ code: 'SIZE_MISMATCH', message: `成片是 ${v.width}×${v.height}，期望 ${expectedSize.width}×${expectedSize.height}` });
    }
    if (!['yuv420p', 'yuv444p'].includes(v.pix_fmt)) {
      issues.push({ code: 'PIX_FMT_UNSUPPORTED', message: `像素格式 ${v.pix_fmt} 不是 yuv420p/yuv444p` });
    }
    if (v.color_space !== 'bt709' || v.color_primaries !== 'bt709' || v.color_transfer !== 'bt709') {
      issues.push({
        code: 'COLOR_NOT_BT709',
        message: `色彩标签不是 BT.709（space=${v.color_space}, primaries=${v.color_primaries}, trc=${v.color_transfer}）`,
      });
    }
  }
  if (a && Number(a.sample_rate) !== 48000) {
    issues.push({ code: 'AUDIO_SAMPLE_RATE', message: `音频采样率 ${a.sample_rate}，期望 48000` });
  }
  if (v && a) {
    const vDur = Number(v.duration ?? probe.format.duration ?? 0);
    const aDur = Number(a.duration ?? probe.format.duration ?? 0);
    // Allow 1 frame + AAC encoder priming tolerance (50ms)
    const diff = Math.abs(vDur - aDur);
    if (diff > Math.max(1 / fps + 0.06, 0.1)) {
      issues.push({ code: 'AV_DURATION_DRIFT', message: `音画时长差 ${(diff * 1000).toFixed(0)} ms` });
    }
  }

  // Timeline for cuts, motion windows and anchor sync
  const tl = timeline ?? (existsSync(join(projectDir, 'audio/timing.json'))
    ? buildTimeline(project, JSON.parse(readFileSync(join(projectDir, 'audio/timing.json'), 'utf8')), fps)
    : null);

  const cutFrames = new Set([0]);
  const motionFrames = new Set();
  const anchoredCues = [];

  if (tl) {
    let cursorFrame = 0;
    const plans = shotPlans ?? tl.shots.map((s) => ({ id: s.id, frameCount: s.frameCount, cues: [] }));
    for (const p of plans) {
      cutFrames.add(cursorFrame);
      if (cursorFrame > 0) cutFrames.add(cursorFrame + 1); // allow 1-frame codec alignment
      // Only check freezes during explicit active transitions or reveal/move/once-gesture animations
      const trSec = p.transition?.kind && p.transition.kind !== 'cut' ? (p.transition.durationSec ?? 0.3) : 0;
      if (trSec > 0) {
        const endF = Math.min(cursorFrame + Math.round(trSec * fps) - 2, cursorFrame + p.frameCount);
        for (let f = cursorFrame + 2; f < endF; f += 1) motionFrames.add(f);
      }
      for (const c of p.cues ?? []) {
        if (c.at) anchoredCues.push({ shotId: p.id, ...c, actualMs: c.timeMs });
        if (['reveal', 'move'].includes(c.do)) {
          const cf = cursorFrame + Math.round(((c.timeMs ?? 0) / 1000) * fps);
          const endF = Math.min(cf + Math.round(0.25 * fps), cursorFrame + p.frameCount);
          for (let f = cf + 1; f < endF; f += 1) motionFrames.add(f);
        }
      }
      cursorFrame += p.frameCount;
    }
  }

  issues.push(...checkAnchorSync(anchoredCues, fps));

  // Jump & freeze checks on downscaled frames
  const lumaFrames = extractLumaFrames(videoPath, ffmpeg, fr);
  const diffStats = analyzeFrameDiffs(lumaFrames, { cutFrames, motionFrames });
  for (const j of diffStats.jumps) {
    issues.push({ code: 'UNPLANNED_JUMP', frame: j.frame, mad: j.mad, message: `第 ${j.frame} 帧出现计划外跳变（MAD=${j.mad}）` });
  }
  for (const fr of diffStats.freezes) {
    warnings.push({ code: 'FREEZE_DETECTED', ...fr, message: `第 ${fr.startFrame} 帧起连续 ${fr.length} 帧完全相同` });
  }

  // Host occlusion & rushed moves recorded during render
  for (const [shotId, meta] of Object.entries(qaByShot ?? {})) {
    if (meta?.rushedMove) {
      issues.push({ code: 'RUSHED_MOVE', shotId, message: `镜头 ${shotId} 走位太赶，已切换为小跑` });
    }
    if ((meta?.occludedFrames ?? 0) > 0) {
      issues.push({ code: 'HOST_OCCLUSION', shotId, frames: meta.occludedFrames, message: `镜头 ${shotId} 有 ${meta.occludedFrames} 帧出现主持人遮挡非焦点图解元素` });
    }
    if ((meta?.objectOverlapFrames ?? 0) > 0) {
      issues.push({ code: 'HOST_OBJECT_OVERLAP', shotId, frames: meta.objectOverlapFrames, message: `镜头 ${shotId} 有 ${meta.objectOverlapFrames} 帧出现主持人身体与舞台物件重叠` });
    }
  }
  issues.push(...layoutIssues);

  if (audio) {
    if (!audio.voiceMissing) issues.push(...(audio.levels?.issues ?? []));
    if (audio.musicWarning === 'MUSIC_SILENT') {
      warnings.push({ code: 'MUSIC_SILENT', message: `音乐文件 ${audio.musicSource} 几乎没有声音，已按没有音乐处理` });
    }
  }

  // Semantic matching report per shot
  const bySection = new Map(project.sections.map((s) => [s.id, splitSentences(s.text)]));
  const storyboardWarnings = lintStoryboard(project);
  const matchTable = project.shots.map((shot) => ({
    id: shot.id,
    narration: shot.sentences.map((n) => bySection.get(shot.section)?.[n] ?? '').join(''),
    keywords: visualKeywords(shot.visual),
  }));

  // Visual review aids: contact.png & transitions.png
  const durSec = Number(probe.format.duration ?? 1);
  generateContactSheet(videoPath, join(outDir, 'contact.png'), durSec, ffmpeg, fr);
  if (isPortrait(fr)) generateContactSheet(videoPath, join(outDir, 'contact-safe.png'), durSec, ffmpeg, fr, true);
  generateTransitionStrip(videoPath, join(outDir, 'transitions.png'), cutFrames, fps, ffmpeg, fr);

  const report = {
    ok: issues.length === 0,
    video: videoPath,
    media: {
      width: v?.width,
      height: v?.height,
      fps: v?.r_frame_rate,
      pix_fmt: v?.pix_fmt,
      color_space: v?.color_space,
      audio_sample_rate: a ? Number(a.sample_rate) : null,
      duration_sec: Number(durSec.toFixed(2)),
    },
    issues,
    warnings: [...warnings, ...storyboardWarnings],
    manual_review: {
      aesthetics: 'not_checked',
      voice_naturalness: 'not_checked',
      lip_sync_spot_check: 'not_checked',
      sound_mix: 'not_checked',
    },
    audio: audio
      ? {
        music_margin_db: audio.levels?.musicMarginDb ?? null,
        sfx_margin_db: audio.levels?.sfxMarginDb ?? null,
        sfx_counts: audio.sfxCounts ?? {},
        music_source: audio.musicSource ?? null,
        music_license: audio.musicLicense ?? null,
        voice_missing: Boolean(audio.voiceMissing),
      }
      : null,
    match: matchTable,
  };

  writeFileSync(join(outDir, 'qa.json'), `${JSON.stringify(report, null, 2)}\n`);
  const rel = relative(projectDir, outDir).split('\\').join('/') || 'out';
  const md = [
    `# 成片 QA 报告：${project.title}`,
    '',
    `- 结论：${report.ok ? '技术检查通过（审美项需人工复核）' : `发现 ${issues.length} 项技术问题`}`,
    `- 媒体规格：${report.media.width}×${report.media.height} @ ${report.media.fps}，${report.media.pix_fmt}，色彩 ${report.media.color_space}，音频 ${report.media.audio_sample_rate} Hz，时长 ${report.media.duration_sec} 秒`,
    '',
    '## 技术问题',
    ...(issues.length ? issues.map((i) => `- **${i.code}**：${i.message}`) : ['- 无']),
    '',
    '## 提醒与警告',
    ...(report.warnings.length ? report.warnings.map((w) => `- ${w.code}：${w.message}`) : ['- 无']),
    '',
    '## 声音',
    ...soundSection(audio),
    '',
    '## 人工复核项（`not_checked`）',
    `- 画面审美与排版平衡：\`not_checked\`（请看 \`${rel}/contact.png\`、\`${rel}/transitions.png\`）`,
    ...(isPortrait(fr) ? [`- 真机遮挡：\`not_checked\`（文字安全框 x ${fr.textSafe.x}–${fr.textSafe.x + fr.textSafe.w}、y ${fr.textSafe.y}–${fr.textSafe.y + fr.textSafe.h} 是第三方估算，见 \`${rel}/contact-safe.png\`；上传前设为仅自己可见，在抖音、TikTok、Shorts 预览一次）`] : []),
    '- 配音自然度与停顿：`not_checked`',
    '- 口型抽检（开头/中段/结尾）：`not_checked`',
    '- 混音听感：`not_checked`',
    '',
    '## 逐镜口播与画面关键词对照',
    '| 镜头 | 画面关键词 | 口播原文 |',
    '| --- | --- | --- |',
    ...matchTable.map((m) => `| ${m.id} | ${m.keywords.join('、') || '—'} | ${m.narration} |`),
    '',
  ].join('\n');
  writeFileSync(join(outDir, 'qa.md'), md);
  return report;
}

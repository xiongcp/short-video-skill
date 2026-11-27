import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ease, easeInOutCubic, easeInOutSine, easeOutBack, easeOutCubic, lerp, linear } from '../skills/topic-to-video/scripts/lib/ease.mjs';
import { buildTimeline, samplesPerFrame, sentencePauseMs } from '../skills/topic-to-video/scripts/lib/timebase.mjs';
import { detectSpeechBounds, displayWords, estimateWords, parseSubtitles, resolveAnchorMs, resolveCueTiming, splitClauses } from '../skills/topic-to-video/scripts/lib/timing.mjs';
import { analyzeAudioFrames, makeWavBuffer, readWavPcm, trimSilenceWithFade } from '../skills/topic-to-video/scripts/lib/mouth.mjs';
import { sentenceHash, speedToEdgeRate, splitCommandTemplate, synthesizeProject } from '../skills/topic-to-video/scripts/lib/tts.mjs';
import { toSpoken } from '../skills/topic-to-video/scripts/lib/reading.mjs';
import { runDoctor } from '../skills/topic-to-video/scripts/doctor.mjs';

const minimal = () => JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/minimal-project.json'), 'utf8'));

test('ease curves hit 0 and 1 at endpoints, easeOutBack overshoots, and unknown curve throws', () => {
  for (const fn of [linear, easeOutCubic, easeInOutCubic, easeOutBack, easeInOutSine]) {
    assert.ok(Math.abs(fn(0)) < 1e-9);
    assert.ok(Math.abs(fn(1) - 1) < 1e-9);
  }
  assert.ok(easeOutBack(0.6) > 1, 'easeOutBack overshoots past 1');
  assert.equal(ease('easeInOutCubic', 0.5), 0.5);
  assert.equal(lerp(10, 20, 0.25), 12.5);
  assert.throws(() => ease('bounce', 0.5), /unknown easing/);
});

test('timebase produces contiguous half-open frame intervals without rounding drift', () => {
  assert.equal(samplesPerFrame(60), 800);
  assert.equal(samplesPerFrame(30), 1600);
  const p = minimal();
  const timing = {
    's01-0': { file: 'audio/s01-0.wav', duration_ms: 1333, speech: [50, 1280], source: 'estimate', words: [] },
    's01-1': { file: 'audio/s01-1.wav', duration_ms: 1667, speech: [40, 1600], source: 'estimate', words: [] },
  };
  const tl = buildTimeline(p, timing, 60);
  assert.equal(tl.shots[0].startFrame, 0);
  assert.equal(tl.shots[1].startFrame, tl.shots[0].endFrame);
  assert.equal(tl.totalFrames, tl.shots.at(-1).endFrame);
  // s01-0 ends with ？ (+160ms thinking beat -> 410ms), s01-1 ends with 。 (base 250ms)
  assert.equal(tl.totalMs, 1333 + 410 + 1667 + 250);
});

test('timing parses WebVTT/SRT from edge-tts, estimates weighted Chinese/number/English words, and resolves cue anchors', () => {
  const vtt = [
    'WEBVTT',
    '',
    '00:00:00.100 --> 00:00:00.600',
    '返回',
    '',
    '00:00:00.600 --> 00:00:01.300',
    '三零四',
  ].join('\n');
  const parsed = parseSubtitles(vtt);
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed[1], { text: '三零四', start_ms: 600, end_ms: 1300 });

  const est = estimateWords('返回304状态，HTTP缓存。', 100, 3100);
  assert.ok(est.length >= 6);
  assert.equal(est[0].start_ms, 100);
  assert.ok(Math.abs(est.at(-1).end_ms - 3100) <= 2);

  const entry = { text: '服务器返回三零四状态。', speech: [100, 2100], source: 'provider', words: [
    { text: '服务器', start_ms: 100, end_ms: 700 },
    { text: '返回', start_ms: 700, end_ms: 1100 },
    { text: '三零四', start_ms: 1100, end_ms: 1700 },
    { text: '状态', start_ms: 1700, end_ms: 2100 },
  ] };
  assert.deepEqual(resolveAnchorMs(entry, '三零四'), { offsetMs: 1100, source: 'provider' });

  const cues = resolveCueTiming(
    { startMs: 1000, endMs: 4000, sentenceRanges: [{ index: 0, startMs: 1000, endMs: 4000, ...entry }] },
    [
      { sentence: 0, at: '三零四', do: 'reveal', target: 0 },
      { sentence: 0, at: '三零四', do: 'highlight', target: 0 },
      { sentence: 0, at: '三零四', do: 'gesture', target: 'point' },
    ],
  );
  const byDo = new Map(cues.map((c) => [c.do, c]));
  assert.equal(byDo.get('reveal').timeMs, 1100 - 150);
  assert.equal(byDo.get('highlight').timeMs, 1100);
  assert.equal(byDo.get('gesture').timeMs, 1100 - 100);
});

test('mouth analysis reads WAV PCM, opens mouth during speech, closes during silence, and distinguishes ZCR', () => {
  const sr = 48000;
  const total = sr; // 1 second
  const samples = new Int16Array(total);
  // 0.0-0.25s silence, 0.25-0.6s low-freq 250Hz vowel, 0.6-0.9s high-freq 2400Hz vowel, 0.9-1.0s silence
  for (let i = Math.floor(0.25 * sr); i < Math.floor(0.6 * sr); i += 1) {
    samples[i] = Math.round(14000 * Math.sin((2 * Math.PI * 250 * i) / sr));
  }
  for (let i = Math.floor(0.6 * sr); i < Math.floor(0.9 * sr); i += 1) {
    samples[i] = Math.round(14000 * Math.sin((2 * Math.PI * 2400 * i) / sr));
  }
  const wav = makeWavBuffer(samples, sr);
  const decoded = readWavPcm(wav);
  assert.equal(decoded.sampleRate, sr);
  const [spStart, spEnd] = detectSpeechBounds(decoded.samples, sr);
  assert.ok(spStart >= 220 && spStart <= 280, `spStart ${spStart}`);
  assert.ok(spEnd >= 880 && spEnd <= 930, `spEnd ${spEnd}`);

  const frames = analyzeAudioFrames(decoded.samples, sr, 60);
  assert.equal(frames.length, 60);
  assert.equal(frames[3].open, 0);
  assert.ok(frames[25].open > 0.5, `speech open ${frames[25].open}`);
  assert.ok(frames[45].width > frames[25].width + 0.2, `high ZCR width ${frames[45].width} > low ZCR ${frames[25].width}`);
});

test('tts supports safe command templates, pronunciation substitution, caching and timing.json output', async () => {
  assert.equal(toSpoken('返回 HTTP 304。', [{ term: 'HTTP', reading: 'H T T P' }]).spoken, '返回 H T T P 三百零四。');
  assert.deepEqual(splitCommandTemplate('edge-tts --voice "zh-CN-XiaoxiaoNeural" --text {text} --write-media {out} --write-subtitles {sub}'),
    ['edge-tts', '--voice', 'zh-CN-XiaoxiaoNeural', '--text', '{text}', '--write-media', '{out}', '--write-subtitles', '{sub}']);

  const dir = mkdtempSync(join(tmpdir(), 'svs-tts-test-'));
  try {
    const p = minimal();
    // Create a local node script that writes a valid 0.5s WAV + VTT subtitle (no network, no shell injection)
    const fakeTts = join(dir, 'fake-tts.mjs');
    writeFileSync(fakeTts, `
      import { writeFileSync } from 'node:fs';
      const args = process.argv.slice(2);
      const text = args[0], out = args[1], sub = args[2];
      const sr = 48000, n = 24000;
      const buf = Buffer.alloc(44 + n * 2);
      buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
      buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
      buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
      buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
      for (let i = 2400; i < 21600; i++) buf.writeInt16LE(Math.round(8000 * Math.sin(2 * Math.PI * 300 * i / sr)), 44 + i * 2);
      writeFileSync(out, buf);
      writeFileSync(sub, 'WEBVTT\\n\\n00:00:00.050 --> 00:00:00.450\\n' + text + '\\n');
    `);
    p.voice = { provider: 'command', command: `${process.execPath} ${fakeTts} {text} {out} {sub}` };
    const timing = await synthesizeProject(p, dir);
    assert.ok(timing['s01-0'] && timing['s01-1']);
    assert.equal(timing['s01-0'].source, 'provider');
    assert.ok(timing['s01-0'].duration_ms >= 440 && timing['s01-0'].duration_ms <= 510, `trimmed duration ${timing['s01-0'].duration_ms}`);
    assert.ok(timing['s01-0'].words.length > 1, 'subdivides single-cue sentence VTT into weighted words');
    const saved = JSON.parse(readFileSync(join(dir, 'audio/timing.json'), 'utf8'));
    assert.equal(saved['s01-0'].file, 'audio/s01-0.wav');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('natural phrasing: variable punctuation pauses, clause splitting, silence trim fade, and edge-tts rate formatting', () => {
  const gap = 250;
  assert.ok(sentencePauseMs('普通陈述句。', { baseGapMs: gap }) >= 250);
  assert.ok(sentencePauseMs('还要从头下载吗？', { baseGapMs: gap }) > sentencePauseMs('普通陈述句。', { baseGapMs: gap }));
  assert.ok(sentencePauseMs('太快了！', { baseGapMs: gap }) > sentencePauseMs('普通陈述句。', { baseGapMs: gap }));
  assert.ok(sentencePauseMs('最后一句。', { baseGapMs: gap, sectionEnd: true }) > sentencePauseMs('还要从头下载吗？', { baseGapMs: gap }));

  assert.deepEqual(splitClauses('你昨天见过的这张图标，今天再打开，还要从头下载吗？'), [
    '你昨天见过的这张图标，',
    '今天再打开，',
    '还要从头下载吗？',
  ]);
  assert.deepEqual(splitClauses('我们跟着它走两趟。'), ['我们跟着它走两趟。']);

  assert.equal(speedToEdgeRate(1), '+0%');
  assert.equal(speedToEdgeRate(0.95), '-5%');
  assert.equal(speedToEdgeRate(1.08), '+8%');

  const sr = 48000;
  const padded = new Float32Array(sr); // 1s: 0.3s silence + 0.3s speech + 0.4s silence
  for (let i = Math.floor(0.3 * sr); i < Math.floor(0.6 * sr); i += 1) {
    padded[i] = 0.4 * Math.sin((2 * Math.PI * 300 * i) / sr);
  }
  const trimmed = trimSilenceWithFade(padded, sr);
  assert.ok(trimmed.length < padded.length * 0.5, `trimmed dead silence: ${trimmed.length} vs ${padded.length}`);
  assert.ok(Math.abs(trimmed[0]) < 1e-4 && Math.abs(trimmed.at(-1)) < 1e-4, 'fade-in/out avoids clicks');
});

test('doctor reports environment capabilities cleanly and never crashes when tools are missing', async () => {
  const report = await runDoctor();
  assert.equal(report.l0_ready, true);
  assert.equal(typeof report.l1_ready, 'boolean');
  assert.ok(report.checks.node.ok);
  const missing = await runDoctor({ ffmpeg: 'no-such-ffmpeg', ffprobe: 'no-such-ffprobe' });
  assert.equal(missing.l0_ready, true);
  assert.equal(missing.l1_ready, false);
  assert.ok(missing.missing.includes('ffmpeg'));
});

test('estimated word times weigh a number by how it is read, and cue.at keeps the display text (字幕与转场设计 §3.3)', () => {
  // 15.07% is read 百分之十五点零七: 8 characters against 1 for 涨.
  assert.deepEqual(estimateWords('涨15.07%。', 0, 900), [
    { text: '涨', start_ms: 0, end_ms: 100 },
    { text: '15.07%', start_ms: 100, end_ms: 900 },
  ]);
  // 创业板涨 is 4 of 12 spoken characters, so 11.61% starts a third of the way in.
  const entry = { text: '创业板涨11.61%。', speech: [0, 1200], durationMs: 1200, words: [] };
  assert.deepEqual(resolveAnchorMs(entry, '11.61%'), { offsetMs: 400, source: 'estimate' });
});

test('provider word times on the voice text map back to the display words, and a mismatch returns null', () => {
  const s = '创业板涨11.61%，科创50大涨。';
  const { spans } = toSpoken(s, [{ term: '科创50', reading: '科创五零' }]);
  const provider = [
    { text: '创业板涨', start_ms: 0, end_ms: 800 },
    { text: '百分之十一点六一', start_ms: 800, end_ms: 2400 },
    { text: '科创五零大涨', start_ms: 2700, end_ms: 3600 },
  ];
  assert.deepEqual(displayWords(provider, s, spans), [
    { text: '创', start_ms: 0, end_ms: 200 },
    { text: '业', start_ms: 200, end_ms: 400 },
    { text: '板', start_ms: 400, end_ms: 600 },
    { text: '涨', start_ms: 600, end_ms: 800 },
    { text: '11.61%', start_ms: 800, end_ms: 2400 },
    { text: '科创50', start_ms: 2700, end_ms: 3300 },
    { text: '大', start_ms: 3300, end_ms: 3450 },
    { text: '涨', start_ms: 3450, end_ms: 3600 },
  ]);
  assert.equal(displayWords([{ text: '别的文字', start_ms: 0, end_ms: 100 }], s, spans), null);
});

test('the voice reads numbers in Chinese while timing.json keeps the display words (字幕与转场设计 §3.3)', async () => {
  for (const mismatch of [false, true]) {
    const dir = mkdtempSync(join(tmpdir(), 'svs-tts-spoken-'));
    try {
      const p = minimal();
      p.sections[0].text = '沪指涨3.7%。答案藏在阳光里。';
      // A local fake voice: records the text it was given, writes 0.5 s of tone and a two-cue VTT. With `mismatch`
      // the cues carry other words, as an engine that rewrote the text would.
      const fakeTts = join(dir, 'fake-tts.mjs');
      writeFileSync(fakeTts, `
        import { appendFileSync, writeFileSync } from 'node:fs';
        const [text, out, sub, mode] = process.argv.slice(2);
        appendFileSync(${JSON.stringify(join(dir, 'said.txt'))}, text + '\\n');
        const sr = 48000, n = 24000;
        const buf = Buffer.alloc(44 + n * 2);
        buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
        buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
        buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
        buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
        for (let i = 2400; i < 21600; i++) buf.writeInt16LE(Math.round(8000 * Math.sin(2 * Math.PI * 300 * i / sr)), 44 + i * 2);
        writeFileSync(out, buf);
        const [a, b] = mode === 'mismatch' ? ['甲乙', '丙丁'] : [text.slice(0, 2), text.slice(2)];
        writeFileSync(sub, 'WEBVTT\\n\\n00:00:00.050 --> 00:00:00.150\\n' + a + '\\n\\n00:00:00.150 --> 00:00:00.450\\n' + b + '\\n');
      `);
      p.voice = { provider: 'command', command: `${process.execPath} ${fakeTts} {text} {out} {sub}${mismatch ? ' mismatch' : ''}` };
      const timing = await synthesizeProject(p, dir);
      assert.deepEqual(readFileSync(join(dir, 'said.txt'), 'utf8').trim().split('\n'), ['沪指涨百分之三点七。', '答案藏在阳光里。']);
      assert.equal(timing['s01-0'].cache_key, sentenceHash('沪指涨百分之三点七。', p.voice));
      assert.equal(timing['s01-0'].source, 'provider');
      assert.deepEqual(timing['s01-0'].words.map((w) => w.text), ['沪', '指', '涨', '3.7%'], mismatch ? 'mismatch falls back to the estimate' : 'mapped');
      assert.deepEqual(timing['s01-1'].words.map((w) => w.text), [...'答案藏在阳光里']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

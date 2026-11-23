// T05 / A05: imported and synthesized section audio, section-local alignment mapped to master samples,
// manual correction of low-confidence words, and subtitle/viseme tracks derived from one alignment revision.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, makeProject, runCliAsync, writeJson, writeWav } from './helpers.mjs';
import { createSession } from '../../runtime/approvals.ts';
import { startProvider } from './fake-provider.mjs';

const ID = 'cache-audio';
const sha = (bytes) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
let n = 0;
async function call(project, op, request, env = {}) {
  const path = writeJson(join(project, 'requests', `${String(n++).padStart(3, '0')}-${op}.json`), request);
  return runCliAsync([op, '--project', project, '--request', path], env);
}
async function ok(promise) {
  const result = await promise;
  assert.equal(result.code, 0, result.stdout + result.stderr);
  return result.json;
}
const version = async (project) => (await call(project, 'status', { project_id: ID })).json.version;
const envelope = async (project, key) => ({ project_id: ID, expected_version: await version(project), idempotency_key: key });
const event = async (project, name) => ok(call(project, 'event', { ...(await envelope(project, name)), event: name, payload: {} }));

const SECTIONS = [
  { section_id: 'sec_001', title: '开场', narration: '先看第一段。', claim_ids: [], pronunciation: [], visual_intent: '标题卡', duration_estimate_frames: 30, cues: [] },
  { section_id: 'sec_002', title: '副本', narration: '浏览器有副本，再看副本是否新鲜。', claim_ids: [], pronunciation: [{ term: '副本', reading: 'fù běn' }],
    visual_intent: '副本卡片', duration_estimate_frames: 60, cues: [{ cue_id: 'cue_copy_1', text: '副本' }, { cue_id: 'cue_copy_2', text: '副本' }] },
];

// A draft project at AUDIO_RUNNING with the two-section script above.
async function audioProject() {
  const project = makeProject();
  await ok(call(project, 'init', { project_id: ID, title: '缓存与副本', mode: 'draft' }));
  const brief = JSON.parse(readFileSync(join(ROOT, 'examples', 'topic-cache-speed', 'brief.json'), 'utf8'));
  await ok(call(project, 'brief', { ...(await envelope(project, 'brief')), topic: brief.topic, audience: brief.audience, scope: brief.scope,
    keywords: brief.keywords, language: brief.language, style_profile: brief.style_profile, overrides: { duration_target_seconds: 60 } }));
  await event(project, 'research_started');
  const evidence = JSON.parse(readFileSync(join(ROOT, 'examples', 'topic-cache-speed', 'evidence-set.json'), 'utf8'));
  await ok(call(project, 'evidence', { ...(await envelope(project, 'evidence')), sources: evidence.sources,
    claims: evidence.claims.map(({ claim_id, statement, qualifier }) => ({ claim_id, statement, qualifier })), links: evidence.claim_source_links }));
  await event(project, 'draft_script_requested');
  await ok(call(project, 'script', { ...(await envelope(project, 'script')), script_id: 'episode', sections: SECTIONS }));
  await event(project, 'draft_audio_requested');
  return project;
}

const VOICE = 'asset://cache-audio/voice-owner/v1';
async function importBoth(project) {
  const first = writeWav(join(project, 'incoming', 'sec_001.wav'), { seconds: 1 });
  const second = writeWav(join(project, 'incoming', 'sec_002.wav'), { seconds: 2 });
  const saved = await ok(call(project, 'audio', { ...(await envelope(project, 'audio-1')), sections: [
    { section_id: 'sec_001', import: { path: 'incoming/sec_001.wav', recordist: 'owner', voice_ref: VOICE } },
    { section_id: 'sec_002', import: { path: 'incoming/sec_002.wav', recordist: 'owner', voice_ref: VOICE } }] }));
  return { saved, files: [first, second] };
}

// Aligner output per section with timestamps reset to zero at each chunk; sec_002 starts at master sample 48,000.
const words = (lowConfidence = 0.95) => [
  { section_id: 'sec_001', words: [['先', 0, 8000], ['看', 8000, 16000], ['第一段', 16000, 40000]].map(([text, start_sample, end_sample]) => ({ text, start_sample, end_sample, confidence: 0.95 })) },
  { section_id: 'sec_002', words: [['浏览器', 2400, 12000], ['有', 12000, 16000], ['副本', 16000, 26000], ['再', 30000, 34000], ['看', 34000, 38000],
    ['副本', 38000, 48000, lowConfidence], ['是否', 48000, 56000], ['新鲜', 56000, 70000]]
    .map(([text, start_sample, end_sample, confidence = 0.95]) => ({ text, start_sample, end_sample, confidence })) },
];
const alignRequest = async (project, key, extra = {}) => ({ ...(await envelope(project, key)), audio_version: 1,
  engine: { name: 'owner-aligner', version: '1.0' }, sections: words(), subtitle_style_ref: 'asset://cache-audio/subtitle-style/v1', ...extra });

test('imported section WAVs keep original bytes and get contiguous master sample ranges', async () => {
  const project = await audioProject();
  writeWav(join(project, 'incoming', 'cd.wav'), { seconds: 1, rate: 44100 });
  writeWav(join(project, 'incoming', 'sec_002.wav'), { seconds: 2 });
  const rejected = await call(project, 'audio', { ...(await envelope(project, 'audio-0')), sections: [
    { section_id: 'sec_001', import: { path: 'incoming/cd.wav', recordist: 'owner', voice_ref: VOICE } },
    { section_id: 'sec_002', import: { path: 'incoming/sec_002.wav', recordist: 'owner', voice_ref: VOICE } }] });
  assert.deepEqual(rejected.json.issues.map((item) => [item.code, item.section_id]), [['AUDIO_SAMPLE_RATE', 'sec_001']]);
  assert.equal(rejected.json.state, 'AUDIO_RUNNING');

  const { saved, files } = await importBoth(project);
  const manifest = saved.document;
  assert.deepEqual(manifest.segments.map((s) => [s.section_id, s.start_sample, s.end_sample, s.origin, s.provider_or_recordist]),
    [['sec_001', 0, 48000, 'import', 'owner'], ['sec_002', 48000, 144000, 'import', 'owner']]);
  assert.deepEqual([manifest.sample_rate_hz, manifest.duration_samples, manifest.script_version], [48000, 144000, 1]);
  assert.deepEqual(saved.assets.filter((a) => a.kind === 'voice-take').map((a) => a.sha256), files.map((file) => sha(readFileSync(file))));
  const master = saved.assets.find((a) => a.asset_ref === manifest.master_ref);
  assert.equal(readFileSync(join(project, master.path)).length, 44 + 144000 * 2);
  assert.equal(saved.state, 'AUDIO_READY');
});

test('section-local word samples map to master samples and repeated terms keep distinct IDs', async () => {
  const project = await audioProject();
  await importBoth(project);
  const saved = await ok(call(project, 'align', await alignRequest(project, 'align-1')));
  const tokens = saved.document.alignment.tokens;
  const first = tokens.find((t) => t.word_id === 'sec_002-w001');
  assert.deepEqual([first.text, first.start_sample, first.end_sample], ['浏览器', 50400, 60000]);
  assert.deepEqual(saved.document.alignment.cue_map, [{ cue_id: 'cue_copy_1', word_ids: ['sec_002-w003'] }, { cue_id: 'cue_copy_2', word_ids: ['sec_002-w006'] }]);
  assert.deepEqual(saved.document.subtitles.cues.map((c) => [c.section_id, c.range, c.text, c.cue_ids]),
    [['sec_001', { start: 0, end: 25 }, '先看第一段。', []], ['sec_002', { start: 32, end: 74 }, '浏览器有副本，再看副本是否新鲜。', ['cue_copy_1', 'cue_copy_2']]]);
  assert.match(saved.srt, /^1\n00:00:00,000 --> 00:00:00,833\n先看第一段。\n\n2\n00:00:01,067 --> 00:00:02,467\n/);
  assert.equal(saved.state, 'ALIGNMENT_READY');

  const mismatch = await audioProject();
  await importBoth(mismatch);
  const request = await alignRequest(mismatch, 'align-x');
  request.sections[1].words[2].text = '缓存';
  const wrong = await call(mismatch, 'align', request);
  assert.deepEqual(wrong.json.issues.map((item) => [item.code, item.section_id]), [['ALIGNMENT_TEXT_MISMATCH', 'sec_002']]);
});

test('low-confidence words block until manually corrected; captions and visemes follow the corrected revision', async () => {
  const project = await audioProject();
  await importBoth(project);
  const blocked = await call(project, 'align', { ...(await alignRequest(project, 'align-1')), sections: words(0.4) });
  assert.equal(blocked.code, 1, blocked.stdout);
  assert.deepEqual(blocked.json.issues.map((item) => [item.code, item.word_id, item.confidence, item.start_sample, item.end_sample]),
    [['ALIGNMENT_LOW_CONFIDENCE', 'sec_002-w006', 0.4, 86000, 96000]]);
  assert.equal(blocked.json.state, 'AUDIO_READY');

  const corrected = await ok(call(project, 'align', { ...(await alignRequest(project, 'align-2')), sections: words(0.4),
    corrections: [{ word_id: 'sec_002-w006', start_sample: 86400, end_sample: 96000, note: '试听后后移 8 ms' }],
    marks: [{ word_id: 'sec_002-w006', viseme: 'closed' }] }));
  const doc = corrected.document;
  const token = doc.alignment.tokens.find((t) => t.word_id === 'sec_002-w006');
  assert.deepEqual([token.start_sample, token.end_sample, token.confidence, token.manually_corrected], [86400, 96000, 0.4, true]);
  assert.deepEqual(doc.corrections, [{ word_id: 'sec_002-w006', from: { start_sample: 86000, end_sample: 96000 }, to: { start_sample: 86400, end_sample: 96000 },
    origin: 'manual', note: '试听后后移 8 ms' }]);
  assert.deepEqual([doc.subtitles.alignment_version, doc.visemes.alignment_version], [doc.alignment.version, doc.alignment.version]);
  const ranges = doc.visemes.ranges;
  assert.deepEqual([ranges[0].range.start, ranges.at(-1).range.end], [0, 90]);
  assert.ok(ranges.every((r, i) => i === 0 || r.range.start === ranges[i - 1].range.end));
  assert.deepEqual(ranges.find((r) => r.word_id === 'sec_002-w006'), { word_id: 'sec_002-w006', shape: 'closed', range: { start: 54, end: 60 } });
  assert.ok(ranges.some((r) => r.shape === 'rest'));
});

test('synthesized takes reuse budget, idempotency and reconciliation and share the imported downstream contract', async () => {
  const project = await audioProject();
  const provider = await startProvider({ dropReceipt: true });
  try {
    const env = { SVS_PROVIDER_URL: provider.url };
    const owner = createSession(project, { reviewer_id: 'owner', kind: 'human' });
    await ok(call(project, 'budget', { project_id: ID, currency: 'CNY', project_limit_minor: 1000 }, { SVS_SESSION_TOKEN: owner }));
    const tts = (key, section_id, pronunciation) => call(project, 'tts', { project_id: ID, idempotency_key: key, section_id, voice_ref: VOICE,
      provider: 'test-provider', quote_minor: 70, ...(pronunciation && { pronunciation }) }, env);
    const lost = await tts('tts-1', 'sec_001');
    assert.equal(lost.json.status, 'UNKNOWN', lost.stdout);
    provider.dropReceipt = false;
    const reconciled = await ok(call(project, 'reconcile', { project_id: ID, idempotency_key: 'tts-1' }, env));
    assert.equal(reconciled.take.section_id, 'sec_001');
    const take2 = await ok(tts('tts-2', 'sec_002'));
    const take3 = await ok(tts('tts-3', 'sec_002', [{ term: '副本', reading: 'fù běn（重读）' }]));
    assert.notEqual(take2.take.pronunciation_hash, take3.take.pronunciation_hash);
    await ok(tts('tts-3', 'sec_002', [{ term: '副本', reading: 'fù běn（重读）' }]));
    assert.equal(provider.counts.posts, 3);

    const saved = await ok(call(project, 'audio', { ...(await envelope(project, 'audio-tts')), sections: [
      { section_id: 'sec_001', job: 'tts-1' }, { section_id: 'sec_002', job: 'tts-3' }] }));
    assert.deepEqual(saved.document.segments.map((s) => [s.section_id, s.origin, s.provider_or_recordist, s.voice_ref]),
      [['sec_001', 'tts', 'test-provider', VOICE], ['sec_002', 'tts', 'test-provider', VOICE]]);
    assert.deepEqual(Object.keys(saved.document.segments[0]).sort(), ['audio_ref', 'end_sample', 'origin', 'provider_or_recordist', 'section_id', 'settings_ref', 'start_sample', 'voice_ref']);
    const ledger = await ok(call(project, 'ledger', { project_id: ID }));
    assert.deepEqual([ledger.spent_minor, ledger.held_minor], [180, 0]);
  } finally {
    await provider.close();
  }
});

test('calibration reports median and nearest-rank P95 over at least 100 labeled anchors', async () => {
  const project = await audioProject();
  await importBoth(project);
  await ok(call(project, 'align', await alignRequest(project, 'align-1')));
  const boundaries = [['sec_001-w001', 0], ['sec_002-w001', 50400], ['sec_002-w008', 104000]];
  const anchors = Array.from({ length: 100 }, (_, i) => {
    const [word_id, sample] = boundaries[i % 3];
    return { word_id, boundary: 'start', labeled_sample: sample + i * 48, subset: i % 2 ? 'mixed-language' : 'names' };
  });
  const report = await ok(call(project, 'calibrate', { project_id: ID, alignment_version: 1, anchors }));
  assert.deepEqual([report.n, report.median_ms, report.p95_ms], [100, 49.5, 94]);
  assert.deepEqual(report.subsets.names.n, 50);
  assert.deepEqual(report.initial_goal, { median_ms: 80, p95_ms: 150 });
  assert.equal(report.decision, null);
  const few = await call(project, 'calibrate', { project_id: ID, alignment_version: 1, anchors: anchors.slice(0, 99) });
  assert.deepEqual(few.json.issues.map((item) => [item.code, item.n]), [['CALIBRATION_ANCHORS_INSUFFICIENT', 99]]);
});

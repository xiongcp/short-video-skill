// Rebuild A05 runtime evidence with synthetic speech-like WAVs, fixture aligner output and the local provider endpoint.
// Project A: G1/G2 (simulated owner) → imported WAVs → low-confidence block → manual correction → captions/visemes/SRT → calibration math.
// Project B: G2 → TTS through the T03 job path with a lost receipt and a pronunciation retake of one section → same downstream contract.
// Not covered: real voice, a real aligner and hand-labeled anchors on real speech (A05 calibration stays NOT_RUN).
// usage: node docs/upgrade/evidence/replay_t05.mjs <run_id> [python]
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, join, relative } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ROOT, makeProject, runCliAsync, writeJson, writeWav } from '../../../tests/runtime/helpers.mjs';
import { startProvider } from '../../../tests/runtime/fake-provider.mjs';
import { createSession } from '../../../runtime/approvals.ts';

const [runId, python = 'python3'] = process.argv.slice(2);
if (!runId) throw new Error('usage: replay_t05.mjs <run_id> [python]');
const out = join(ROOT, 'docs', 'upgrade', 'evidence', 'runs', runId, 'A05');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'audit'), { recursive: true });
const sha256 = (data) => 'sha256:' + createHash('sha256').update(data).digest('hex');
const save = (name, value) => writeFileSync(join(out, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
const example = (name) => JSON.parse(readFileSync(join(ROOT, 'examples', 'topic-cache-speed', `${name}.json`), 'utf8'));
const audit = [];
let seq = 0;

function projectFor(id) {
  const dir = makeProject();
  const call = async (label, op, request, env = {}, session = null) => {
    const n = seq++;
    const run = await runCliAsync([op, '--project', dir, '--request', writeJson(join(dir, 'requests', `${n}.json`), request)], env);
    const entry = { seq: n, project_id: id, label, op, session, request, exit_code: run.code, response: run.json };
    writeFileSync(join(out, 'audit', `${String(n).padStart(3, '0')}-${id}-${label}.json`), JSON.stringify(entry, null, 2) + '\n');
    audit.push(entry);
    return run.json;
  };
  const env = async (key) => ({ project_id: id, expected_version: (await call(`status-${key}`, 'status', { project_id: id })).version, idempotency_key: key });
  const event = async (name) => call(name, 'event', { ...(await env(name)), event: name, payload: {} });
  return { id, dir, call, env, event };
}

const SECTIONS = [
  { section_id: 'sec_001', title: '开场', narration: '先看第一段。', claim_ids: [], pronunciation: [], visual_intent: '标题卡', duration_estimate_frames: 30, cues: [] },
  { section_id: 'sec_002', title: '副本', narration: '浏览器有副本，再看副本是否新鲜。', claim_ids: [], pronunciation: [{ term: '副本', reading: 'fù běn' }],
    visual_intent: '副本卡片', duration_estimate_frames: 60, cues: [{ cue_id: 'cue_copy_1', text: '副本' }, { cue_id: 'cue_copy_2', text: '副本' }] },
];

// Quality path through G1 and G2 with a simulated owner session, ending at AUDIO_RUNNING.
async function toAudio(p) {
  await p.call('init', 'init', { project_id: p.id, title: '缓存与副本', mode: 'quality' });
  const owner = createSession(p.dir, { reviewer_id: 'owner', kind: 'human' });
  const brief = example('brief');
  await p.call('brief', 'brief', { ...(await p.env('brief')), topic: brief.topic, audience: brief.audience, scope: brief.scope, keywords: brief.keywords,
    language: brief.language, style_profile: brief.style_profile, overrides: { duration_target_seconds: 60 } });
  await p.event('research_started');
  const base = example('evidence-set');
  const evidence = await p.call('evidence', 'evidence', { ...(await p.env('evidence')), sources: base.sources,
    claims: base.claims.map(({ claim_id, statement, qualifier }) => ({ claim_id, statement, qualifier })), links: base.claim_source_links });
  await p.call('g1', 'decide', { ...(await p.env('g1')), gate: 'G1', target_hash: evidence.content_hash, decision: 'approve', notes: '' }, { SVS_SESSION_TOKEN: owner }, 'human:owner');
  await p.event('research_accepted');
  const script = await p.call('script', 'script', { ...(await p.env('script')), script_id: 'episode', sections: SECTIONS });
  await p.call('g2', 'decide', { ...(await p.env('g2')), gate: 'G2', target_hash: script.content_hash, decision: 'approve', notes: '文稿与 60 秒目标确认' }, { SVS_SESSION_TOKEN: owner }, 'human:owner');
  await p.event('script_accepted');
  return owner;
}

const engineWords = (low) => [
  { section_id: 'sec_001', words: [['先', 0, 8000], ['看', 8000, 16000], ['第一段', 16000, 40000]].map(([text, s, e]) => ({ text, start_sample: s, end_sample: e, confidence: 0.95 })) },
  { section_id: 'sec_002', words: [['浏览器', 2400, 12000], ['有', 12000, 16000], ['副本', 16000, 26000], ['再', 30000, 34000], ['看', 34000, 38000],
    ['副本', 38000, 48000, low], ['是否', 48000, 56000], ['新鲜', 56000, 70000]].map(([text, s, e, c = 0.95]) => ({ text, start_sample: s, end_sample: e, confidence: c })) },
];
const align = async (p, key, audioVersion, extra = {}) => p.call(key, 'align', { ...(await p.env(key)), audio_version: audioVersion, engine: { name: 'fixture-aligner', version: '0' },
  sections: engineWords(0.4), subtitle_style_ref: `asset://${p.id}/subtitle-style/v1`, ...extra });
const correction = { corrections: [{ word_id: 'sec_002-w006', start_sample: 86400, end_sample: 96000, note: '试听后后移 8 ms' }], marks: [{ word_id: 'sec_002-w006', viseme: 'closed' }] };

// A: imported takes.
const a = projectFor('import-path');
await toAudio(a);
const voice = `asset://${a.id}/voice-owner/v1`;
writeWav(join(a.dir, 'incoming', 'sec_001.wav'), { seconds: 1 });
writeWav(join(a.dir, 'incoming', 'sec_002.wav'), { seconds: 2 });
writeWav(join(a.dir, 'incoming', 'cd-44k.wav'), { seconds: 1, rate: 44100 });
const takes = (first) => [{ section_id: 'sec_001', import: { path: `incoming/${first}`, recordist: 'owner', voice_ref: voice } },
  { section_id: 'sec_002', import: { path: 'incoming/sec_002.wav', recordist: 'owner', voice_ref: voice } }];
const rate44 = await a.call('audio-44k-rejected', 'audio', { ...(await a.env('audio-44k')), sections: takes('cd-44k.wav') });
const audioA = await a.call('audio-import', 'audio', { ...(await a.env('audio-1')), sections: takes('sec_001.wav') });
const blocked = await align(a, 'align-low-confidence', 1);
const alignedA = await align(a, 'align-corrected', 1, correction);
const anchorWords = [['sec_001-w001', 0], ['sec_002-w001', 50400], ['sec_002-w008', 104000]];
const anchors = Array.from({ length: 100 }, (_, i) => ({ word_id: anchorWords[i % 3][0], boundary: 'start', labeled_sample: anchorWords[i % 3][1] + i * 48,
  subset: i % 2 ? 'mixed-language' : 'names' }));
const calibration = await a.call('calibrate-synthetic', 'calibrate', { project_id: a.id, alignment_version: 1, anchors });
const tooFew = await a.call('calibrate-99', 'calibrate', { project_id: a.id, alignment_version: 1, anchors: anchors.slice(0, 99) });

// B: synthesized takes through the paid-job path.
const b = projectFor('tts-path');
const provider = await startProvider({ dropReceipt: true });
const ownerB = await toAudio(b);
const penv = { SVS_PROVIDER_URL: provider.url };
await b.call('budget', 'budget', { project_id: b.id, currency: 'CNY', project_limit_minor: 1000 }, { SVS_SESSION_TOKEN: ownerB }, 'human:owner');
const tts = (label, key, section_id, pronunciation) => b.call(label, 'tts', { project_id: b.id, idempotency_key: key, section_id, voice_ref: `asset://${b.id}/voice-licensed/v1`,
  provider: 'test-provider', quote_minor: 70, ...(pronunciation && { pronunciation }) }, penv);
const lost = await tts('tts-sec_001-receipt-lost', 'tts-1', 'sec_001');
const resubmit = await tts('tts-sec_001-resubmit', 'tts-1', 'sec_001');
provider.dropReceipt = false;
const reconciled = await b.call('reconcile-tts-1', 'reconcile', { project_id: b.id, idempotency_key: 'tts-1' }, penv);
const take2 = await tts('tts-sec_002', 'tts-2', 'sec_002');
const take3 = await tts('tts-sec_002-pronunciation-fix', 'tts-3', 'sec_002', [{ term: '副本', reading: 'fù běn（重读）' }]);
const counts = { ...provider.counts };
const audioB = await b.call('audio-tts', 'audio', { ...(await b.env('audio-1')), sections: [{ section_id: 'sec_001', job: 'tts-1' }, { section_id: 'sec_002', job: 'tts-3' }] });
const ledgerB = await b.call('ledger', 'ledger', { project_id: b.id });
await provider.close();
save('provider-counts.json', counts);
save('provider-requests.json', provider.log);

// Artifacts: documents, the SRT, master WAVs and their probes.
save('audio-manifest-import.json', audioA.document);
save('audio-manifest-tts.json', audioB.document);
save('alignment.json', alignedA.document.alignment);
save('subtitles.json', alignedA.document.subtitles);
save('visemes.json', alignedA.document.visemes);
save('corrections.json', { engine: alignedA.document.engine, corrections: alignedA.document.corrections, blocked_issues: blocked.issues });
save('subtitles.srt', alignedA.srt);
save('calibration-synthetic.json', calibration);
save('tool-results.json', audit.filter((e) => e.response?.tool_result).map((e) => e.response.tool_result));
const probes = {};
for (const [name, p, manifest] of [['master-import.wav', a, audioA.document], ['master-tts.wav', b, audioB.document]]) {
  const asset = [...audioA.assets, ...audioB.assets].find((x) => x.asset_ref === manifest.master_ref);
  copyFileSync(join(p.dir, asset.path), join(out, name));
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,sample_rate,channels,duration_ts', '-of', 'json', join(out, name)], { encoding: 'utf8' });
  probes[name] = { exit_code: probe.status, ...JSON.parse(probe.stdout || '{}'), asset_sha256: asset.sha256 };
}
save('media-probe.json', probes);

const tables = {};
for (const p of [a, b]) {
  const db = new DatabaseSync(join(p.dir, 'studio.sqlite'));
  db.exec(`VACUUM INTO '${join(out, `${p.id}.sqlite`)}'`);
  tables[p.id] = {
    content: db.prepare('SELECT kind, version, hash, event_id FROM content ORDER BY kind, version').all(),
    assets: db.prepare('SELECT asset_ref, kind, path, sha256, meta FROM assets ORDER BY asset_ref').all(),
    approvals: db.prepare('SELECT gate, decision, target_hash, reviewer_id FROM approvals ORDER BY version').all(),
    jobs: db.prepare('SELECT idempotency_key, tool, state, quote_minor, cost_minor, external_receipt FROM jobs ORDER BY created_at').all(),
    events: db.prepare('SELECT version, event, from_state, to_state, actor FROM events ORDER BY version').all(),
  };
  db.close();
  rmSync(p.dir, { recursive: true, force: true });
}
save('tables.json', tables);

const rel = (name) => JSON.stringify(relative(ROOT, join(out, name)));
const check = spawnSync(python, ['-B', '-c', [
  'import json, sys', "sys.path.insert(0, 'evals')", 'from check_design import read_schemas, validate_contract', 'schemas, registry = read_schemas()',
  `for name, file in (('audio-manifest', ${rel('audio-manifest-import.json')}), ('audio-manifest', ${rel('audio-manifest-tts.json')}), ('workflow#Alignment', ${rel('alignment.json')}), ('workflow#SubtitleTrack', ${rel('subtitles.json')})):`,
  '    validate_contract(json.load(open(file)), name, schemas, registry); print(f"{file} valid against {name}")',
  `rows = json.load(open(${rel('tool-results.json')}))`, "[validate_contract(row, 'workflow#ToolResult', schemas, registry) for row in rows]",
  "print(f'{len(rows)} tool results valid against workflow#ToolResult')"].join('\n')], { cwd: ROOT, encoding: 'utf8' });
save('schema-check.txt', check.stdout + check.stderr);

const token = (id) => alignedA.document.alignment.tokens.find((t) => t.word_id === id);
const ranges = alignedA.document.visemes.ranges;
const keys = (s) => Object.keys(s).sort().join(',');
const checks = {
  rate_44k_rejected: rate44.issues?.[0]?.code === 'AUDIO_SAMPLE_RATE',
  master_samples: audioA.document.duration_samples === 144000 && probes['master-import.wav'].streams?.[0]?.sample_rate === '48000' && probes['master-import.wav'].streams[0].duration_ts === 144000,
  local_to_master: token('sec_002-w001').start_sample === 50400,
  repeated_terms_distinct: JSON.stringify(alignedA.document.alignment.cue_map.map((c) => c.word_ids)) === '[["sec_002-w003"],["sec_002-w006"]]',
  low_confidence_blocked: blocked.issues?.[0]?.code === 'ALIGNMENT_LOW_CONFIDENCE' && blocked.state === 'AUDIO_READY',
  correction_recorded: token('sec_002-w006').manually_corrected === true && alignedA.document.corrections[0]?.from.start_sample === 86000,
  tracks_same_revision: alignedA.document.subtitles.alignment_version === alignedA.document.alignment.version && alignedA.document.visemes.alignment_version === alignedA.document.alignment.version,
  visemes_contiguous: ranges[0].range.start === 0 && ranges.at(-1).range.end === 90 && ranges.every((r, i) => !i || r.range.start === ranges[i - 1].range.end),
  calibration_math: calibration.median_ms === 49.5 && calibration.p95_ms === 94 && tooFew.issues?.[0]?.code === 'CALIBRATION_ANCHORS_INSUFFICIENT',
  unknown_not_resubmitted: lost.status === 'UNKNOWN' && resubmit.status === 'UNKNOWN' && reconciled.take?.section_id === 'sec_001',
  retake_one_section: counts.posts === 3 && take2.take.pronunciation_hash !== take3.take.pronunciation_hash,
  same_contract: keys(audioA.document.segments[0]) === keys(audioB.document.segments[0]) && audioB.document.segments.every((s) => s.origin === 'tts'),
  charged_once_each: ledgerB.spent_minor === 180 && ledgerB.held_minor === 0,
  schemas_valid: check.status === 0,
};
const files = (d) => readdirSync(d).flatMap((name) => statSync(join(d, name)).isDirectory() ? files(join(d, name)) : [join(d, name)]);
const record = {
  task_id: 'T05', case_id: 'A05', run_id: runId, status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL', evidence_level: 'RUNTIME',
  environment: { node: process.version, platform: `${process.platform}-${process.arch}`, python: spawnSync(python, ['--version'], { encoding: 'utf8' }).stdout.trim(),
    ffprobe: spawnSync('ffprobe', ['-version'], { encoding: 'utf8' }).stdout.split('\n')[0], provider: 'local HTTP test endpoint tests/runtime/fake-provider.mjs (simulated TTS vendor, no real money)' },
  commands_and_exit_codes: [
    { command: `node docs/upgrade/evidence/replay_t05.mjs ${runId} ${basename(python)}`, note: 'each CLI call is saved under audit/ with request, exit code and response' },
    { command: `${basename(python)} -B -c <validate manifests, Alignment, SubtitleTrack and tool results>`, exit_code: check.status, saved_as: 'schema-check.txt' },
    { command: 'ffprobe -v error -show_entries stream=codec_name,sample_rate,channels,duration_ts -of json <master.wav>', saved_as: 'media-probe.json' },
  ],
  input_hashes: ['examples/topic-cache-speed/brief.json', 'examples/topic-cache-speed/evidence-set.json', 'workflows/topic-to-video.yaml', 'policies/permissions.yaml']
    .map((path) => ({ path, sha256: sha256(readFileSync(join(ROOT, path))) })),
  output_hashes: files(out).map((path) => ({ path: relative(out, path), sha256: sha256(readFileSync(path)) })),
  observations: [
    `checks: ${JSON.stringify(checks)}`,
    `import manifest ${audioA.content_hash}; alignment revision ${alignedA.content_hash}; tts manifest ${audioB.content_hash}`,
    `measured ${audioA.measured_frames} frames vs planned ${audioA.planned_frames} (difference ${audioA.difference_frames})`,
    `synthetic calibration (offsets 0–99 ms by construction): median ${calibration.median_ms} ms, P95 ${calibration.p95_ms} ms; this verifies the arithmetic only`,
    'scope: WAVs are synthetic 220 Hz speech-like tones, aligner output is a fixture, the TTS vendor is a local test endpoint and G1/G2 sessions are created by this script; real Chinese speech (b/p/m, English abbreviations, numbers, pauses), a real aligner, 100 hand-labeled anchors and the owner calibration decision are NOT_RUN',
  ],
  evidence_paths: files(out).map((path) => relative(ROOT, path)),
  reviewer: null,
};
save('record.json', record);
console.log(JSON.stringify({ status: record.status, checks, calls: audit.length }));

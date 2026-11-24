// Default narration voice, converted with FFmpeg to the project's audio contract (48 kHz, 16-bit PCM WAV, mono) and
// imported with `audio` like any recording; the recordist field names the engine and voice so provenance stays visible.
//
// Engines:
//   kokoro (default) — Kokoro-82M v1.1-zh (Apache-2.0) through kokoro-onnx, run locally by kokoro_tts.py. Mixed
//     Chinese/English text; section `pronunciation` readings replace terms before phonemization. Setup, once:
//       uv venv --python 3.12 ~/.cache/short-video-skill/tts-venv
//       VIRTUAL_ENV=~/.cache/short-video-skill/tts-venv uv pip install kokoro-onnx==0.6.1 'misaki[en,zh]==0.9.4' soundfile
//       VIRTUAL_ENV=~/.cache/short-video-skill/tts-venv ~/.cache/short-video-skill/tts-venv/bin/python -m spacy download en_core_web_sm
//       model-files-v1.1/kokoro-v1.1-zh.onnx and voices-v1.1-zh.bin from github.com/thewh1teagle/kokoro-onnx/releases
//       into ~/.cache/short-video-skill/kokoro-v1.1-zh   (override with SVS_TTS_PYTHON / SVS_KOKORO_DIR)
//   macos-say — the macOS Mandarin system voice (`say -v Tingting`), licensed with macOS; check that licence before
//     publishing or commercial use.
//
//   node assets/default-voice/voice.ts --text "大家好" --out sample.wav [--engine kokoro|macos-say] [--voice zf_001] [--speed 0.9]
//   node assets/default-voice/voice.ts --script script.json --project <dir>     (writes <dir>/incoming/<section_id>.wav)
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';

export const DEFAULT_ENGINE = 'kokoro', DEFAULT_VOICE = 'zf_001', DEFAULT_SPEED = 0.9, SAY_VOICE = 'Tingting';
const CACHE = join(homedir(), '.cache', 'short-video-skill');
export const KOKORO = {
  python: process.env.SVS_TTS_PYTHON ?? join(CACHE, 'tts-venv', 'bin', 'python'),
  models: process.env.SVS_KOKORO_DIR ?? join(CACHE, 'kokoro-v1.1-zh'),
  script: join(import.meta.dirname, 'kokoro_tts.py'),
};
export const kokoroAvailable = () => existsSync(KOKORO.python)
  && ['kokoro-v1.1-zh.onnx', 'voices-v1.1-zh.bin'].every((f) => existsSync(join(KOKORO.models, f)));

export interface VoiceOptions { engine?: 'kokoro' | 'macos-say'; voice?: string; speed?: number; seed?: number; pronunciation?: { term: string; reading: string }[] }

const run = (cmd: string, args: string[], input?: string) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', input, maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stderr || r.error}`);
  return r.stdout;
};

export function synthesize(text: string, outPath: string, options: VoiceOptions = {}) {
  const engine = options.engine ?? DEFAULT_ENGINE;
  const work = mkdtempSync(join(tmpdir(), 'svs-voice-'));
  try {
    let raw: string, meta: Record<string, unknown>;
    if (engine === 'kokoro') {
      const voice = options.voice ?? DEFAULT_VOICE, speed = options.speed ?? DEFAULT_SPEED, seed = options.seed ?? 0;
      raw = join(work, 'take.wav');
      const out = JSON.parse(run(KOKORO.python, ['-I', KOKORO.script],
        JSON.stringify({ text, voice, speed, seed, model_dir: KOKORO.models, out: raw, pronunciation: options.pronunciation ?? [] })).trim().split('\n').at(-1)!);
      meta = { engine, model: 'kokoro-v1.1-zh', model_sha256: out.model_sha256, voices_sha256: out.voices_sha256, voice, speed, seed,
        text, reading_text: out.reading_text, phonemes: out.phonemes };
    } else {
      const voice = options.voice ?? SAY_VOICE;
      raw = join(work, 'take.aiff');
      run('say', ['-v', voice, '-o', raw, '--', text]);
      meta = { engine, voice, os_version: run('sw_vers', ['-productVersion']).trim(), text };
    }
    mkdirSync(dirname(outPath), { recursive: true });
    run('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le',
      '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', outPath]);
    const bytes = readFileSync(outPath);
    const dataAt = bytes.indexOf('data', 12, 'ascii');
    return { ...meta, samples: bytes.readUInt32LE(dataAt + 4) / 2, sha256: 'sha256:' + createHash('sha256').update(bytes).digest('hex') } as Record<string, any>;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// One take per script section, written under <project>/<folder>/<section_id>.wav, as `audio` import entries.
export function sectionTakes(script: { sections: { section_id: string; narration: string; pronunciation?: { term: string; reading: string }[] }[] },
  project: string, folder = 'incoming', options: VoiceOptions = {}, voiceRef?: string) {
  const engine = options.engine ?? DEFAULT_ENGINE, voice = options.voice ?? (engine === 'kokoro' ? DEFAULT_VOICE : SAY_VOICE);
  return script.sections.map(({ section_id, narration, pronunciation }) => {
    const path = `${folder}/${section_id}.wav`;
    const provenance = synthesize(narration, join(project, path), { ...options, pronunciation: [...(pronunciation ?? []), ...(options.pronunciation ?? [])] });
    return { section_id, import: { path, recordist: `${engine}:${voice}`, ...(voiceRef && { voice_ref: voiceRef }) }, provenance };
  });
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { text: { type: 'string' }, out: { type: 'string' }, script: { type: 'string' },
    project: { type: 'string' }, engine: { type: 'string', default: DEFAULT_ENGINE }, voice: { type: 'string' }, speed: { type: 'string' },
    'voice-ref': { type: 'string' } } });
  const options: VoiceOptions = { engine: values.engine as VoiceOptions['engine'], voice: values.voice, speed: values.speed ? Number(values.speed) : undefined };
  if (values.text && values.out) {
    console.log(JSON.stringify(synthesize(values.text, values.out, options), null, 2));
  } else if (values.script && values.project) {
    const script = JSON.parse(readFileSync(values.script, 'utf8'));
    const takes = sectionTakes(script.document ?? script, values.project, 'incoming', options, values['voice-ref']);
    writeFileSync(join(values.project, 'incoming', 'voice-takes.json'), JSON.stringify(takes, null, 2) + '\n');
    console.log(JSON.stringify(takes.map(({ section_id, import: imp }) => ({ section_id, import: imp })), null, 2));
  } else {
    console.error('usage: voice.ts --text <text> --out <wav> | --script <script.json> --project <dir> [--engine kokoro|macos-say] [--voice zf_001] [--speed 0.9] [--voice-ref asset://…]');
    process.exit(2);
  }
}

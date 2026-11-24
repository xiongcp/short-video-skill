// Default narration voice: the macOS Mandarin system voice (`say -v Tingting`; a bare "Flo" resolves to the English voice), converted with FFmpeg to the project's audio
// contract (48 kHz, 16-bit PCM WAV, mono). Takes are imported with `audio` like any recording; the recordist field names
// the engine and voice so provenance stays visible. Apple's system voices are licensed with macOS; check that licence
// before publishing or commercial use.
//   node assets/default-voice/voice.ts --text "大家好" --out sample.wav
//   node assets/default-voice/voice.ts --script script.json --project <dir>     (writes <dir>/incoming/<section_id>.wav)
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';

export const DEFAULT_VOICE = 'Tingting';
const run = (cmd: string, args: string[]) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stderr || r.error}`);
  return r.stdout;
};

export function synthesize(text: string, outPath: string, voice = DEFAULT_VOICE) {
  const work = mkdtempSync(join(tmpdir(), 'svs-voice-'));
  try {
    const aiff = join(work, 'take.aiff');
    run('say', ['-v', voice, '-o', aiff, '--', text]);
    mkdirSync(dirname(outPath), { recursive: true });
    run('ffmpeg', ['-v', 'error', '-y', '-i', aiff, '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le',
      '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', outPath]);
    const bytes = readFileSync(outPath);
    const dataAt = bytes.indexOf('data', 12, 'ascii');
    return {
      engine: 'macos-say', voice, os_version: run('sw_vers', ['-productVersion']).trim(), text,
      samples: bytes.readUInt32LE(dataAt + 4) / 2, sha256: 'sha256:' + createHash('sha256').update(bytes).digest('hex'),
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// One take per script section, written under <project>/<folder>/<section_id>.wav, as `audio` import entries.
export function sectionTakes(script: { sections: { section_id: string; narration: string }[] }, project: string, folder = 'incoming',
  voice = DEFAULT_VOICE, voiceRef?: string) {
  return script.sections.map(({ section_id, narration }) => {
    const path = `${folder}/${section_id}.wav`;
    const provenance = synthesize(narration, join(project, path), voice);
    return { section_id, import: { path, recordist: `macos-say:${voice}`, ...(voiceRef && { voice_ref: voiceRef }) }, provenance };
  });
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { text: { type: 'string' }, out: { type: 'string' }, script: { type: 'string' },
    project: { type: 'string' }, voice: { type: 'string', default: DEFAULT_VOICE }, 'voice-ref': { type: 'string' } } });
  if (values.text && values.out) {
    console.log(JSON.stringify(synthesize(values.text, values.out, values.voice), null, 2));
  } else if (values.script && values.project) {
    const script = JSON.parse(readFileSync(values.script, 'utf8'));
    const takes = sectionTakes(script.document ?? script, values.project, 'incoming', values.voice, values['voice-ref']);
    writeFileSync(join(values.project, 'incoming', 'voice-takes.json'), JSON.stringify(takes, null, 2) + '\n');
    console.log(JSON.stringify(takes.map(({ section_id, import: imp }) => ({ section_id, import: imp })), null, 2));
  } else {
    console.error('usage: voice.ts --text <text> --out <wav> | --script <script.json> --project <dir> [--voice Tingting] [--voice-ref asset://…]');
    process.exit(2);
  }
}

// Rebuild A01 evidence: fixture project -> doctor (font present / moved, zh-CN + en) -> preview -> Python media check.
// usage: node docs/upgrade/evidence/replay_t01.mjs <run_id> [python]
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { ROOT, installFont, makeProject, realFont, writeJson, writeWav } from '../../../tests/runtime/helpers.mjs';

const [runId, python = 'python3'] = process.argv.slice(2);
if (!runId || !realFont) throw new Error('usage: replay_t01.mjs <run_id> [python]; a real font must exist on this host');
const out = join(ROOT, 'docs', 'upgrade', 'evidence', 'runs', runId, 'A01');
const project = makeProject();
const sha256 = (path) => 'sha256:' + createHash('sha256').update(readFileSync(path)).digest('hex');
const scrub = (text) => text.replaceAll(project, '<project>').replaceAll(ROOT + '/', '');
const commands = [];

function run(save, command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8' });
  commands.push({ command: scrub([command === process.execPath ? 'node' : basename(command), ...args].join(' ')), exit_code: result.status, saved_as: save });
  writeFileSync(join(out, save), scrub(result.stdout));
  return result;
}
const cli = (save, op, request, lang) => run(save, process.execPath,
  ['--experimental-strip-types', '--no-warnings', 'runtime/cli.ts', op, '--project', project, '--request', request, ...(lang ? ['--lang', lang] : [])]);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const font = installFont(project, 'assets/fonts/caption-zh.ttc');
const wav = writeWav(join(project, 'audio', 'tech.wav'), { seconds: 12 });
const doctorRequest = writeJson(join(project, 'requests', 'doctor.json'), { fonts: [{ id: 'caption-zh', path: 'assets/fonts/caption-zh.ttc' }] });
const previewRequest = writeJson(join(project, 'requests', 'preview.json'), { audio: 'audio/tech.wav' });
const inputs = [{ path: 'audio/tech.wav', sha256: sha256(wav) }, { path: 'assets/fonts/caption-zh.ttc', source: realFont, sha256: sha256(font), redistributed: false }];

cpSync(join(project, 'requests'), join(out, 'requests'), { recursive: true });
cli('doctor-ready.json', 'doctor', doctorRequest);
renameSync(font, font + '.moved');
cli('doctor-missing-font.zh-CN.json', 'doctor', doctorRequest, 'zh-CN');
cli('doctor-missing-font.en.json', 'doctor', doctorRequest, 'en');
const previewRun = cli('preview-report.json', 'preview', previewRequest);
cpSync(join(project, 'renders'), join(out, 'renders'), { recursive: true });
run('media-check.json', python, ['-B', 'evals/check_design.py', '--media', relative(ROOT, join(out, 'renders', 't01', 'master.mp4')), '--profile', 'short']);

const files = (dir) => readdirSync(dir).flatMap((name) => statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : [join(dir, name)]);
const preview = JSON.parse(readFileSync(join(out, 'preview-report.json'), 'utf8'));
const media = JSON.parse(readFileSync(join(out, 'media-check.json'), 'utf8'));
const version = (cmd) => spawnSync(cmd, ['-version'], { encoding: 'utf8' }).stdout.split('\n')[0];
const record = {
  task_id: 'T01', case_id: 'A01', run_id: runId,
  status: previewRun.status === 0 && preview.status === 'PASS' ? 'PASS' : 'FAIL',
  evidence_level: 'RUNTIME',
  environment: { node: process.version, platform: `${process.platform}-${process.arch}`, ffmpeg: version('ffmpeg'), ffprobe: version('ffprobe'),
    python: spawnSync(python, ['--version'], { encoding: 'utf8' }).stdout.trim(), graphics_backend: 'software-rgb24' },
  commands_and_exit_codes: commands,
  input_hashes: inputs,
  output_hashes: files(out).map((path) => ({ path: relative(out, path), sha256: sha256(path) })),
  observations: [
    `timeline ${preview.timeline.frames} frames / ${preview.timeline.samples} samples; decoded ${preview.timeline.decoded_frames} frames`,
    `media check issues: ${JSON.stringify(media.issues)} (technical clip is exempt from the 60 s short minimum per A01)`,
    'character layer is the procedural placeholder host, not original art; the caption font is a host system font and is not redistributed',
  ],
  evidence_paths: files(out).map((path) => relative(ROOT, path)),
  reviewer: null,
};
writeFileSync(join(out, 'record.json'), JSON.stringify(record, null, 2) + '\n');
rmSync(project, { recursive: true, force: true });
console.log(JSON.stringify({ status: record.status, out: relative(ROOT, out) }));

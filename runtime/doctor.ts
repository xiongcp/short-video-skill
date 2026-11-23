// Environment probe: tools, encoders, graphics backend and project fonts, reported as capabilities.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

type Status = 'READY' | 'BLOCKED';
interface FontRef { id: string; path: string }
interface Issue { code: string; capability: string; ref?: string }

export function tool(name: string, args: string[]) {
  try {
    const run = spawnSync(name, args, { encoding: 'utf8' });
    if (run.error || run.status !== 0) return null;
    return run.stdout;
  } catch {
    return null;
  }
}

export const toolVersion = (name: string) => tool(name, ['-hide_banner', '-version'])?.split('\n')[0] ?? null;

export function doctor(project: string, request: { fonts?: FontRef[] }) {
  const issues: Issue[] = [];
  const ffmpegVersion = toolVersion('ffmpeg');
  const ffprobeVersion = toolVersion('ffprobe');
  const encoders = tool('ffmpeg', ['-hide_banner', '-encoders']) ?? '';
  const has = (name: string) => new RegExp(`^\\s*\\S+\\s+${name}\\s`, 'm').test(encoders);

  const capability = (name: string, ok: boolean, code: string, extra: object = {}) => {
    if (!ok) issues.push({ code, capability: name });
    return { status: (ok ? 'READY' : 'BLOCKED') as Status, ...extra };
  };

  const missingFonts = (request.fonts ?? []).filter((font) => !existsSync(join(project, font.path)))
    .map(({ id, path }) => ({ id, path }));
  for (const font of missingFonts) issues.push({ code: 'FONT_MISSING', capability: 'captions', ref: font.id });

  const capabilities = {
    graphics: { status: 'READY' as Status, backend: 'software-rgb24', engine: `node ${process.version}` },
    video_encode: capability('video_encode', has('libx264'), 'ENCODER_MISSING', { encoder: 'libx264' }),
    audio_encode: capability('audio_encode', has('aac'), 'ENCODER_MISSING', { encoder: 'aac' }),
    media_probe: capability('media_probe', ffprobeVersion !== null, 'FFPROBE_MISSING'),
    captions: { status: (missingFonts.length ? 'BLOCKED' : 'READY') as Status, missing_fonts: missingFonts },
  };
  const blocked = Object.values(capabilities).some((item) => item.status !== 'READY');
  return {
    report: {
      schema: 'doctor-report/v1',
      status: blocked ? 'DEGRADED' : 'READY',
      tools: { node: process.version, ffmpeg: ffmpegVersion, ffprobe: ffprobeVersion, platform: `${process.platform}-${process.arch}` },
      capabilities,
      issues,
    },
    exitCode: blocked ? 1 : 0,
  };
}

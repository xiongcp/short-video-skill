// generate_tts: one fixed script section → a voice take, charged and reconciled through the T03 job path
// (budget reservation, idempotency key, no resubmission of UNKNOWN). The take is stored when the job settles.
import { registerAsset, sha256, assetByMeta } from '../../runtime/assets.ts';
import { latest } from '../../runtime/content.ts';
import { type JobRow, onArtifact, submitJob } from '../../runtime/jobs.ts';
import { type Outcome, getProject, openStore, requestHash, summary } from '../../runtime/project-store.ts';

export interface TtsRequest {
  project_id: string; idempotency_key: string; section_id: string; voice_ref: string; provider: string; quote_minor: number;
  pronunciation?: { term: string; reading: string }[];
}

onArtifact('generate_tts', {
  store(db, project, job: JobRow, data) {
    const payload = JSON.parse(job.payload);
    // Only intents created by generateTts carry the section input; a raw `submit` of generate_tts stores no take.
    if (!payload.input?.section_id || data?.artifact?.media_type !== 'audio/wav' || typeof data.artifact.data_base64 !== 'string') return;
    registerAsset(db, project, job.project_id, `take-${payload.input.section_id}`, 'voice-take', 'wav', Buffer.from(data.artifact.data_base64, 'base64'), {
      section_id: payload.input.section_id, origin: 'tts', provider: job.provider, job_id: job.job_id, voice_ref: payload.input.voice_ref,
      pronunciation_hash: payload.input.pronunciation_hash, text_hash: sha256(payload.text), script_version: payload.script_version,
    });
  },
  describe(db, job) {
    const asset = assetByMeta(db, job.project_id, 'job_id', job.job_id);
    return asset ? { take: { asset_ref: asset.asset_ref, sha256: asset.sha256, section_id: asset.meta.section_id, pronunciation_hash: asset.meta.pronunciation_hash } } : {};
  },
});

export async function generateTts(project: string, request: TtsRequest): Promise<Outcome> {
  const db = openStore(project);
  const reject = (issue: { code: string } & Record<string, unknown>) => summary(db, request.project_id, 'REJECTED', [issue]);
  const current = getProject(db, request.project_id);
  if (!current) return reject({ code: 'PROJECT_NOT_FOUND', ref: request.project_id });
  if (current.state !== 'AUDIO_RUNNING') return reject({ code: 'AUDIO_STAGE_REQUIRED', state: current.state });
  const script = latest(db, request.project_id, 'script')!;
  const section = script.document.sections.find((s: any) => s.section_id === request.section_id);
  if (!section) return reject({ code: 'SECTION_UNKNOWN', section_id: request.section_id });
  const pronunciation = request.pronunciation ?? section.pronunciation;
  const input = { script_ref: `asset://${request.project_id}/script/v${script.version}`, section_id: section.section_id, voice_ref: request.voice_ref,
    pronunciation_hash: requestHash(pronunciation) };
  return submitJob(project, { project_id: request.project_id, idempotency_key: request.idempotency_key, skill_id: 'audio-production', tool: 'generate_tts',
    provider: request.provider, quote_minor: request.quote_minor, payload: { input, text: section.narration, pronunciation, script_version: script.version } });
}

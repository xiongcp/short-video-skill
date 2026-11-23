// Project asset index: immutable files under <project>/assets/<name>/v<N>.<ext>, addressed as asset://<project_id>/<name>/v<N>.
// Files are written to a temporary name and renamed before the index row is inserted in the caller's transaction.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve as resolvePath, sep } from 'node:path';
import { humanSession } from './approvals.ts';
import { type Db, type Issue, type Outcome, getProject, newId, openStore, summary, transaction } from './project-store.ts';

export interface AssetRow { asset_ref: string; name: string; version: number; kind: string; path: string; sha256: string; meta: any }
export const sha256 = (bytes: Buffer | string) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');

export const nextVersion = (db: Db, projectId: string, name: string) =>
  (db.prepare('SELECT COALESCE(MAX(version), 0) + 1 AS next FROM assets WHERE project_id = ? AND name = ?').get(projectId, name) as { next: number }).next;

export const ASSET_NAME = /^[a-z][a-z0-9_-]*$/;

export function registerAsset(db: Db, project: string, projectId: string, name: string, kind: string, ext: string, bytes: Buffer | string, meta: object): AssetRow {
  // Last line of defence: callers validate names and report issues; a name that could leave assets/ is a bug.
  if (!ASSET_NAME.test(name) || !/^[a-z]+$/.test(ext)) throw new Error(`invalid asset name or extension: ${JSON.stringify(name)}.${ext}`);
  const next = nextVersion(db, projectId, name);
  const path = join('assets', name, `v${next}.${ext}`);
  mkdirSync(join(project, 'assets', name), { recursive: true });
  writeFileSync(join(project, path + '.tmp'), bytes);
  renameSync(join(project, path + '.tmp'), join(project, path));
  const row = { asset_ref: `asset://${projectId}/${name}/v${next}`, name, version: next, kind, path, sha256: sha256(bytes), meta };
  db.prepare('INSERT INTO assets (asset_ref, project_id, name, version, kind, path, sha256, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(row.asset_ref, projectId, name, next, kind, path, row.sha256, JSON.stringify(meta), new Date().toISOString());
  return row;
}

const parse = (row: any): AssetRow | undefined => row && { ...row, meta: JSON.parse(row.meta) };
export const getAsset = (db: Db, ref: string) => parse(db.prepare('SELECT asset_ref, name, version, kind, path, sha256, meta FROM assets WHERE asset_ref = ?').get(ref));
export const assetByMeta = (db: Db, projectId: string, key: string, value: string) =>
  parse(db.prepare(`SELECT asset_ref, name, version, kind, path, sha256, meta FROM assets WHERE project_id = ? AND json_extract(meta, '$.' || ?) = ? ORDER BY version DESC LIMIT 1`)
    .get(projectId, key, value));

// Bytes of an indexed asset, or undefined if the file no longer matches its recorded hash.
export function readAsset(project: string, asset: AssetRow) {
  const bytes = readFileSync(join(project, asset.path));
  return sha256(bytes) === asset.sha256 ? bytes : undefined;
}

// ---- Asset catalog operations (T06): register with rights, human usage clearance, scene templates, formal preflight.

const KINDS = new Set(['character', 'rig', 'voice', 'background', 'diagram', 'illustration', 'font', 'audio', 'video', 'other', 'foreground']);
const PROFILE_KEYS = ['character_id', 'style_lock', 'rig_ref', 'voice_ref', 'supported_angles', 'expressions', 'gestures', 'parameters'];
const FRAME = { width: 1920, height: 1080 };
export const SAFE_AREA = { left: 0.07, top: 0.07, right: 0.93, bottom: 0.85 };
// Layer roles per template, in z order; the host itself is bound per shot through its CharacterProfile.
const TEMPLATES: Record<string, { roles: string[]; props: string[] }> = {
  host: { roles: ['background'], props: ['camera', 'board'] },
  diagram: { roles: ['background', 'diagram'], props: ['board'] },
  illustration: { roles: ['background', 'illustration'], props: ['board'] },
};

// Media type, file extension and pixel size from the bytes themselves; JSON specs are resolution-independent.
function media(bytes: Buffer): { media_type: string; ext: string; width?: number; height?: number; vector?: boolean } {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { media_type: 'image/png', ext: 'png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (bytes.toString('ascii', 0, 4) === 'RIFF') return { media_type: 'audio/wav', ext: 'wav' };
  try { JSON.parse(bytes.toString('utf8')); return { media_type: 'application/json', ext: 'json', vector: true }; } catch { return { media_type: 'application/octet-stream', ext: 'bin' }; }
}

export const usageOf = (db: Db, ref: string) =>
  (db.prepare('SELECT usage FROM asset_usage WHERE asset_ref = ? ORDER BY rowid DESC LIMIT 1').get(ref) as { usage: string } | undefined)?.usage ?? 'pending';
const recordUsage = (db: Db, ref: string, usage: string, reviewer: string, session: string | null, notes: string) =>
  db.prepare('INSERT INTO asset_usage (usage_id, asset_ref, usage, reviewer_id, session_id, notes, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(newId('use'), ref, usage, reviewer, session, notes, new Date().toISOString());
const view = (db: Db, asset: AssetRow) => ({ asset_ref: asset.asset_ref, kind: asset.kind, sha256: asset.sha256, media: asset.meta.media, usage: usageOf(db, asset.asset_ref) });

export interface RegisterRequest {
  project_id: string; name: string; kind: string; path: string;
  rights: { holder: string; license: string; source: string; original: boolean }; profile?: Record<string, unknown>;
}

// New bytes under a name become the next version (usage pending); identical bytes replay the latest version.
export function registerOp(project: string, request: RegisterRequest): Outcome {
  const db = openStore(project);
  return transaction(db, () => {
    const reject = (issue: Issue) => summary(db, request.project_id, 'REJECTED', [issue]);
    if (!getProject(db, request.project_id)) return reject({ code: 'PROJECT_NOT_FOUND', ref: request.project_id });
    if (!KINDS.has(request.kind) || !ASSET_NAME.test(request.name ?? '')) return reject({ code: 'ASSET_KIND_INVALID', kind: request.kind, name: request.name });
    if (!request.rights?.holder || !request.rights?.license) return reject({ code: 'RIGHTS_REQUIRED', name: request.name });
    if (request.kind === 'character' && !PROFILE_KEYS.every((key) => request.profile?.[key] !== undefined)) return reject({ code: 'PROFILE_INVALID', name: request.name });
    const file = resolvePath(project, request.path);
    if (!file.startsWith(resolvePath(project) + sep)) return reject({ code: 'ASSET_PATH_INVALID', ref: request.path });
    const bytes = readFileSync(file);
    const info = media(bytes);
    if (request.kind === 'diagram' && info.vector && !Array.isArray(JSON.parse(bytes.toString('utf8')).elements)) return reject({ code: 'DIAGRAM_SPEC_INVALID', name: request.name });
    const latestRow = db.prepare('SELECT asset_ref FROM assets WHERE project_id = ? AND name = ? ORDER BY version DESC LIMIT 1').get(request.project_id, request.name) as { asset_ref: string } | undefined;
    const previous = latestRow && getAsset(db, latestRow.asset_ref)!;
    if (previous && previous.sha256 === sha256(bytes) && previous.kind === request.kind) return summary(db, request.project_id, 'REPLAYED', [], { asset: view(db, previous) });
    const asset = registerAsset(db, project, request.project_id, request.name, request.kind, info.ext, bytes,
      { kind: request.kind, rights: request.rights, media: info, source_path: request.path, ...(request.profile && { profile: request.profile }) });
    return summary(db, request.project_id, 'REGISTERED', [], { asset: view(db, asset) });
  });
}

export function clearOp(project: string, request: { project_id: string; asset_ref: string; usage: string; notes?: string }, token = process.env.SVS_SESSION_TOKEN): Outcome {
  const db = openStore(project);
  return transaction(db, () => {
    const reject = (issue: Issue) => summary(db, request.project_id, 'REJECTED', [issue]);
    if (!getProject(db, request.project_id)) return reject({ code: 'PROJECT_NOT_FOUND', ref: request.project_id });
    const session = humanSession(db, token);
    if (!session) return reject({ code: 'HUMAN_REQUIRED', action: 'clear_asset_usage' });
    const asset = getAsset(db, request.asset_ref);
    if (!asset) return reject({ code: 'ASSET_NOT_FOUND', asset_ref: request.asset_ref });
    if (!['cleared', 'restricted'].includes(request.usage)) return reject({ code: 'USAGE_INVALID', usage: request.usage });
    recordUsage(db, asset.asset_ref, request.usage, session.reviewer_id, session.session_id, request.notes ?? '');
    return summary(db, request.project_id, 'APPLIED', [], { asset: view(db, asset), reviewer_id: session.reviewer_id });
  });
}

export interface SceneRequest {
  project_id: string; name: string; template: string; focus: string;
  layers: { asset_ref: string; element_ids?: string[]; claim_ids?: string[] }[]; props?: string[];
}

// A Scene document built from a template; its usage is derived (each layer keeps its own clearance).
export function sceneOp(project: string, request: SceneRequest): Outcome {
  const db = openStore(project);
  return transaction(db, () => {
    const reject = (issues: Issue[]) => summary(db, request.project_id, 'REJECTED', issues);
    if (!getProject(db, request.project_id)) return reject([{ code: 'PROJECT_NOT_FOUND', ref: request.project_id }]);
    if (!ASSET_NAME.test(request.name ?? '')) return reject([{ code: 'ASSET_KIND_INVALID', kind: 'scene', name: request.name }]);
    const template = TEMPLATES[request.template];
    if (!template) return reject([{ code: 'TEMPLATE_UNKNOWN', template: request.template, supported: Object.keys(TEMPLATES).join(', ') }]);
    if (request.layers.length !== template.roles.length) return reject([{ code: 'TEMPLATE_LAYERS_MISMATCH', template: request.template, expected: template.roles.join(', ') }]);
    const issues: Issue[] = request.layers.flatMap((layer, i): Issue[] => {
      const asset = getAsset(db, layer.asset_ref);
      if (!asset) return [{ code: 'ASSET_NOT_FOUND', asset_ref: layer.asset_ref }];
      return asset.kind === template.roles[i] ? [] : [{ code: 'LAYER_KIND_MISMATCH', asset_ref: layer.asset_ref, expected: template.roles[i], kind: asset.kind }];
    });
    if (issues.length) return reject(issues);
    const version = nextVersion(db, request.project_id, request.name);
    const scene = {
      project_id: request.project_id, version, scene_ref: `asset://${request.project_id}/${request.name}/v${version}`, template: request.template, focus: request.focus,
      coordinate_system: 'normalized_top_left', safe_area: SAFE_AREA,
      layers: request.layers.map((layer, z) => ({ asset_ref: layer.asset_ref, role: template.roles[z], z, element_ids: layer.element_ids ?? [], ...(layer.claim_ids && { claim_ids: layer.claim_ids }) })),
      props: request.props ?? template.props,
    };
    const asset = registerAsset(db, project, request.project_id, request.name, 'scene', 'json', JSON.stringify(scene, null, 2),
      { kind: 'scene', rights: { holder: 'project', license: 'derived', source: `template:${request.template}`, original: true }, media: { media_type: 'application/json', vector: true } });
    recordUsage(db, asset.asset_ref, 'cleared', 'system:template', null, 'derived from template; every layer is checked on its own');
    return summary(db, request.project_id, 'CREATED', [], { scene, asset: view(db, asset) });
  });
}

export interface ShotRequest {
  shot_id: string; scene_ref: string; camera: { zoom: number };
  character?: { character_ref: string; angle: string; expression: string; gesture: string; gaze: string };
}

// Formal assembly: every reference pinned to an existing version whose bytes still match and whose usage is cleared.
// Host and diagram shots share this one resolver for scenes, layers, character, rig and voice.
export function preflightOp(project: string, request: { project_id: string; shots: ShotRequest[] }): Outcome {
  const db = openStore(project);
  if (!getProject(db, request.project_id)) return summary(db, request.project_id, 'REJECTED', [{ code: 'PROJECT_NOT_FOUND', ref: request.project_id }]);
  const { issues, resolved } = preflightShots(db, project, request.project_id, request.shots);
  return summary(db, request.project_id, issues.length ? 'REJECTED' : 'READY', issues, { resolved });
}

// Shared by preflight and production compilation (T07).
export function preflightShots(db: Db, project: string, projectId: string, shots: ShotRequest[]) {
  const issues: Issue[] = [];
  const resolved = shots.map((shot) => {
    const pins: object[] = [];
    const resolve = (ref: string) => {
      const asset = getAsset(db, ref);
      if (!asset) { issues.push({ code: 'ASSET_NOT_FOUND', shot_id: shot.shot_id, asset_ref: ref }); return undefined; }
      const bytes = readAsset(project, asset);
      if (!bytes) { issues.push({ code: 'ASSET_FILE_CHANGED', shot_id: shot.shot_id, asset_ref: ref }); return undefined; }
      const usage = usageOf(db, ref);
      if (usage !== 'cleared') issues.push({ code: 'ASSET_NOT_CLEARED', shot_id: shot.shot_id, asset_ref: ref, usage });
      pins.push({ asset_ref: ref, kind: asset.kind, sha256: asset.sha256, usage });
      return { asset, bytes };
    };
    const zoom = shot.camera?.zoom;
    if (typeof zoom !== 'number' || zoom < 1) issues.push({ code: 'CAMERA_INVALID', shot_id: shot.shot_id, zoom });
    const scene = resolve(shot.scene_ref);
    for (const layer of scene ? JSON.parse(scene.bytes.toString('utf8')).layers : []) {
      const found = resolve(layer.asset_ref);
      if (!found || typeof zoom !== 'number') continue;
      const info = found.asset.meta.media;
      // Native coverage of a full-frame layer: output size times maximum zoom.
      const required_width = Math.ceil(FRAME.width * zoom), required_height = Math.ceil(FRAME.height * zoom);
      if (info.width !== undefined && (info.width < required_width || info.height < required_height)) {
        issues.push({ code: 'COVERAGE_INSUFFICIENT', shot_id: shot.shot_id, asset_ref: layer.asset_ref, width: info.width, height: info.height, required_width, required_height, zoom });
      }
      // Diagram elements, scaled about the frame centre by the push-in, must stay inside the safe area.
      if (found.asset.kind === 'diagram' && info.vector) {
        const scale = (value: number) => 0.5 + (value - 0.5) * zoom;
        for (const element of JSON.parse(found.bytes.toString('utf8')).elements) {
          const b = element.box;
          if (scale(b.left) < SAFE_AREA.left || scale(b.top) < SAFE_AREA.top || scale(b.right) > SAFE_AREA.right || scale(b.bottom) > SAFE_AREA.bottom) {
            issues.push({ code: 'ELEMENT_OUTSIDE_SAFE_AREA', shot_id: shot.shot_id, asset_ref: layer.asset_ref, element_id: element.element_id });
          }
        }
      }
    }
    let character: object | undefined;
    if (shot.character) {
      const host = resolve(shot.character.character_ref);
      const profile = host?.asset.meta.profile;
      if (profile) {
        if (!profile.supported_angles.includes(shot.character.angle)) {
          issues.push({ code: 'ANGLE_UNREGISTERED', shot_id: shot.shot_id, asset_ref: shot.character.character_ref, angle: shot.character.angle });
        }
        for (const [field, list] of [['expression', profile.expressions], ['gesture', profile.gestures]] as const) {
          const value = (shot.character as any)[field];
          if (!list.includes(value)) issues.push({ code: 'ACTION_UNREGISTERED', shot_id: shot.shot_id, asset_ref: shot.character.character_ref, field, value });
        }
        resolve(profile.rig_ref);
        resolve(profile.voice_ref);
        character = { project_id: projectId, version: host!.asset.version, character_ref: host!.asset.asset_ref, ...profile };
      }
    }
    return { shot_id: shot.shot_id, scene_ref: shot.scene_ref, zoom, assets: pins as { asset_ref: string; kind: string; sha256: string; usage: string }[], ...(character && { character }) };
  });
  return { issues, resolved };
}

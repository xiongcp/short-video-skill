// Tamper-evident G5 archive packager and restorer (T11, tools/package_project/contract.yaml).
// Verifies G4 & G5 approvals, manifest SHA-256, safe relative paths, and every file's hash after extraction.
import { spawnSync } from 'node:child_process';
import {
  copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix, resolve as resolvePath } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { currentTarget } from '../../runtime/approvals.ts';
import { getAsset, indexAsset, nextVersion, readAsset, sha256 } from '../../runtime/assets.ts';
import { currentBudget } from '../../runtime/ledger.ts';
import { type Issue, type Outcome, getProject, newId, openStore, summary, transaction } from '../../runtime/project-store.ts';

export const PACKAGER = { name: 'tar-gzip-packager', version: '1.0.0' };

export function isSafeRelativePath(rel: string): boolean {
  if (!rel || typeof rel !== 'string') return false;
  if (rel.includes('\0') || rel.includes('\\') || rel.startsWith('/')) return false;
  const parts = rel.split('/');
  if (parts.some((p) => p === '' || p === '.' || p === '..')) return false;
  return posix.normalize(rel) === rel;
}

function runTar(args: string[]) {
  return spawnSync('tar', args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  });
}

function inspectArchiveSafety(archivePath: string): Issue | null {
  const listVerbose = runTar(['-tvzf', archivePath]);
  if (listVerbose.status !== 0) {
    return { code: 'ARCHIVE_VERIFY_FAILED', manifest_hash: 'unknown', detail: listVerbose.stderr.trim() };
  }
  for (const line of listVerbose.stdout.split('\n').filter(Boolean)) {
    const typeChar = line[0];
    if (typeChar !== '-' && typeChar !== 'd') {
      return { code: 'ARCHIVE_PATH_INVALID', path: line.trim() };
    }
  }
  const listNames = runTar(['-tzf', archivePath]);
  if (listNames.status !== 0) {
    return { code: 'ARCHIVE_VERIFY_FAILED', manifest_hash: 'unknown', detail: listNames.stderr.trim() };
  }
  for (const rawEntry of listNames.stdout.split('\n').filter(Boolean)) {
    const clean = rawEntry.replace(/\/$/, '');
    if (!clean || clean === '.') continue;
    if (!isSafeRelativePath(clean)) return { code: 'ARCHIVE_PATH_INVALID', path: rawEntry };
  }
  return null;
}

function copyTree(srcDir: string, dstDir: string) {
  mkdirSync(dstDir, { recursive: true });
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const s = join(srcDir, entry.name);
    const d = join(dstDir, entry.name);
    if (entry.isDirectory()) copyTree(s, d);
    else if (entry.isFile()) copyFileSync(s, d);
  }
}

export interface PackageRequest {
  project_id: string;
  manifest_ref: string;
  manifest_hash: string;
  g5_approval_id: string;
}

export function packageOp(project: string, request: PackageRequest): Outcome {
  const db = openStore(project);
  const id = request.project_id;
  const reject = (issues: Issue[]) => summary(db, id, 'REJECTED', issues);
  const projectRow = getProject(db, id);
  if (!projectRow) return reject([{ code: 'PROJECT_NOT_FOUND', ref: id }]);
  if (projectRow.mode !== 'quality') return reject([{ code: 'DRAFT_EXPORT_FORBIDDEN', mode: projectRow.mode }]);
  if (projectRow.state !== 'PACKAGING') {
    return reject([{ code: 'TRANSITION_INVALID', state: projectRow.state, event: 'package', mode: projectRow.mode }]);
  }

  const manifestAsset = getAsset(db, request.manifest_ref);
  if (!manifestAsset) return reject([{ code: 'ASSET_NOT_FOUND', shot_id: 'manifest', asset_ref: request.manifest_ref }]);

  let rawManifestBytes: Buffer;
  try {
    rawManifestBytes = readFileSync(join(project, manifestAsset.path));
  } catch {
    return reject([{ code: 'ASSET_FILE_CHANGED', shot_id: 'manifest', asset_ref: request.manifest_ref }]);
  }

  const actualManifestHash = sha256(rawManifestBytes);
  const g5Target = currentTarget(db, id, 'G5');
  if (actualManifestHash !== request.manifest_hash || actualManifestHash !== manifestAsset.sha256 || (g5Target && actualManifestHash !== g5Target)) {
    return reject([{
      code: 'MANIFEST_HASH_MISMATCH',
      manifest_ref: request.manifest_ref,
      expected_hash: g5Target ?? request.manifest_hash,
      actual_hash: actualManifestHash,
    }]);
  }

  const g5Row = db.prepare(`SELECT approval_id, project_id, version, gate, target_hash, reviewer_id, decision, recorded_at, notes
    FROM approvals WHERE project_id = ? AND approval_id = ?`).get(id, request.g5_approval_id) as any;
  if (!g5Row || g5Row.gate !== 'G5' || g5Row.decision !== 'approve') {
    return reject([{ code: 'APPROVAL_MISSING', gate: 'G5', current_target_hash: actualManifestHash }]);
  }
  if (g5Row.target_hash !== actualManifestHash) {
    return reject([{ code: 'APPROVAL_TARGET_MISMATCH', gate: 'G5', target_hash: g5Row.target_hash, current_target_hash: actualManifestHash }]);
  }

  const manifest = JSON.parse(rawManifestBytes.toString('utf8'));

  // Re-verify G4 approval is non-stale and matches the final master on disk.
  const g4Target = currentTarget(db, id, 'G4');
  const g4Row = db.prepare(`SELECT approval_id, target_hash, decision FROM approvals WHERE project_id = ? AND approval_id = ?`)
    .get(id, manifest.g4_approval_id) as any;
  const masterAsset = getAsset(db, manifest.final_media_ref);
  const masterBytes = masterAsset && readAsset(project, masterAsset);
  if (!masterAsset || !masterBytes) {
    return reject([{ code: 'ASSET_FILE_CHANGED', shot_id: 'master', asset_ref: manifest.final_media_ref }]);
  }
  if (!g4Row || g4Row.decision !== 'approve' || g4Row.target_hash !== g4Target || masterAsset.sha256 !== g4Row.target_hash) {
    return reject([{
      code: 'APPROVAL_STALE', gate: 'G4',
      current_target_hash: masterAsset.sha256,
      approved_target_hash: g4Row?.target_hash ?? g4Target,
    }]);
  }

  // Validate every manifest file path and on-disk SHA-256 before staging.
  const seenPaths = new Set<string>();
  const stagedEntries: { relative_path: string; asset_ref: string; hash: string; bytes: Buffer }[] = [];
  for (const entry of manifest.files ?? []) {
    if (!isSafeRelativePath(entry.relative_path) || seenPaths.has(entry.relative_path)) {
      return reject([{ code: 'ARCHIVE_PATH_INVALID', path: entry.relative_path }]);
    }
    seenPaths.add(entry.relative_path);
    const asset = getAsset(db, entry.asset_ref);
    if (!asset) return reject([{ code: 'ASSET_NOT_FOUND', shot_id: entry.relative_path, asset_ref: entry.asset_ref }]);
    let bytes: Buffer;
    try {
      bytes = readFileSync(join(project, asset.path));
    } catch {
      return reject([{ code: 'ASSET_FILE_CHANGED', shot_id: entry.relative_path, asset_ref: entry.asset_ref }]);
    }
    if (sha256(bytes) !== entry.hash) {
      return reject([{ code: 'ASSET_FILE_CHANGED', shot_id: entry.relative_path, asset_ref: entry.asset_ref }]);
    }
    stagedEntries.push({ relative_path: entry.relative_path, asset_ref: entry.asset_ref, hash: entry.hash, bytes });
  }

  const g5Receipt = {
    project_id: g5Row.project_id,
    version: g5Row.version,
    approval_id: g5Row.approval_id,
    gate: g5Row.gate,
    target_hash: g5Row.target_hash,
    reviewer_id: g5Row.reviewer_id,
    decision: g5Row.decision,
    recorded_at: g5Row.recorded_at,
    notes: g5Row.notes,
  };

  const work = mkdtempSync(join(tmpdir(), 'svs-pkg-'));
  const stageDir = join(work, 'stage');
  const verifyDir = join(work, 'verify');
  const pkgVersion = nextVersion(db, id, 'final_package');
  const archiveRelPath = join('assets', 'final_package', `v${pkgVersion}.tar.gz`);
  const tmpRelPath = `${archiveRelPath}.tmp`;
  const tmpFullPath = join(project, tmpRelPath);
  const finalFullPath = join(project, archiveRelPath);
  mkdirSync(dirname(finalFullPath), { recursive: true });

  try {
    mkdirSync(stageDir, { recursive: true });
    writeFileSync(join(stageDir, 'manifest.json'), rawManifestBytes);
    writeFileSync(join(stageDir, 'g5-receipt.json'), JSON.stringify(g5Receipt, null, 2) + '\n');
    for (const item of stagedEntries) {
      const dest = join(stageDir, item.relative_path);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, item.bytes);
    }

    const topItems = readdirSync(stageDir);
    const pack = runTar(['-czf', tmpFullPath, '-C', stageDir, ...topItems]);
    if (pack.status !== 0) {
      rmSync(tmpFullPath, { force: true });
      return reject([{ code: 'ARCHIVE_VERIFY_FAILED', manifest_hash: actualManifestHash, detail: pack.stderr.trim() }]);
    }

    // Extract and verify every single archived file against ExportManifest and G5 receipt.
    const safetyIssue = inspectArchiveSafety(tmpFullPath);
    if (safetyIssue) {
      rmSync(tmpFullPath, { force: true });
      return reject([safetyIssue]);
    }
    mkdirSync(verifyDir, { recursive: true });
    const unpack = runTar(['-xzf', tmpFullPath, '-C', verifyDir]);
    if (unpack.status !== 0) {
      rmSync(tmpFullPath, { force: true });
      return reject([{ code: 'ARCHIVE_VERIFY_FAILED', manifest_hash: actualManifestHash, detail: unpack.stderr.trim() }]);
    }

    const unpackedManifestHash = sha256(readFileSync(join(verifyDir, 'manifest.json')));
    if (unpackedManifestHash !== actualManifestHash) {
      rmSync(tmpFullPath, { force: true });
      return reject([{ code: 'ARCHIVE_HASH_MISMATCH', path: 'manifest.json', expected: actualManifestHash, actual: unpackedManifestHash }]);
    }
    const unpackedReceipt = JSON.parse(readFileSync(join(verifyDir, 'g5-receipt.json'), 'utf8'));
    if (unpackedReceipt.approval_id !== g5Row.approval_id || unpackedReceipt.target_hash !== actualManifestHash) {
      rmSync(tmpFullPath, { force: true });
      return reject([{ code: 'ARCHIVE_VERIFY_FAILED', manifest_hash: actualManifestHash }]);
    }

    for (const item of stagedEntries) {
      const f = join(verifyDir, item.relative_path);
      if (!existsSync(f)) {
        rmSync(tmpFullPath, { force: true });
        return reject([{ code: 'ARCHIVE_HASH_MISMATCH', path: item.relative_path, expected: item.hash, actual: 'missing' }]);
      }
      const actualHash = sha256(readFileSync(f));
      if (actualHash !== item.hash) {
        rmSync(tmpFullPath, { force: true });
        return reject([{ code: 'ARCHIVE_HASH_MISMATCH', path: item.relative_path, expected: item.hash, actual: actualHash }]);
      }
    }

    const archiveHash = sha256(readFileSync(tmpFullPath));
    renameSync(tmpFullPath, finalFullPath);

    const committed = transaction(db, () => {
      const archiveAsset = indexAsset(db, id, 'final_package', pkgVersion, 'final-package', archiveRelPath, archiveHash, {
        manifest_ref: request.manifest_ref,
        manifest_hash: actualManifestHash,
        g5_approval_id: request.g5_approval_id,
        verified_file_count: stagedEntries.length,
      });
      const pkgRowVersion = Number((db.prepare('SELECT COALESCE(MAX(version), 0) + 1 AS v FROM packages WHERE project_id = ?').get(id) as { v: number }).v);
      const final_package = {
        project_id: id,
        version: pkgRowVersion,
        manifest_hash: actualManifestHash,
        g5_approval_id: request.g5_approval_id,
        archive_ref: archiveAsset.asset_ref,
        archive_hash: archiveHash,
        verified_file_count: stagedEntries.length,
      };
      db.prepare(`INSERT INTO packages (package_id, project_id, version, manifest_hash, g5_approval_id, archive_ref, archive_hash, verified_file_count, verified, body, recorded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`).run(
        newId('pkg'), id, pkgRowVersion, actualManifestHash, request.g5_approval_id,
        archiveAsset.asset_ref, archiveHash, stagedEntries.length, JSON.stringify(final_package), new Date().toISOString(),
      );
      return { archiveAsset, final_package };
    });

    const currency = currentBudget(db, id)?.currency ?? 'CNY';
    const package_project_input = {
      manifest_ref: request.manifest_ref,
      manifest_hash: actualManifestHash,
      g5_approval_id: request.g5_approval_id,
    };
    const tool_result = {
      status: 'succeeded',
      job_id: newId('pkg'),
      artifact_refs: [committed.archiveAsset.asset_ref],
      warnings: [],
      cost: { currency, estimated_minor: 0, actual_minor: 0 },
      retryable: false,
      next_action: 'continue',
    };

    return summary(db, id, 'PACKAGED', [], {
      final_package: committed.final_package,
      package_project_input,
      tool_result,
      archive_ref: committed.archiveAsset.asset_ref,
      archive_path: archiveRelPath,
      archive_hash: archiveHash,
      verified_file_count: stagedEntries.length,
    });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export interface RestoreRequest {
  archive_path: string;
  target_dir: string;
}

export function restoreOp(project: string, request: RestoreRequest): Outcome {
  const archiveAbs = resolvePath(project, request.archive_path);
  const targetAbs = resolvePath(project, request.target_dir);
  const reject = (issues: Issue[]): Outcome => ({
    report: { status: 'REJECTED', project_id: null, state: null, version: null, event_count: 0, issues },
    exitCode: 1,
  });

  if (!existsSync(archiveAbs)) return reject([{ code: 'ARCHIVE_VERIFY_FAILED', manifest_hash: 'missing', detail: archiveAbs }]);
  if (existsSync(targetAbs) && readdirSync(targetAbs).length > 0) {
    return reject([{ code: 'RESTORE_DIR_NOT_EMPTY', target_dir: targetAbs }]);
  }

  const safetyIssue = inspectArchiveSafety(archiveAbs);
  if (safetyIssue) return reject([safetyIssue]);

  const work = mkdtempSync(join(tmpdir(), 'svs-restore-'));
  try {
    const unpack = runTar(['-xzf', archiveAbs, '-C', work]);
    if (unpack.status !== 0) {
      return reject([{ code: 'ARCHIVE_VERIFY_FAILED', manifest_hash: 'unknown', detail: unpack.stderr.trim() }]);
    }
    const manifestPath = join(work, 'manifest.json');
    const receiptPath = join(work, 'g5-receipt.json');
    if (!existsSync(manifestPath) || !existsSync(receiptPath)) {
      return reject([{ code: 'ARCHIVE_VERIFY_FAILED', manifest_hash: 'missing_manifest_or_receipt' }]);
    }

    const manifestBytes = readFileSync(manifestPath);
    const manifestHash = sha256(manifestBytes);
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
    if (receipt.gate !== 'G5' || receipt.decision !== 'approve' || receipt.target_hash !== manifestHash) {
      return reject([{ code: 'ARCHIVE_VERIFY_FAILED', manifest_hash: manifestHash }]);
    }

    const verifiedFiles: { relative_path: string; hash: string }[] = [];
    for (const entry of manifest.files ?? []) {
      if (!isSafeRelativePath(entry.relative_path)) {
        return reject([{ code: 'ARCHIVE_PATH_INVALID', path: entry.relative_path }]);
      }
      const f = join(work, entry.relative_path);
      if (!existsSync(f)) {
        return reject([{ code: 'ARCHIVE_HASH_MISMATCH', path: entry.relative_path, expected: entry.hash, actual: 'missing' }]);
      }
      const actualHash = sha256(readFileSync(f));
      if (actualHash !== entry.hash) {
        return reject([{ code: 'ARCHIVE_HASH_MISMATCH', path: entry.relative_path, expected: entry.hash, actual: actualHash }]);
      }
      verifiedFiles.push({ relative_path: entry.relative_path, hash: actualHash });
    }

    // All files verified; materialize into target_dir.
    copyTree(work, targetAbs);

    // Reopen restored SQLite database read-only (preserving exact file bytes) and verify every indexed asset.
    const restoredProjectDir = join(targetAbs, 'project');
    const db = new DatabaseSync(join(restoredProjectDir, 'studio.sqlite'), { readOnly: true });
    let reopened: Record<string, unknown>;
    try {
      const proj = getProject(db, manifest.project_id);
      if (!proj) return reject([{ code: 'PROJECT_NOT_FOUND', ref: manifest.project_id }]);
      const rows = db.prepare(`SELECT a.asset_ref, a.path, a.sha256 FROM assets a
        LEFT JOIN invalidated_assets inv ON inv.asset_ref = a.asset_ref
        WHERE a.project_id = ? AND inv.asset_ref IS NULL`).all(manifest.project_id) as { asset_ref: string; path: string; sha256: string }[];
      for (const r of rows) {
        const assetFile = join(restoredProjectDir, r.path);
        if (!existsSync(assetFile) || sha256(readFileSync(assetFile)) !== r.sha256) {
          return reject([{ code: 'ARCHIVE_HASH_MISMATCH', path: r.path, expected: r.sha256, actual: 'missing_or_corrupt' }]);
        }
      }
      reopened = {
        project_id: proj.project_id,
        state: proj.state,
        version: proj.version,
        asset_count: rows.length,
        all_assets_verified: true,
      };
    } finally {
      db.close();
    }

    return {
      report: {
        status: 'RESTORED',
        project_id: manifest.project_id,
        target_dir: targetAbs,
        project_dir: restoredProjectDir,
        manifest_hash: manifestHash,
        g5_approval_id: receipt.approval_id,
        verified_file_count: verifiedFiles.length,
        verified_files: verifiedFiles,
        reopened,
        issues: [],
      },
      exitCode: 0,
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// Owner passphrase sign-in (T12). The owner sets a passphrase once; only its scrypt hash is stored. Signing in with it
// issues a short-lived human session marked `auth = 'passphrase'`. The entry point below only runs in an interactive
// terminal, and runtime/cli.ts deliberately has no operation for it, so an agent cannot mint an owner session.
//   node runtime/owner.ts setup --project <dir> --reviewer <id>
//   node runtime/owner.ts login --project <dir> --reviewer <id> [--ttl <minutes>]
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { tokenHash } from './approvals.ts';
import { localize } from './i18n.ts';
import { type Issue, type Outcome, newId, openStore } from './project-store.ts';

const MIN_LENGTH = 12;
const MAX_TTL_MINUTES = 240;
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const derive = (passphrase: string, salt: Buffer) => scryptSync(passphrase.normalize('NFC'), salt, 32, SCRYPT);
const fail = (issue: Issue): Outcome => ({ report: { status: 'REJECTED', issues: [issue] }, exitCode: 1 });

export function setupOwner(project: string, { reviewer_id, passphrase }: { reviewer_id: string; passphrase: string }): Outcome {
  if ((passphrase ?? '').length < MIN_LENGTH) return fail({ code: 'OWNER_PASSPHRASE_WEAK', min_length: MIN_LENGTH });
  const db = openStore(project);
  if (db.prepare('SELECT 1 FROM owner_credentials WHERE reviewer_id = ?').get(reviewer_id)) return fail({ code: 'OWNER_EXISTS', reviewer_id });
  const salt = randomBytes(16);
  db.prepare('INSERT INTO owner_credentials (reviewer_id, salt, hash, created_at) VALUES (?, ?, ?, ?)')
    .run(reviewer_id, salt.toString('hex'), derive(passphrase, salt).toString('hex'), new Date().toISOString());
  return { report: { status: 'OWNER_CONFIGURED', reviewer_id, issues: [] }, exitCode: 0 };
}

export function ownerLogin(project: string, { reviewer_id, passphrase, ttl_minutes = 60 }: { reviewer_id: string; passphrase: string; ttl_minutes?: number },
  now = new Date()): Outcome {
  if (!Number.isInteger(ttl_minutes) || ttl_minutes < 1 || ttl_minutes > MAX_TTL_MINUTES) {
    return fail({ code: 'OWNER_TTL_INVALID', ttl_minutes, max_minutes: MAX_TTL_MINUTES });
  }
  const db = openStore(project);
  const row = db.prepare('SELECT salt, hash FROM owner_credentials WHERE reviewer_id = ?').get(reviewer_id) as { salt: string; hash: string } | undefined;
  if (!row) return fail({ code: 'OWNER_NOT_CONFIGURED', reviewer_id });
  if (!timingSafeEqual(derive(passphrase ?? '', Buffer.from(row.salt, 'hex')), Buffer.from(row.hash, 'hex'))) return fail({ code: 'OWNER_AUTH_FAILED', reviewer_id });
  const token = randomBytes(32).toString('hex');
  const expires_at = new Date(now.getTime() + ttl_minutes * 60_000).toISOString();
  db.prepare("INSERT INTO sessions (session_id, reviewer_id, kind, token_hash, created_at, auth, expires_at) VALUES (?, ?, 'human', ?, ?, 'passphrase', ?)")
    .run(newId('ses'), reviewer_id, tokenHash(token), now.toISOString(), expires_at);
  return { report: { status: 'SIGNED_IN', reviewer_id, expires_at, token, issues: [] }, exitCode: 0 };
}

// Read one line from the terminal without echoing it.
function readHidden(prompt: string): Promise<string> {
  return new Promise((done) => {
    process.stderr.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    let value = '';
    const onData = (chunk: Buffer) => {
      for (const ch of chunk.toString('utf8')) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); process.stderr.write('\n');
          return done(value);
        }
        if (ch === '\u0003') { stdin.setRawMode(false); process.exit(130); }
        value = ch === '\u007f' ? value.slice(0, -1) : value + ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    project: { type: 'string' }, reviewer: { type: 'string' }, ttl: { type: 'string' }, lang: { type: 'string', default: 'zh-CN' } } });
  const print = (outcome: Outcome) => {
    const report = { ...outcome.report, issues: localize(values.lang!, outcome.report.issues as Issue[]) };
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    process.exit(outcome.exitCode);
  };
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    process.stdout.write(JSON.stringify({ status: 'REJECTED', issues: localize(values.lang!, [{ code: 'OWNER_TTY_REQUIRED' }]) }, null, 2) + '\n');
    process.exit(2);
  }
  const [command] = positionals;
  if (!['setup', 'login'].includes(command) || !values.project || !values.reviewer) {
    process.stderr.write('usage: node runtime/owner.ts setup|login --project <dir> --reviewer <id> [--ttl <minutes>]\n');
    process.exit(2);
  }
  const project = resolve(values.project);
  const passphrase = await readHidden('口令 / passphrase: ');
  if (command === 'setup') {
    if (await readHidden('再次输入 / repeat: ') !== passphrase) { process.stderr.write('口令不一致 / passphrases differ\n'); process.exit(1); }
    return print(setupOwner(project, { reviewer_id: values.reviewer, passphrase }));
  }
  const outcome = ownerLogin(project, { reviewer_id: values.reviewer, passphrase, ttl_minutes: values.ttl ? Number(values.ttl) : undefined });
  if (outcome.exitCode === 0) {
    process.stderr.write(`在你自己的终端执行，切勿把令牌交给 Agent / run in your own shell, never hand it to an agent:\nexport SVS_SESSION_TOKEN=${outcome.report.token}\n`);
    return print({ ...outcome, report: { ...outcome.report, token: '(shown above)' } });
  }
  print(outcome);
}

if (import.meta.main) await main();

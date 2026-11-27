import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');

function markdownFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : markdownFiles(path);
    return entry.name.endsWith('.md') ? [path] : [];
  });
}

// Relative link targets in prose; fenced code blocks and inline code are ignored.
function relativeLinks(markdown) {
  const prose = markdown
    .replace(/^(`{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, '')
    .replace(/`[^`\n]*`/g, '');
  return [...prose.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((m) => m[1])
    .filter((target) => !/^[a-z][a-z0-9+.-]*:/i.test(target) && !target.startsWith('#'));
}

const docs = [
  ...['README.md', 'README.en.md', 'AGENTS.md'].map((f) => join(ROOT, f)),
  ...markdownFiles(join(ROOT, 'docs/lite')),
  ...markdownFiles(join(ROOT, 'docs/guide')),
  ...markdownFiles(join(ROOT, 'skills')),
];

for (const doc of docs) {
  test(`links in ${relative(ROOT, doc)} resolve`, () => {
    const broken = relativeLinks(readFileSync(doc, 'utf8'))
      .map((target) => decodeURI(target.split('#')[0]))
      .filter((target) => !existsSync(join(dirname(doc), target)));
    assert.deepEqual(broken, []);
  });
}

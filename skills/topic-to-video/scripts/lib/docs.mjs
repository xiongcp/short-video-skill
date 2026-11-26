import { isApproved } from './project.mjs';

const squash = (s) => s.replace(/\s+/g, '');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (text, word) => typeof word === 'string' && word.length > 0 && new RegExp(`(^|[^A-Za-z0-9_])${esc(word)}(?![A-Za-z0-9_])`).test(text);
const ids = (text, pattern) => [...new Set([...text.matchAll(pattern)].map((m) => m[1]))];
const SHOT_ID = /(?:^|[^A-Za-z0-9_])(sh\d{2,3})(?![A-Za-z0-9_])/g;

/** Problems where 讲稿.md, 分镜.md or 提示词包.md disagree with project.json; an empty list means they agree. */
export function checkDerivedDocs(project, scriptMd, boardMd, packMd = null) {
  const problems = [];
  const sections = new Set(project.sections.map((s) => s.id));
  const shots = new Set(project.shots.map((s) => s.id));
  const script = squash(scriptMd);
  for (const s of project.sections) {
    if (!script.includes(squash(s.text))) problems.push(`讲稿.md 没有逐字包含段落 ${s.id}`);
  }
  for (const id of ids(scriptMd, /^##\s+(s\d{2})(?![0-9])/gm)) {
    if (!sections.has(id)) problems.push(`讲稿.md 有项目里没有的段落 ${id}`);
  }
  for (const shot of project.shots) {
    if (!new RegExp(`(^|[^A-Za-z0-9_])${shot.id}(?![A-Za-z0-9_])`).test(boardMd)) problems.push(`分镜.md 没有列出镜头 ${shot.id}`);
  }
  for (const id of ids(boardMd, SHOT_ID)) {
    if (!shots.has(id)) problems.push(`分镜.md 有项目里没有的镜头 ${id}`);
  }
  if (project.world) {
    if (!hasWord(boardMd, project.world.style)) problems.push(`分镜.md 缺少或不一致的视觉世界风格 ${project.world.style}`);
    if (!hasWord(boardMd, project.world.scene)) problems.push(`分镜.md 缺少或不一致的视觉世界场景 ${project.world.scene}`);
    if (typeof project.world.metaphor === 'string' && project.world.metaphor.length > 0 && !squash(boardMd).includes(squash(project.world.metaphor))) {
      problems.push('分镜.md 没有包含视觉世界比喻');
    }
  }
  if (packMd !== null) problems.push(...checkPromptPack(project, packMd, shots));
  return problems;
}

// While a stale line waits for confirmation the pack is expected to lag behind, so only its status is left alone too.
function checkPromptPack(project, packMd, shots) {
  if (packMd.includes('以下镜头已过期')) return [];
  const problems = [];
  const listed = ids(packMd, /^###\s+(sh\d{2,3})(?![0-9])/gm);
  for (const id of shots) if (!listed.includes(id)) problems.push(`提示词包.md 没有镜头 ${id} 的提示词`);
  for (const id of listed) if (!shots.has(id)) problems.push(`提示词包.md 有项目里没有的镜头 ${id}`);
  const status = packMd.split('\n').find((line) => line.startsWith('>')) ?? '';
  if (isApproved(project, 'plan')) {
    if (!status.includes(`方案已确认（revision ${project.revision}`)) problems.push(`提示词包.md 标题下第一行应写“方案已确认（revision ${project.revision}，日期）”`);
  } else if (project.checkpoints.some((c) => c.stage === 'plan')) {
    problems.push(`提示词包.md 已过期：方案改到 revision ${project.revision} 后还没确认，在标题下加一行“以下镜头已过期，待确认后更新：sh…”，其他内容不动`);
  } else if (!status.includes('未经确认的方案')) {
    problems.push('提示词包.md 标题下第一行应写“未经确认的方案”');
  }
  return problems;
}

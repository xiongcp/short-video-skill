const squash = (s) => s.replace(/\s+/g, '');

/** Problems where 讲稿.md or 分镜.md disagree with project.json; an empty list means they agree. */
export function checkDerivedDocs(project, scriptMd, boardMd) {
  const problems = [];
  const script = squash(scriptMd);
  for (const s of project.sections) {
    if (!script.includes(squash(s.text))) problems.push(`讲稿.md 没有逐字包含段落 ${s.id}`);
  }
  for (const shot of project.shots) {
    if (!new RegExp(`(^|[^A-Za-z0-9_])${shot.id}(?![A-Za-z0-9_])`).test(boardMd)) problems.push(`分镜.md 没有列出镜头 ${shot.id}`);
  }
  return problems;
}

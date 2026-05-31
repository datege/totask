/** 从文本中提取 @标签名 */
const TAG_RE = /@([\w][\w\d.\-!?+]*)/g;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractTagsFromLine(line: string): string[] {
  const found: string[] = [];
  let m: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(line)) !== null) {
    found.push(m[1]);
  }
  return [...new Set(found)];
}

/** 光标处或当前行的用户标签 */
export function tagsAtCursor(line: string, character: number): string[] {
  const before = line.slice(0, character);
  const atWord = before.match(/@([\w][\w\d.\-!?+]*)$/);
  if (atWord) {
    return [atWord[1]];
  }
  const skip = new Set(['done', 'cancelled', 'project', 'lasted']);
  return extractTagsFromLine(line).filter((t) => !skip.has(t.toLowerCase()));
}

export function lineHasAnyTag(line: string, tags: string[]): boolean {
  return tags.some((tag) => new RegExp(`@${escapeRegex(tag)}(?:\\(|\\s|$)`, 'i').test(line));
}

export function parseTagValue(line: string, tagName: string): string | undefined {
  const re = new RegExp(`@${tagName}\\s*\\(([^)]*)\\)`, 'i');
  const m = line.match(re);
  return m?.[1]?.trim();
}

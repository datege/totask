import { getSettings, formatDate } from './config';
import { appendLastedTag } from './timer';

export type TaskStatus = 'pending' | 'done' | 'cancelled' | 'other';

const DONE_BULLETS = '+✓✔☑√';
const CANCEL_BULLETS = '✘❌';
const OPEN_BULLETS = '-❍❑■□☐▪▫–—≡→›';

export interface ParsedLine {
  lineIndex: number;
  indent: string;
  bullet: string;
  body: string;
  status: TaskStatus;
  raw: string;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseTaskLine(line: string, lineIndex: number): ParsedLine | null {
  const s = getSettings();
  const allBullets = [
    s.openBullet,
    s.doneBullet,
    s.cancelledBullet,
    ...DONE_BULLETS.split(''),
    ...CANCEL_BULLETS.split(''),
    ...OPEN_BULLETS.split(''),
    '[x]',
    '[ ]',
    '[-]',
    'x',
  ]
    .filter((b, i, arr) => b && arr.indexOf(b) === i)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex);

  const bulletGroup = allBullets.join('|');
  const re = new RegExp(`^(\\s*)(${bulletGroup})(\\s*)(.*)$`);
  const m = line.match(re);
  if (!m) {
    return null;
  }

  const [, indent, bullet, , body] = m;
  let status: TaskStatus = 'pending';

  if (
    bullet === s.doneBullet ||
    DONE_BULLETS.includes(bullet) ||
    bullet === '[x]'
  ) {
    status = 'done';
  } else if (
    bullet === s.cancelledBullet ||
    CANCEL_BULLETS.includes(bullet) ||
    bullet === '[-]' ||
    (bullet === 'x' && line.includes('@cancelled'))
  ) {
    status = 'cancelled';
  } else if (bullet === s.openBullet || OPEN_BULLETS.includes(bullet) || bullet === '[ ]') {
    status = 'pending';
  }

  return { lineIndex, indent, bullet, body, status, raw: line };
}

export function isProjectHeader(line: string): boolean {
  return /^\s*#?\s?\w+.*?:\s*$/.test(line.trimEnd()) || /^\s*\w+.*?:\s/.test(line);
}

export function isNoteLine(line: string, prevIsTask: boolean): boolean {
  if (!prevIsTask) {
    return false;
  }
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }
  return parseTaskLine(line, 0) === null && !isProjectHeader(line) && !/^＿+$/.test(line) && !/^\s*---.{3,5}---+$/.test(line);
}

export function isArchiveSeparator(line: string): boolean {
  return /^＿+$/.test(line.trim());
}

function stripStatusTags(body: string): string {
  return body
    .replace(/\s*@done(\([^)]*\))?\s*/gi, ' ')
    .replace(/\s*@cancelled(\([^)]*\))?\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function appendTag(body: string, tag: string, withDate: boolean): string {
  const s = getSettings();
  const clean = stripStatusTags(body);
  const suffix = withDate ? ` ${tag}${formatDate(s.dateFormat)}` : ` ${tag}`;
  return clean ? `${clean}${suffix}` : tag + (withDate ? formatDate(s.dateFormat) : '');
}

export function toPending(parsed: ParsedLine): string {
  const s = getSettings();
  const body = stripStatusTags(parsed.body);
  return `${parsed.indent}${s.openBullet}${s.taskSpace}${body}`.trimEnd();
}

export function toDone(parsed: ParsedLine): string {
  const s = getSettings();
  let body = stripStatusTags(parsed.body);
  if (/@started/i.test(parsed.body)) {
    body = appendLastedTag(body);
  }
  if (s.doneTag) {
    body = appendTag(body, '@done', true);
  }
  return `${parsed.indent}${s.doneBullet}${s.taskSpace}${body}`.trimEnd();
}

export function toCancelled(parsed: ParsedLine): string {
  const s = getSettings();
  let body = stripStatusTags(parsed.body);
  if (/@started/i.test(parsed.body)) {
    body = appendLastedTag(body);
  }
  if (s.doneTag) {
    body = appendTag(body, '@cancelled', true);
  }
  return `${parsed.indent}${s.cancelledBullet}${s.taskSpace}${body}`.trimEnd();
}

export function newTaskLine(indent = ''): string {
  const s = getSettings();
  const sp = indent || s.marginSpaces;
  return `${sp}${s.openBullet}${s.taskSpace}`;
}

export function findArchiveIndex(lines: string[]): number {
  const name = getSettings().archiveName;
  return lines.findIndex((l) => l.trim() === name || l.trimStart().startsWith(name));
}

export function countTasks(lines: string[], beforeArchive = true): { pending: number; done: number; cancelled: number } {
  const archiveIdx = findArchiveIndex(lines);
  const limit = beforeArchive && archiveIdx >= 0 ? archiveIdx : lines.length;
  let pending = 0;
  let done = 0;
  let cancelled = 0;

  for (let i = 0; i < limit; i++) {
    const p = parseTaskLine(lines[i], i);
    if (!p) {
      continue;
    }
    if (p.status === 'pending') {
      pending++;
    } else if (p.status === 'done') {
      done++;
    } else if (p.status === 'cancelled') {
      cancelled++;
    }
  }
  return { pending, done, cancelled };
}

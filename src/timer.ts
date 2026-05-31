import { formatDate, getSettings } from './config';
import { parseTagValue } from './tags';

const TAG_DATE_RE = /@(?:started|toggle|created|done|cancelled)\s*\(([^)]*)\)/gi;

/** 解析任务文件中的日期字符串 */
export function parseTodoDate(raw: string): Date | undefined {
  const s = raw.trim();
  if (!s) {
    return undefined;
  }
  // yyyy-mm-dd HH:MM
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/);
  if (m) {
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
  }
  // yy-mm-dd HH:MM
  m = s.match(/^(\d{2})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/);
  if (m) {
    const y = 2000 + parseInt(m[1], 10);
    return new Date(y, +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
  }
  const d = Date.parse(s);
  return Number.isNaN(d) ? undefined : new Date(d);
}

function allTagTimestamps(body: string, tag: string): Date[] {
  const re = new RegExp(`@${tag}\\s*\\(([^)]*)\\)`, 'gi');
  const out: Date[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const d = parseTodoDate(m[1]);
    if (d) {
      out.push(d);
    }
  }
  return out;
}

/** 根据 @started 与 @toggle 计算耗时（毫秒） */
export function calculateElapsedMs(body: string, endTime: Date = new Date()): number {
  const started = allTagTimestamps(body, 'started');
  if (!started.length) {
    return 0;
  }
  const toggles = allTagTimestamps(body, 'toggle');
  const events: { t: Date; running: boolean }[] = [{ t: started[0], running: true }];
  for (const tg of toggles) {
    const last = events[events.length - 1];
    events.push({ t: tg, running: !last.running });
  }

  let total = 0;
  for (let i = 0; i < events.length; i++) {
    if (!events[i].running) {
      continue;
    }
    const end = i + 1 < events.length ? events[i + 1].t : endTime;
    total += end.getTime() - events[i].t.getTime();
  }
  return Math.max(0, total);
}

export function formatDuration(ms: number): string {
  const cfg = getSettings();
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (cfg.decimalMinutes) {
    return `${(ms / 3600000).toFixed(2)}h`;
  }
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}`;
  }
  return `${m}m`;
}

export function appendLastedTag(body: string, endTime: Date = new Date()): string {
  const ms = calculateElapsedMs(body, endTime);
  if (ms <= 0) {
    return body;
  }
  const without = body.replace(/\s*@lasted\([^)]*\)\s*/gi, ' ').trim();
  return `${without} @lasted(${formatDuration(ms)})`;
}

export function insertStartedTag(): string {
  return ` @started${formatDate(getSettings().dateFormat)}`;
}

export function insertToggleTag(): string {
  return ` @toggle${formatDate(getSettings().dateFormat)}`;
}

/** 填充空的 @started() / @due() / @created() */
export function fillEmptyTagAtCursor(line: string, character: number): { line: string; cursor: number } | null {
  const patterns: { re: RegExp; wrap: (d: string) => string }[] = [
    { re: /@started\s*\(\s*\)/i, wrap: (d) => `@started${d}` },
    { re: /@toggle\s*\(\s*\)/i, wrap: (d) => `@toggle${d}` },
    { re: /@created\s*\(\s*\)/i, wrap: (d) => `@created${d}` },
    {
      re: /@due\s*\(\s*\)/i,
      wrap: () => {
        const n = new Date();
        return `@due(${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')})`;
      },
    },
  ];

  for (const { re, wrap } of patterns) {
    const m = line.match(re);
    if (m && m.index !== undefined) {
      const dateStr = formatDate(getSettings().dateFormat);
      const replacement = wrap(dateStr);
      const newLine = line.slice(0, m.index) + replacement + line.slice(m.index + m[0].length);
      return { line: newLine, cursor: m.index + replacement.length };
    }
  }

  // @due 已有内容时刷新为今天
  const duePartial = line.match(/@due\s*\([^)]*$/);
  if (duePartial && duePartial.index !== undefined && character >= duePartial.index) {
    const n = new Date();
    const due = `@due(${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')})`;
    const before = line.slice(0, duePartial.index);
    const after = line.slice(character);
    const close = after.match(/^\s*\)/);
    const rest = close ? after.slice(close[0].length) : after;
    const newLine = before + due + rest;
    return { line: newLine, cursor: before.length + due.length };
  }

  // 光标在 @started 上按 Tab 重算耗时（已完成任务）
  if (/@started/i.test(line) && (line.includes('@done') || line.includes('@cancelled'))) {
    const recalc = appendLastedTag(line);
    if (recalc !== line) {
      return { line: recalc, cursor: character };
    }
  }

  return null;
}

export function recalculateLastedForLine(line: string, parsedBody: string): string {
  if (!/@started/i.test(line)) {
    return line;
  }
  const idx = line.indexOf(parsedBody);
  const prefix = idx >= 0 ? line.slice(0, idx) : line;
  return prefix + appendLastedTag(parsedBody);
}

import * as vscode from 'vscode';
import { findArchiveIndex, isNoteLine, isProjectHeader, parseTaskLine } from './taskModel';
import { parseTodoDate } from './timer';

const PRIORITY_SCORE: Record<string, number> = {
  critical: 0,
  high: 1,
  low: 3,
};

function priorityScore(line: string): number {
  const lower = line.toLowerCase();
  if (/@critical/.test(lower)) {
    return PRIORITY_SCORE.critical;
  }
  if (/@high/.test(lower)) {
    return PRIORITY_SCORE.high;
  }
  if (/@low/.test(lower)) {
    return PRIORITY_SCORE.low;
  }
  return 2;
}

function dueTimestamp(line: string): number {
  const m = line.match(/@due\s*\(([^)]*)\)/i);
  if (!m) {
    return Number.MAX_SAFE_INTEGER;
  }
  const d = parseTodoDate(m[1]);
  return d ? d.getTime() : Number.MAX_SAFE_INTEGER;
}

function lineIndent(line: string): number {
  return (line.match(/^(\s*)/)?.[1] ?? '').length;
}

type Block = { kind: 'task' | 'other'; lines: string[]; due?: number; pri?: number };

export function getSortRegion(lines: string[], cursorLine: number): { start: number; end: number } {
  const archiveIdx = findArchiveIndex(lines);
  const limit = archiveIdx >= 0 ? archiveIdx : lines.length;

  let projectLine = cursorLine;
  for (let i = cursorLine; i >= 0; i--) {
    if (isProjectHeader(lines[i])) {
      projectLine = i;
      break;
    }
  }

  const baseIndent = lineIndent(lines[projectLine]);
  let end = limit;
  for (let i = projectLine + 1; i < limit; i++) {
    if (lines[i].trim() === '') {
      continue;
    }
    const ind = lineIndent(lines[i]);
    if (ind <= baseIndent && (isProjectHeader(lines[i]) || parseTaskLine(lines[i], i))) {
      end = i;
      break;
    }
  }
  return { start: projectLine, end };
}

export function sortRegionLines(region: string[], descending: boolean): string[] {
  const blocks: Block[] = [];
  let i = 0;

  while (i < region.length) {
    const line = region[i];
    const parsed = parseTaskLine(line, i);
    if (parsed) {
      const blockLines = [line];
      let j = i + 1;
      while (j < region.length && isNoteLine(region[j], true)) {
        blockLines.push(region[j]);
        j++;
      }
      blocks.push({
        kind: 'task',
        lines: blockLines,
        due: dueTimestamp(line),
        pri: priorityScore(line),
      });
      i = j;
    } else {
      blocks.push({ kind: 'other', lines: [line] });
      i++;
    }
  }

  const sortedTasks = blocks
    .filter((b) => b.kind === 'task')
    .sort((a, b) => {
      const dueA = a.due ?? Number.MAX_SAFE_INTEGER;
      const dueB = b.due ?? Number.MAX_SAFE_INTEGER;
      if (dueA !== dueB) {
        return descending ? dueB - dueA : dueA - dueB;
      }
      const priA = a.pri ?? 2;
      const priB = b.pri ?? 2;
      return descending ? priB - priA : priA - priB;
    });

  let ti = 0;
  return blocks.flatMap((b) => {
    if (b.kind === 'task') {
      return sortedTasks[ti++].lines;
    }
    return b.lines;
  });
}

export async function sortByDueAndPriority(
  editor: vscode.TextEditor,
  descending = false
): Promise<void> {
  const lines = editor.document.getText().split(/\r?\n/);
  const cursor = editor.selection.active.line;
  const { start, end } = getSortRegion(lines, cursor);
  const region = lines.slice(start, end);
  const sortedRegion = sortRegionLines(region, descending);

  const range = new vscode.Range(
    start,
    0,
    Math.max(start, end - 1),
    editor.document.lineAt(Math.max(start, end - 1)).text.length
  );
  await editor.edit((eb) => eb.replace(range, sortedRegion.join('\n')));
  void vscode.window.showInformationMessage(
    descending ? '已按截止日期与优先级倒序排列' : '已按截止日期与优先级排序'
  );
}

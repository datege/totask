import * as vscode from 'vscode';
import { findArchiveIndex, isNoteLine, isProjectHeader, parseTaskLine } from './taskModel';
import { lineHasAnyTag, tagsAtCursor } from './tags';

const filterByUri = new Map<string, Set<number>>();

export function isFilterActive(uri: string): boolean {
  return filterByUri.has(uri);
}

export function getHiddenLines(uri: string): Set<number> | undefined {
  return filterByUri.get(uri);
}

function lineIndent(line: string): number {
  const m = line.match(/^(\s*)/);
  return m ? m[1].length : 0;
}

/** 计算应隐藏的行号（折叠） */
export function computeHiddenLineIndices(lines: string[], filterTags: string[]): Set<number> {
  const archiveIdx = findArchiveIndex(lines);
  const end = archiveIdx >= 0 ? archiveIdx : lines.length;
  const visible = new Set<number>();

  for (let i = 0; i < end; i++) {
    const line = lines[i];
    const parsed = parseTaskLine(line, i);
    if (parsed && lineHasAnyTag(line, filterTags)) {
      for (const li of collectVisibleBlock(lines, i)) {
        visible.add(li);
      }
    }
  }

  // 保留包含可见任务的项目标题
  for (let i = 0; i < end; i++) {
    if (!isProjectHeader(lines[i])) {
      continue;
    }
    const projIndent = lineIndent(lines[i]);
    for (let j = i + 1; j < end; j++) {
      if (lines[j].trim() === '') {
        continue;
      }
      const ind = lineIndent(lines[j]);
      if (ind <= projIndent && (isProjectHeader(lines[j]) || parseTaskLine(lines[j], j))) {
        break;
      }
      if (visible.has(j)) {
        visible.add(i);
        break;
      }
    }
  }

  const hidden = new Set<number>();
  for (let i = 0; i < end; i++) {
    if (!visible.has(i)) {
      hidden.add(i);
    }
  }
  return hidden;
}

function collectVisibleBlock(lines: string[], taskLine: number): number[] {
  const out = [taskLine];
  let i = taskLine + 1;
  while (i < lines.length && isNoteLine(lines[i], true)) {
    out.push(i);
    i++;
  }
  return out;
}

export async function applyTagFilter(editor: vscode.TextEditor): Promise<void> {
  const line = editor.document.lineAt(editor.selection.active.line);
  const tags = tagsAtCursor(line.text, editor.selection.active.character);
  if (!tags.length) {
    void vscode.window.showWarningMessage('请将光标放在 @标签 上，或选择带标签的任务行');
    return;
  }

  const lines = editor.document.getText().split(/\r?\n/);
  const hidden = computeHiddenLineIndices(lines, tags);
  if (hidden.size === 0) {
    void vscode.window.showInformationMessage(`未找到包含 ${tags.map((t) => '@' + t).join(', ')} 的任务`);
    return;
  }

  filterByUri.set(editor.document.uri.toString(), hidden);
  await vscode.commands.executeCommand('editor.foldAll');
  void vscode.window.showInformationMessage(
    `已按 ${tags.map((t) => '@' + t).join(', ')} 过滤，执行「Tasks: 清除标签过滤」或 Ctrl+K Ctrl+J 展开`
  );
}

export function clearTagFilter(editor: vscode.TextEditor): void {
  filterByUri.delete(editor.document.uri.toString());
  void vscode.commands.executeCommand('editor.unfoldAll');
}

export function registerTagFilter(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerFoldingRangeProvider(
      { language: 'todo' },
      {
        provideFoldingRanges(document): vscode.FoldingRange[] {
          const hidden = filterByUri.get(document.uri.toString());
          if (!hidden?.size) {
            return [];
          }
          const ranges: vscode.FoldingRange[] = [];
          let start = -1;
          for (let i = 0; i < document.lineCount; i++) {
            if (hidden.has(i)) {
              if (start < 0) {
                start = i;
              }
            } else if (start >= 0) {
              ranges.push(new vscode.FoldingRange(start, i - 1, vscode.FoldingRangeKind.Region));
              start = -1;
            }
          }
          if (start >= 0) {
            ranges.push(new vscode.FoldingRange(start, document.lineCount - 1, vscode.FoldingRangeKind.Region));
          }
          return ranges;
        },
      }
    ),
    vscode.commands.registerCommand('totask.filterByTags', () => {
      const ed = vscode.window.activeTextEditor;
      if (ed?.document.languageId === 'todo') {
        void applyTagFilter(ed);
      }
    }),
    vscode.commands.registerCommand('totask.clearFilter', () => {
      const ed = vscode.window.activeTextEditor;
      if (ed?.document.languageId === 'todo') {
        clearTagFilter(ed);
      }
    }),
    vscode.commands.registerCommand('totask.foldToDue', async () => {
      const ed = vscode.window.activeTextEditor;
      if (!ed || ed.document.languageId !== 'todo') {
        return;
      }
      const lines = ed.document.getText().split(/\r?\n/);
      const hidden = computeHiddenLineIndices(lines, ['due']);
      filterByUri.set(ed.document.uri.toString(), hidden);
      await vscode.commands.executeCommand('editor.foldAll');
      void vscode.window.showInformationMessage('已折叠无 @due 的行');
    })
  );
}

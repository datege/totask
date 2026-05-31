import * as vscode from 'vscode';
import { formatDate, getSettings } from './config';
import { exportToHtml } from './exportHtml';
import { orgModeArchive } from './orgArchive';
import { sortByDueAndPriority } from './sort';
import {
  findArchiveIndex,
  isNoteLine,
  isProjectHeader,
  newTaskLine,
  parseTaskLine,
  toCancelled,
  toDone,
  toPending,
} from './taskModel';
import { disposeStatusBar, updateStatusBar } from './statusBar';
import { registerPreview } from './preview';
import { registerTagFilter } from './tagFilter';
import {
  fillEmptyTagAtCursor,
  insertStartedTag,
  insertToggleTag,
  recalculateLastedForLine,
} from './timer';

const SAMPLE_DOC = `Inbox:
  ☐ 在此输入你的第一条任务 @high
  ☐ 使用 Ctrl+D 标记完成，Alt+C 标记取消
  ☐ 项目以冒号结尾，例如 "工作:"

--- ✄ -----------------------

Archive:
`;

function getActiveTodoEditor(): vscode.TextEditor | undefined {
  const ed = vscode.window.activeTextEditor;
  if (ed?.document.languageId === 'todo') {
    return ed;
  }
  return undefined;
}

function lineIndicesAtCursor(editor: vscode.TextEditor): number[] {
  const indices = new Set<number>();
  for (const sel of editor.selections) {
    for (let i = sel.start.line; i <= sel.end.line; i++) {
      indices.add(i);
    }
  }
  return [...indices].sort((a, b) => b - a);
}

function replaceLines(editor: vscode.TextEditor, replacements: Map<number, string>): void {
  const doc = editor.document;
  const edit = new vscode.WorkspaceEdit();
  for (const [lineIndex, text] of replacements) {
    edit.replace(doc.uri, doc.lineAt(lineIndex).range, text);
  }
  void vscode.workspace.applyEdit(edit).then(() => updateStatusBar(editor));
}

function collectTaskBlock(lines: string[], taskLine: number): number[] {
  const result = [taskLine];
  let i = taskLine + 1;
  while (i < lines.length && isNoteLine(lines[i], true)) {
    result.push(i);
    i++;
  }
  return result;
}

function currentProjectName(lines: string[], taskLine: number): string | undefined {
  for (let i = taskLine; i >= 0; i--) {
    if (isProjectHeader(lines[i])) {
      const m = lines[i].match(/^\s*#?\s*(.+?):/);
      return m ? m[1].trim() : undefined;
    }
  }
  return undefined;
}

function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('totask.newDocument', async () => {
      const doc = await vscode.workspace.openTextDocument({ language: 'todo', content: SAMPLE_DOC });
      await vscode.window.showTextDocument(doc);
    }),

    vscode.commands.registerCommand('totask.newTask', () => {
      const editor = getActiveTodoEditor();
      if (!editor) {
        return;
      }
      const doc = editor.document;
      const line = editor.selection.active.line;
      const lineText = doc.lineAt(line).text;
      const parsed = parseTaskLine(lineText, line);

      if (parsed) {
        const indent = parsed.indent + getSettings().marginSpaces;
        const insert = `\n${newTaskLine(indent)}`;
        const pos = doc.lineAt(line).range.end;
        void editor.edit((eb) => {
          eb.insert(pos, insert);
          const newLine = line + 1;
          const col = doc.lineAt(newLine).text.length;
          editor.selection = new vscode.Selection(newLine, col, newLine, col);
        });
      } else if (isProjectHeader(lineText)) {
        const m = lineText.match(/^(\s*)/);
        const indent = (m?.[1] ?? '') + getSettings().marginSpaces;
        void editor.edit((eb) => eb.insert(doc.lineAt(line).range.end, `\n${newTaskLine(indent)}`));
      } else {
        const m = lineText.match(/^(\s*)(\S.*)?$/);
        const indent = m?.[1] ?? getSettings().marginSpaces;
        const content = m?.[2]
          ? `${indent}${getSettings().openBullet}${getSettings().taskSpace}${m[2]}`
          : newTaskLine(indent);
        void editor.edit((eb) => {
          eb.replace(doc.lineAt(line).range, content);
          editor.selection = new vscode.Selection(line, content.length, line, content.length);
        });
      }
      updateStatusBar(editor);
    }),

    vscode.commands.registerCommand('totask.newTaskWithDate', async () => {
      await vscode.commands.executeCommand('totask.newTask');
      const editor = getActiveTodoEditor();
      if (!editor) {
        return;
      }
      const suffix = ` @created${formatDate(getSettings().dateFormat)}`;
      void editor.edit((eb) => eb.insert(editor.selection.active, suffix));
    }),

    vscode.commands.registerCommand('totask.toggleComplete', () => {
      const editor = getActiveTodoEditor();
      if (!editor) {
        return;
      }
      const lines = editor.document.getText().split(/\r?\n/);
      const replacements = new Map<number, string>();
      for (const idx of lineIndicesAtCursor(editor)) {
        const parsed = parseTaskLine(lines[idx], idx);
        if (!parsed) {
          continue;
        }
        if (parsed.status === 'pending' || parsed.status === 'cancelled') {
          replacements.set(idx, toDone(parsed));
        } else if (parsed.status === 'done') {
          replacements.set(idx, toPending(parsed));
        }
      }
      if (replacements.size) {
        replaceLines(editor, replacements);
      }
    }),

    vscode.commands.registerCommand('totask.toggleCancel', () => {
      const editor = getActiveTodoEditor();
      if (!editor) {
        return;
      }
      const lines = editor.document.getText().split(/\r?\n/);
      const replacements = new Map<number, string>();
      for (const idx of lineIndicesAtCursor(editor)) {
        const parsed = parseTaskLine(lines[idx], idx);
        if (!parsed) {
          continue;
        }
        if (parsed.status === 'pending' || parsed.status === 'done') {
          replacements.set(idx, toCancelled(parsed));
        } else if (parsed.status === 'cancelled') {
          replacements.set(idx, toPending(parsed));
        }
      }
      if (replacements.size) {
        replaceLines(editor, replacements);
      }
    }),

    vscode.commands.registerCommand('totask.archive', async () => {
      const editor = getActiveTodoEditor();
      if (!editor) {
        return;
      }
      const s = getSettings();
      const doc = editor.document;
      let lines = doc.getText().split(/\r?\n/);
      let archiveIdx = findArchiveIndex(lines);

      if (archiveIdx < 0) {
        lines = [...lines, '', '＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿', s.archiveName, ''];
        archiveIdx = lines.length - 2;
      }

      const activeEnd = archiveIdx;
      const blocks: { indices: number[]; text: string }[] = [];

      for (let i = 0; i < activeEnd; i++) {
        const parsed = parseTaskLine(lines[i], i);
        if (parsed?.status === 'done') {
          const blockLines = collectTaskBlock(lines, i);
          const project = currentProjectName(lines, i);
          const archived = blockLines.map((li, bi) => {
            if (bi > 0) {
              return lines[li];
            }
            let text = lines[li];
            if (project) {
              const tag = `@project(${project})`;
              text = s.projectTagPostfix
                ? text.includes(tag)
                  ? text
                  : `${text} ${tag}`
                : `${tag} ${text.trimStart()}`;
            }
            return text;
          });
          blocks.push({ indices: blockLines, text: archived.join('\n') });
        }
      }

      if (!blocks.length) {
        void vscode.window.showInformationMessage('没有可归档的已完成任务');
        return;
      }

      const toRemove = new Set(blocks.flatMap((b) => b.indices));
      const newActive = lines.filter((_, i) => i < activeEnd && !toRemove.has(i));
      let archiveBody = lines.slice(archiveIdx + 1);
      while (archiveBody.length && !archiveBody[0].trim()) {
        archiveBody = archiveBody.slice(1);
      }
      const flatBlocks = blocks.map((b) => b.text);
      const inserted = s.newOnTop ? [...flatBlocks, ...archiveBody] : [...archiveBody, ...flatBlocks];
      const result = [...newActive, lines[archiveIdx], ...inserted, ''];

      const fullRange = new vscode.Range(
        0,
        0,
        doc.lineCount,
        doc.lineAt(doc.lineCount - 1).text.length
      );
      await editor.edit((eb) => eb.replace(fullRange, result.join('\n')));
      updateStatusBar(editor);
      void vscode.window.showInformationMessage(`已归档 ${blocks.length} 项任务`);
    }),

    vscode.commands.registerCommand('totask.insertDueDate', () => {
      const editor = getActiveTodoEditor();
      if (!editor) {
        return;
      }
      const n = new Date();
      const due = `@due(${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')})`;
      void editor.edit((eb) => eb.insert(editor.selection.active, ` ${due}`));
    }),

    vscode.commands.registerCommand('totask.insertSeparator', () => {
      const editor = getActiveTodoEditor();
      if (!editor) {
        return;
      }
      const line = editor.selection.active.line;
      void editor.edit((eb) => eb.insert(editor.document.lineAt(line).range.end, '\n--- ✄ -----------------------\n'));
    }),

    vscode.commands.registerCommand('totask.insertStarted', () => {
      const editor = getActiveTodoEditor();
      if (!editor) {
        return;
      }
      void editor.edit((eb) => eb.insert(editor.selection.active, insertStartedTag()));
    }),

    vscode.commands.registerCommand('totask.insertToggle', () => {
      const editor = getActiveTodoEditor();
      if (!editor) {
        return;
      }
      void editor.edit((eb) => eb.insert(editor.selection.active, insertToggleTag()));
    }),

    vscode.commands.registerCommand('totask.fillTagDate', () => {
      const editor = getActiveTodoEditor();
      if (!editor) {
        return;
      }
      const lineIdx = editor.selection.active.line;
      const line = editor.document.lineAt(lineIdx);
      const ch = editor.selection.active.character;
      const filled = fillEmptyTagAtCursor(line.text, ch);
      if (filled) {
        void editor.edit((eb) => {
          eb.replace(line.range, filled.line);
          editor.selection = new vscode.Selection(lineIdx, filled.cursor, lineIdx, filled.cursor);
        });
        return;
      }
      const parsed = parseTaskLine(line.text, lineIdx);
      if (parsed && /@started/i.test(line.text)) {
        const newLine = recalculateLastedForLine(line.text, parsed.body);
        if (newLine !== line.text) {
          void editor.edit((eb) => eb.replace(line.range, newLine));
        }
      }
    }),

    vscode.commands.registerCommand('totask.orgArchive', async () => {
      const editor = getActiveTodoEditor();
      if (editor) {
        await orgModeArchive(editor);
        updateStatusBar(editor);
      }
    }),

    vscode.commands.registerCommand('totask.exportHtml', async () => {
      const editor = getActiveTodoEditor();
      if (editor) {
        await exportToHtml(editor, false);
      }
    }),

    vscode.commands.registerCommand('totask.exportHtmlSave', async () => {
      const editor = getActiveTodoEditor();
      if (editor) {
        await exportToHtml(editor, true);
      }
    }),

    vscode.commands.registerCommand('totask.sortByDue', async () => {
      const editor = getActiveTodoEditor();
      if (editor) {
        await sortByDueAndPriority(editor, false);
      }
    }),

    vscode.commands.registerCommand('totask.sortByDueDesc', async () => {
      const editor = getActiveTodoEditor();
      if (editor) {
        await sortByDueAndPriority(editor, true);
      }
    })
  );
}

export function activate(context: vscode.ExtensionContext): void {
  registerCommands(context);
  registerTagFilter(context);
  registerPreview(context);

  const refresh = (ed?: vscode.TextEditor) => updateStatusBar(ed ?? vscode.window.activeTextEditor);

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(refresh),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (vscode.window.activeTextEditor?.document === e.document) {
        refresh();
      }
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (vscode.window.activeTextEditor?.document === doc) {
        refresh();
      }
    }),
    { dispose: disposeStatusBar }
  );

  refresh();
}

export function deactivate(): void {
  disposeStatusBar();
}

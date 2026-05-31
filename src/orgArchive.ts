import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getSettings } from './config';
import { isProjectHeader, parseTaskLine } from './taskModel';

function lineIndent(line: string): number {
  return (line.match(/^(\s*)/)?.[1] ?? '').length;
}

/** 从光标行起选中同级或更深子树 */
export function getSubtreeRange(lines: string[], cursorLine: number): { start: number; end: number } {
  const line = lines[cursorLine];
  const baseIndent = lineIndent(line);

  if (isProjectHeader(line)) {
    let end = cursorLine + 1;
    for (let i = cursorLine + 1; i < lines.length; i++) {
      if (lines[i].trim() === '') {
        end = i + 1;
        continue;
      }
      const ind = lineIndent(lines[i]);
      if (ind <= baseIndent && (isProjectHeader(lines[i]) || parseTaskLine(lines[i], i))) {
        break;
      }
      end = i + 1;
    }
    return { start: cursorLine, end };
  }

  if (parseTaskLine(line, cursorLine)) {
    let end = cursorLine + 1;
    while (end < lines.length) {
      const next = lines[end];
      if (next.trim() === '') {
        end++;
        continue;
      }
      if (lineIndent(next) > baseIndent) {
        end++;
        continue;
      }
      break;
    }
    return { start: cursorLine, end };
  }

  return { start: cursorLine, end: cursorLine + 1 };
}

function archiveFilePath(sourcePath: string): string {
  const cfg = vscode.workspace.getConfiguration('totask');
  const mask =
    cfg.get<string>('archiveOrgFilemask') ?? '{dir}{sep}{base}_archive{ext}';
  const dir = path.dirname(sourcePath);
  const ext = path.extname(sourcePath);
  const base = path.basename(sourcePath, ext);
  const sep = path.sep;
  return mask
    .replace(/\{dir\}/g, dir + sep)
    .replace(/\{sep\}/g, sep)
    .replace(/\{base\}/g, base)
    .replace(/\{ext\}/g, ext);
}

export async function orgModeArchive(editor: vscode.TextEditor): Promise<void> {
  const docPath = editor.document.uri.fsPath;
  if (!docPath || editor.document.uri.scheme !== 'file') {
    void vscode.window.showErrorMessage('请先保存文件到磁盘后再使用 Org-Mode 归档');
    return;
  }

  const lines = editor.document.getText().split(/\r?\n/);
  const cursor = editor.selection.active.line;
  const { start, end } = getSubtreeRange(lines, cursor);
  if (start >= end) {
    void vscode.window.showWarningMessage('未找到可归档的子树');
    return;
  }

  const block = lines.slice(start, end);
  const archivePath = archiveFilePath(docPath);

  const settings = getSettings();
  const header = `\n\n--- archived ${new Date().toISOString().slice(0, 16).replace('T', ' ')} ---\n`;
  if (!fs.existsSync(archivePath)) {
    fs.writeFileSync(archivePath, `${settings.archiveName}\n`, 'utf8');
  }

  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  fs.appendFileSync(archivePath, header + block.join('\n') + '\n', 'utf8');

  const remaining = [...lines.slice(0, start), ...lines.slice(end)];
  const fullRange = new vscode.Range(
    0,
    0,
    editor.document.lineCount,
    editor.document.lineAt(editor.document.lineCount - 1).text.length
  );
  await editor.edit((eb) => eb.replace(fullRange, remaining.join('\n')));

  const archiveUri = vscode.Uri.file(archivePath);
  const archiveDoc = await vscode.workspace.openTextDocument(archiveUri);
  await vscode.window.showTextDocument(archiveDoc, { preview: false });
  void vscode.window.showInformationMessage(`已归档到 ${path.basename(archivePath)}`);
}

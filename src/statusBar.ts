import * as vscode from 'vscode';
import { countTasks } from './taskModel';

let statusItem: vscode.StatusBarItem | undefined;

export function updateStatusBar(editor: vscode.TextEditor | undefined): void {
  if (!statusItem) {
    statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusItem.name = 'ToTask Stats';
  }

  if (!editor || editor.document.languageId !== 'todo') {
    statusItem.hide();
    return;
  }

  const lines = editor.document.getText().split(/\r?\n/);
  const { pending, done, cancelled } = countTasks(lines);
  statusItem.text = `$(checklist) ☐ ${pending}  ✔ ${done}  ✘ ${cancelled}`;
  statusItem.tooltip = 'ToTask：待办 / 完成 / 取消';
  statusItem.show();
}

export function disposeStatusBar(): void {
  statusItem?.dispose();
  statusItem = undefined;
}

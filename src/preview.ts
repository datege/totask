import * as path from 'path';
import * as vscode from 'vscode';
import { buildWebviewHtml } from './exportHtml';

class TodoPreviewManager {
  private readonly panels = new Map<string, vscode.WebviewPanel>();
  private readonly pendingUpdate = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(context: vscode.ExtensionContext) {
    this.disposables.push(
      vscode.commands.registerCommand('totask.openPreview', () => this.open(false)),
      vscode.commands.registerCommand('totask.openPreviewToSide', () => this.open(true)),
      vscode.workspace.onDidChangeTextDocument((e) => this.onDocumentChange(e)),
      vscode.window.onDidChangeActiveTextEditor(() => this.refreshVisiblePanels()),
      vscode.workspace.onDidCloseTextDocument((doc) => this.onDocumentClosed(doc))
    );
    context.subscriptions.push(...this.disposables);
  }

  private getEditor(): vscode.TextEditor | undefined {
    const ed = vscode.window.activeTextEditor;
    return ed?.document.languageId === 'todo' ? ed : undefined;
  }

  open(toSide: boolean): void {
    const editor = this.getEditor();
    if (!editor) {
      void vscode.window.showWarningMessage('请先打开 .todo 文件');
      return;
    }
    const column = toSide
      ? vscode.ViewColumn.Beside
      : (editor.viewColumn ?? vscode.ViewColumn.Active);
    this.showPreview(editor.document, column);
  }

  private showPreview(document: vscode.TextDocument, column: vscode.ViewColumn): void {
    const key = document.uri.toString();
    const existing = this.panels.get(key);
    if (existing) {
      existing.reveal(column);
      this.updatePanel(existing, document);
      return;
    }

    const title = path.basename(document.fileName) || 'Tasks';
    const panel = vscode.window.createWebviewPanel(
      'totaskPreview',
      `${title} (预览)`,
      column,
      {
        enableScripts: false,
        retainContextWhenHidden: true,
        localResourceRoots: [],
      }
    );

    panel.iconPath = new vscode.ThemeIcon('open-preview');
    panel.webview.options = { enableScripts: false };

    panel.onDidDispose(() => {
      this.panels.delete(key);
      const t = this.pendingUpdate.get(key);
      if (t) {
        clearTimeout(t);
        this.pendingUpdate.delete(key);
      }
    });

    this.panels.set(key, panel);
    this.updatePanel(panel, document);
  }

  private updatePanel(panel: vscode.WebviewPanel, document: vscode.TextDocument): void {
    const lines = document.getText().split(/\r?\n/);
    const title = path.basename(document.fileName) || 'Tasks';
    panel.webview.html = buildWebviewHtml(lines, title, panel.webview.cspSource);
    panel.title = `${title} (预览)`;
  }

  private onDocumentChange(e: vscode.TextDocumentChangeEvent): void {
    if (e.document.languageId !== 'todo') {
      return;
    }
    const key = e.document.uri.toString();
    const panel = this.panels.get(key);
    if (!panel) {
      return;
    }

    const prev = this.pendingUpdate.get(key);
    if (prev) {
      clearTimeout(prev);
    }
    this.pendingUpdate.set(
      key,
      setTimeout(() => {
        this.pendingUpdate.delete(key);
        if (panel.visible) {
          this.updatePanel(panel, e.document);
        }
      }, 200)
    );
  }

  private refreshVisiblePanels(): void {
    const editor = this.getEditor();
    if (!editor) {
      return;
    }
    const panel = this.panels.get(editor.document.uri.toString());
    if (panel?.visible) {
      this.updatePanel(panel, editor.document);
    }
  }

  private onDocumentClosed(doc: vscode.TextDocument): void {
    const key = doc.uri.toString();
    const panel = this.panels.get(key);
    if (panel) {
      panel.dispose();
    }
  }
}

export function registerPreview(context: vscode.ExtensionContext): void {
  new TodoPreviewManager(context);
}

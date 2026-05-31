import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { countTasks, findArchiveIndex, isProjectHeader, parseTaskLine } from './taskModel';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function classifyTag(tag: string): string {
  const t = tag.toLowerCase();
  if (t === 'critical') {
    return 'tag-critical';
  }
  if (t === 'high') {
    return 'tag-high';
  }
  if (t === 'low') {
    return 'tag-low';
  }
  if (t === 'today') {
    return 'tag-today';
  }
  if (t === 'done' || t === 'cancelled') {
    return 'tag-meta';
  }
  return 'tag';
}

function formatTags(text: string): string {
  return escapeHtml(text).replace(
    /@([\w][\w\d.\-!?+]*)(?:\(([^)]*)\))?/g,
    (_m, name: string, arg?: string) => {
      const cls = classifyTag(name);
      const inner = arg !== undefined ? `${escapeHtml(name)}(${escapeHtml(arg)})` : escapeHtml(name);
      return `<span class="${cls}">@${inner}</span>`;
    }
  );
}

function formatInlineMarkup(text: string): string {
  let s = formatTags(text);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
  s = s.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>');
  s = s.replace(/(?<!_)_([^_]+?)_(?!_)/g, '<em>$1</em>');
  return s;
}

function lineToHtml(line: string): string {
  if (/^\s*#/.test(line)) {
    const text = line.replace(/^\s*#\s?/, '');
    return text.trim() ? `<p class="comment">${formatInlineMarkup(text)}</p>` : '';
  }

  const parsed = parseTaskLine(line, 0);
  if (parsed) {
    const cls =
      parsed.status === 'done'
        ? 'task-done'
        : parsed.status === 'cancelled'
          ? 'task-cancelled'
          : 'task-pending';
    const bullet = escapeHtml(parsed.bullet);
    const body = formatInlineMarkup(parsed.body);
    return `<div class="task ${cls}"><span class="bullet">${bullet}</span> ${body}</div>`;
  }
  if (isProjectHeader(line)) {
    return `<h2 class="project">${formatInlineMarkup(line.trim())}</h2>`;
  }
  if (/^＿+$/.test(line.trim())) {
    return '<hr class="archive-rule"/>';
  }
  if (/^\s*---.{3,5}---+$/.test(line)) {
    return '<hr class="separator"/>';
  }
  if (line.trim()) {
    return `<p class="note">${formatInlineMarkup(line)}</p>`;
  }
  return '';
}

/** 编辑器 Webview 预览样式（跟随 VS Code 主题） */
export const WEBVIEW_STYLES = `
body {
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  color: var(--vscode-editor-foreground);
  background: var(--vscode-editor-background);
  line-height: 1.55;
  margin: 0;
  padding: 1rem 1.25rem 2rem;
  box-sizing: border-box;
}
.preview-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid var(--vscode-panel-border, #444);
  padding-bottom: 0.6rem;
  margin-bottom: 1rem;
}
.preview-header h1 {
  font-size: 1.35rem;
  font-weight: 600;
  margin: 0;
  color: var(--vscode-titleBar-activeForeground, inherit);
}
.stats {
  font-size: 0.85em;
  color: var(--vscode-descriptionForeground);
  white-space: nowrap;
}
.stats span { margin-left: 0.75em; }
.project {
  color: var(--vscode-textLink-foreground, #6699cc);
  margin: 1.1rem 0 0.4rem;
  font-size: 1.05rem;
  font-weight: 600;
}
.task {
  margin: 0.3rem 0;
  padding: 0.2rem 0.35rem;
  border-radius: 3px;
}
.task-pending .bullet { color: var(--vscode-charts-blue, #6699cc); }
.task-done { opacity: 0.72; text-decoration: line-through; }
.task-done .bullet { color: var(--vscode-charts-green, #99cc99); }
.task-cancelled { opacity: 0.55; }
.tag-critical { background: #EB7875; color: #2d2d2d; padding: 0 4px; border-radius: 2px; font-weight: bold; }
.tag-high { background: #f99157; color: #2d2d2d; padding: 0 4px; border-radius: 2px; }
.tag-low { background: #d3d0c8; color: #2d2d2d; padding: 0 4px; border-radius: 2px; }
.tag-today { background: #99cc99; color: #2d2d2d; padding: 0 4px; border-radius: 2px; }
.tag-meta { color: var(--vscode-descriptionForeground); font-size: 0.92em; }
.tag { color: var(--vscode-symbolIcon-propertyForeground, #cc99cc); }
.note, .comment {
  margin: 0.15rem 0 0.15rem 1.75rem;
  color: var(--vscode-descriptionForeground);
  font-size: 0.95em;
}
.comment { font-style: italic; }
section.archive h2 {
  font-size: 1rem;
  color: var(--vscode-descriptionForeground);
  margin: 1.5rem 0 0.5rem;
}
hr.separator { border: none; border-top: 1px dashed var(--vscode-panel-border, #ccc); margin: 1rem 0; }
hr.archive-rule { border: none; border-top: 3px double var(--vscode-panel-border, #ddd); margin: 1.5rem 0; }
a { color: var(--vscode-textLink-foreground); }
`;

const EXPORT_STYLES = `
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 52rem; margin: 2rem auto; padding: 0 1rem; color: #2d2d2d; background: #fafafa; line-height: 1.55; }
h1 { font-size: 1.5rem; border-bottom: 2px solid #6699cc; padding-bottom: 0.5rem; }
.project { color: #6699cc; margin: 1.25rem 0 0.5rem; font-size: 1.1rem; }
.task { margin: 0.35rem 0; padding: 0.25rem 0.5rem; border-radius: 4px; }
.task-pending .bullet { color: #6699cc; }
.task-done { opacity: 0.75; text-decoration: line-through; }
.task-done .bullet { color: #99cc99; }
.task-cancelled { opacity: 0.6; }
.tag-critical { background: #EB7875; color: #2d2d2d; padding: 0 4px; border-radius: 2px; font-weight: bold; }
.tag-high { background: #f99157; color: #2d2d2d; padding: 0 4px; border-radius: 2px; }
.tag-low { background: #d3d0c8; padding: 0 4px; border-radius: 2px; }
.tag-today { background: #99cc99; padding: 0 4px; border-radius: 2px; }
.tag-meta { color: #888; font-size: 0.9em; }
.tag { color: #cc99cc; }
.note, .comment { margin: 0 0 0 1.5rem; color: #555; font-size: 0.95em; }
hr.separator { border: none; border-top: 1px dashed #ccc; margin: 1rem 0; }
hr.archive-rule { border: none; border-top: 3px double #ddd; margin: 2rem 0; }
`;

export function renderTodoSections(lines: string[]): { active: string; archive: string; stats: string } {
  const archiveIdx = findArchiveIndex(lines);
  const activeLines = archiveIdx >= 0 ? lines.slice(0, archiveIdx) : lines;
  const archiveLines = archiveIdx >= 0 ? lines.slice(archiveIdx) : [];
  const body = (chunk: string[]) => chunk.map(lineToHtml).filter(Boolean).join('\n');
  const { pending, done, cancelled } = countTasks(lines);
  const stats = `<span>☐ ${pending}</span><span>✔ ${done}</span><span>✘ ${cancelled}</span>`;
  return { active: body(activeLines), archive: body(archiveLines), stats };
}

export function buildWebviewHtml(lines: string[], title: string, cspSource: string): string {
  const { active, archive, stats } = renderTodoSections(lines);
  const nonce = getNonce();
  const archiveSection = archive
    ? `<section class="archive"><h2>Archive</h2>${archive}</section>`
    : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline';">
<style nonce="${nonce}">${WEBVIEW_STYLES}</style>
</head>
<body>
<div class="preview-header">
  <h1>${escapeHtml(title)}</h1>
  <div class="stats">${stats}</div>
</div>
<section class="active">${active}</section>
${archiveSection}
</body>
</html>`;
}

export function documentToHtml(lines: string[], title: string): string {
  const { active, archive } = renderTodoSections(lines);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(title)}</title>
<style>${EXPORT_STYLES}</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<section class="active">${active}</section>
${archive ? `<section class="archive"><h2>Archive</h2>${archive}</section>` : ''}
</body>
</html>`;
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let n = '';
  for (let i = 0; i < 32; i++) {
    n += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return n;
}

export async function exportToHtml(editor: vscode.TextEditor, saveAs = false): Promise<void> {
  const lines = editor.document.getText().split(/\r?\n/);
  const title = path.basename(editor.document.fileName) || 'Tasks';
  const html = documentToHtml(lines, title);

  if (saveAs) {
    const uri = await vscode.window.showSaveDialog({
      filters: { HTML: ['html'] },
      defaultUri: editor.document.uri.with({ path: editor.document.uri.path + '.html' }),
    });
    if (!uri) {
      return;
    }
    fs.writeFileSync(uri.fsPath, html, 'utf8');
    void vscode.window.showInformationMessage(`已保存 ${uri.fsPath}`);
    await vscode.env.openExternal(uri);
    return;
  }

  const tmpDir = path.join(os.tmpdir(), 'totask');
  fs.mkdirSync(tmpDir, { recursive: true });
  const out = path.join(tmpDir, `${title.replace(/[^\w.-]/g, '_')}.html`);
  fs.writeFileSync(out, html, 'utf8');
  await vscode.env.openExternal(vscode.Uri.file(out));
}

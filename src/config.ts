import * as vscode from 'vscode';

export interface TotaskSettings {
  openBullet: string;
  doneBullet: string;
  cancelledBullet: string;
  marginSpaces: string;
  taskSpace: string;
  dateFormat: string;
  doneTag: boolean;
  archiveName: string;
  newOnTop: boolean;
  projectTagPostfix: boolean;
  decimalMinutes: boolean;
}

export function getSettings(): TotaskSettings {
  const cfg = vscode.workspace.getConfiguration('totask');
  const margin = cfg.get<number>('beforeTasksBulletMargin', 2);
  return {
    openBullet: cfg.get<string>('openTasksBullet', '☐'),
    doneBullet: cfg.get<string>('doneTasksBullet', '✔'),
    cancelledBullet: cfg.get<string>('cancelledTasksBullet', '✘'),
    marginSpaces: ' '.repeat(Math.max(0, margin)),
    taskSpace: ' ',
    dateFormat: cfg.get<string>('dateFormat', '(%y-%m-%d %H:%M)'),
    doneTag: cfg.get<boolean>('doneTag', true),
    archiveName: cfg.get<string>('archiveName', 'Archive:'),
    newOnTop: cfg.get<boolean>('newOnTop', true),
    projectTagPostfix: cfg.get<boolean>('projectTag', true),
    decimalMinutes: cfg.get<boolean>('decimalMinutes', false),
  };
}

/** 日期格式：(%y-%m-%d %H:%M) */
export function formatDate(fmt: string, date: Date = new Date()): string {
  const y = date.getFullYear();
  const yy = String(y).slice(-2);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const H = String(date.getHours()).padStart(2, '0');
  const M = String(date.getMinutes()).padStart(2, '0');
  const S = String(date.getSeconds()).padStart(2, '0');

  return fmt
    .replace(/%Y/g, String(y))
    .replace(/%y/g, yy)
    .replace(/%m/g, m)
    .replace(/%d/g, d)
    .replace(/%H/g, H)
    .replace(/%M/g, M)
    .replace(/%S/g, S);
}

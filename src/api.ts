import type { Entry } from "./types";

interface SillyTavernEntry {
  key: string[];
  keysecondary: string[];
  comment: string;
  content: string;
  [k: string]: unknown;
}

function entriesToSillyTavern(entries: Entry[]): string {
  const defaults = getExportTemplate();
  const obj: Record<string, SillyTavernEntry> = {};
  entries.forEach((entry, i) => {
    const extra = (entry.extra ?? {}) as Record<string, unknown>;
    const { keysecondary, ...rest } = extra;
    obj[String(i)] = {
      uid: i,
      ...defaults,
      ...rest,
      key: entry.keys,
      keysecondary: (keysecondary as string[]) ?? [],
      comment: entry.name,
      content: entry.content,
      displayIndex: i,
    };
  });
  return JSON.stringify({ entries: obj }, null, 4);
}

interface RawSillyTavernEntry {
  key?: string[];
  keysecondary?: string[];
  comment?: string;
  content?: string;
  [k: string]: unknown;
}

interface DiskFile {
  fileName: string;
  entries: Record<string, RawSillyTavernEntry>;
}

export async function loadAllFromDisk(): Promise<DiskFile[]> {
  const res = await fetch("/api/load-all");
  return res.json();
}

export function exportCategoryToFile(fileName: string, entries: Entry[]): void {
  const content = entriesToSillyTavern(entries);
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileName}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function saveCategoryFile(fileName: string, entries: Entry[]): Promise<void> {
  await fetch("/api/save-category", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName, content: entriesToSillyTavern(entries) }),
  });
}

export async function deleteCategoryFile(fileName: string): Promise<void> {
  await fetch("/api/delete-category", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName }),
  });
}

export async function renameCategoryFile(oldName: string, newName: string): Promise<void> {
  await fetch("/api/rename-category", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ oldName, newName }),
  });
}

export interface AppSettings {
  clipboardTemplate?: string;
  exportTemplate?: Record<string, unknown>;
}

let _exportTemplate: Record<string, unknown> = {};

export function getExportTemplate(): Record<string, unknown> {
  return _exportTemplate;
}

export function setExportTemplate(t: Record<string, unknown>) {
  _exportTemplate = t;
}

export async function createSnapshot(): Promise<void> {
  await fetch("/api/snapshot", { method: "POST" });
}

export async function getCurrentSnapshot(): Promise<Record<string, unknown>> {
  const res = await fetch("/api/snapshot-current");
  return res.json();
}

export async function restoreRawSnapshot(snapshot: Record<string, unknown>): Promise<void> {
  await fetch("/api/restore-raw", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snapshot),
  });
}

const PREV_SNAPSHOT_KEY = "lorebook-previous-snapshot";

export function savePreviousSnapshot(snapshot: Record<string, unknown>): void {
  localStorage.setItem(PREV_SNAPSHOT_KEY, JSON.stringify(snapshot));
}

export function loadPreviousSnapshot(): Record<string, unknown> | null {
  const raw = localStorage.getItem(PREV_SNAPSHOT_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function clearPreviousSnapshot(): void {
  localStorage.removeItem(PREV_SNAPSHOT_KEY);
}

export interface BackupInfo {
  name: string;
  size: number;
}

export async function listBackups(): Promise<BackupInfo[]> {
  const res = await fetch("/api/backups");
  return res.json();
}

export async function restoreSnapshot(snapshotName?: string): Promise<{ ok: boolean; error?: string; restored?: string }> {
  const res = await fetch("/api/restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ snapshotName: snapshotName ?? "" }),
  });
  return res.json();
}

export async function loadSettings(): Promise<AppSettings> {
  const res = await fetch("/api/settings");
  return res.json();
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings, null, 2),
  });
}

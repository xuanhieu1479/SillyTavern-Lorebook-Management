import type { Entry } from "./types";

interface SillyTavernEntry {
  key: string[];
  keysecondary: string[];
  comment: string;
  content: string;
  [k: string]: unknown;
}

// Runtime-loaded baseline for brand-new entries in empty lorebook files.
// Loaded once at module init from public/new-entry-template.json (an ST-format
// world file; entry "0" is used as the baseline). If loading fails, we fall
// back to a minimal object — ST will supply its own runtime defaults for any
// missing fields. To update the baseline when ST's defaults drift, replace the
// public/new-entry-template.json file with a fresh ST-created lorebook; no
// source edit needed.
let _baselineNewEntryRaw: Record<string, unknown> | null = null;

const FALLBACK_BASELINE: Record<string, unknown> = {
  uid: 0,
  key: [],
  keysecondary: [],
  comment: "",
  content: "",
  displayIndex: 0,
};

async function loadBaselineTemplate(): Promise<void> {
  try {
    const res = await fetch("/new-entry-template.json");
    if (!res.ok) return;
    const data = await res.json() as { entries?: Record<string, Record<string, unknown>> };
    const firstEntry = data.entries ? Object.values(data.entries)[0] : null;
    if (firstEntry) _baselineNewEntryRaw = firstEntry;
  } catch {
    // Silent fallback — baseline is rarely used anyway (only in truly empty files).
  }
}

void loadBaselineTemplate();

function nextUidAndDisplayIndex(siblings: Entry[]): { uid: number; displayIndex: number } {
  let maxUid = -1;
  let maxDisplayIndex = -1;
  for (const e of siblings) {
    const r = e.extra?._raw as Record<string, unknown> | undefined;
    if (!r) continue;
    if (typeof r.uid === "number" && r.uid > maxUid) maxUid = r.uid;
    if (typeof r.displayIndex === "number" && r.displayIndex > maxDisplayIndex) maxDisplayIndex = r.displayIndex;
  }
  return { uid: maxUid + 1, displayIndex: maxDisplayIndex + 1 };
}

export function makeRawForNewEntry(siblings: Entry[]): Record<string, unknown> {
  const { uid, displayIndex } = nextUidAndDisplayIndex(siblings);
  const lastSibling = siblings.length > 0 ? siblings[siblings.length - 1] : null;
  const templateRaw = (lastSibling?.extra?._raw as Record<string, unknown> | undefined)
    ?? _baselineNewEntryRaw
    ?? FALLBACK_BASELINE;
  const clone = structuredClone(templateRaw) as Record<string, unknown>;
  clone.uid = uid;
  clone.displayIndex = displayIndex;
  clone.keysecondary = [];
  return clone;
}

export function cloneRawForDuplicate(sourceRaw: Record<string, unknown>, siblings: Entry[]): Record<string, unknown> {
  const { uid, displayIndex } = nextUidAndDisplayIndex(siblings);
  const clone = structuredClone(sourceRaw) as Record<string, unknown>;
  clone.uid = uid;
  clone.displayIndex = displayIndex;
  return clone;
}

function entriesToSillyTavern(entries: Entry[], fileExtras: Record<string, unknown> = {}): string {
  const obj: Record<string, SillyTavernEntry> = {};

  const existingUids = entries
    .map((e) => (e.extra?._raw as Record<string, unknown> | undefined)?.uid)
    .filter((u): u is number => typeof u === "number");
  let nextUid = existingUids.length ? Math.max(...existingUids) + 1 : 0;

  entries.forEach((entry, i) => {
    const raw = (entry.extra?._raw ?? null) as Record<string, unknown> | null;
    let out: Record<string, unknown>;
    let uid: number;

    if (raw) {
      uid = typeof raw.uid === "number" ? raw.uid : nextUid++;
      out = {
        ...raw,
        key: entry.keys,
        comment: entry.name,
        content: entry.content,
      };
      out.uid = uid;
    } else {
      uid = nextUid++;
      out = {
        uid,
        key: entry.keys,
        keysecondary: [],
        comment: entry.name,
        content: entry.content,
        displayIndex: i,
      };
    }

    obj[String(uid)] = out as SillyTavernEntry;
  });

  return JSON.stringify({ ...fileExtras, entries: obj }, null, 4);
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
  fileExtras: Record<string, unknown>;
  entries: Record<string, RawSillyTavernEntry>;
}

export async function loadAllFromDisk(): Promise<DiskFile[]> {
  const res = await fetch("/api/load-all");
  return res.json();
}

export async function saveCategoryFile(fileName: string, entries: Entry[], fileExtras: Record<string, unknown> = {}): Promise<void> {
  await fetch("/api/save-category", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName, content: entriesToSillyTavern(entries, fileExtras) }),
  });
}

export interface AppSettings {
  clipboardTemplate?: string;
  dataDir?: string;
  latestSnapshot?: string | null;
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

export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  const existing = await loadSettings();
  const merged = { ...existing, ...settings };
  await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(merged, null, 2),
  });
}

import type { Entry } from "./types";

interface SillyTavernEntry {
  key: string[];
  keysecondary: string[];
  comment: string;
  content: string;
  [k: string]: unknown;
}

// Baseline defaults matching what ST writes for a freshly-created entry. Used only
// when a file has zero existing entries to clone from.
const BASELINE_NEW_ENTRY_RAW: Record<string, unknown> = {
  uid: 0,
  key: [],
  keysecondary: [],
  comment: "",
  content: "",
  constant: false,
  vectorized: false,
  selective: true,
  selectiveLogic: 0,
  addMemo: false,
  order: 100,
  position: 0,
  disable: false,
  ignoreBudget: false,
  excludeRecursion: false,
  preventRecursion: false,
  matchPersonaDescription: false,
  matchCharacterDescription: false,
  matchCharacterPersonality: false,
  matchCharacterDepthPrompt: false,
  matchScenario: false,
  matchCreatorNotes: false,
  delayUntilRecursion: 0,
  probability: 100,
  useProbability: true,
  depth: 4,
  outletName: "",
  group: "",
  groupOverride: false,
  groupWeight: 100,
  scanDepth: null,
  caseSensitive: null,
  matchWholeWords: null,
  useGroupScoring: null,
  automationId: "",
  role: null,
  sticky: null,
  cooldown: null,
  delay: null,
  triggers: [],
  displayIndex: 0,
  characterFilter: { isExclude: false, names: [], tags: [] },
};

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
  const templateRaw = (lastSibling?.extra?._raw as Record<string, unknown> | undefined) ?? BASELINE_NEW_ENTRY_RAW;
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

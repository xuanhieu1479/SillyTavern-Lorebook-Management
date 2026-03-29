import type { Entry, Category } from "./types";

const ENTRIES_KEY = "lorebook-entries";
const CATEGORIES_KEY = "lorebook-categories";

export function loadEntries(): Entry[] {
  const raw = localStorage.getItem(ENTRIES_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as Entry[];
}

export function saveEntries(entries: Entry[]): void {
  localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
}

export function loadCategories(): Category[] {
  const raw = localStorage.getItem(CATEGORIES_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as Category[];
}

export function saveCategories(categories: Category[]): void {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
}

export function exportToFile(entries: Entry[], categories: Category[]): void {
  const blob = new Blob([JSON.stringify({ entries, categories }, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "lorebook.json";
  a.click();
  URL.revokeObjectURL(url);
}

interface RawSillyTavernEntry {
  key?: string[];
  keysecondary?: string[];
  comment?: string;
  content?: string;
  [k: string]: unknown;
}

export interface ImportResult {
  fileName: string;
  entries: Omit<Entry, "id" | "category">[];
}

export function importFromFile(): Promise<ImportResult> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error("No file selected"));
      const fileName = file.name.replace(/\.json$/i, "");
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string);

          // SillyTavern format: { entries: { "0": {...}, "1": {...} } }
          if (data.entries && typeof data.entries === "object" && !Array.isArray(data.entries)) {
            const parsed: Omit<Entry, "id" | "category">[] = [];
            for (const val of Object.values(data.entries) as RawSillyTavernEntry[]) {
              const { key, keysecondary, comment, content, ...rest } = val;
              parsed.push({
                name: comment ?? "",
                keys: key ?? [],
                content: content ?? "",
                extra: { keysecondary: keysecondary ?? [], ...rest },
              });
            }
            resolve({ fileName, entries: parsed });
            return;
          }

          reject(new Error("Unrecognized file format"));
        } catch {
          reject(new Error("Invalid JSON file"));
        }
      };
      reader.readAsText(file);
    };
    input.click();
  });
}

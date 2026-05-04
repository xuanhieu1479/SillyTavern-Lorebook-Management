import { useState, useEffect, useCallback, useRef } from "react";
import toast, { Toaster } from "react-hot-toast";
import type { Entry, Category } from "./types";

const MAX_TOASTS = 3;
const toastQueue: string[] = [];
const TOAST_COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f59e0b", // amber
  "#10b981", // emerald
  "#06b6d4", // cyan
];
let colorIndex = 0;

function showToast(message: string, type: "success" | "error") {
  if (toastQueue.length >= MAX_TOASTS) {
    const oldest = toastQueue.shift();
    if (oldest) toast.dismiss(oldest);
  }

  if (type === "error") {
    const id = toast.error(message);
    toastQueue.push(id);
  } else {
    const color = TOAST_COLORS[colorIndex % TOAST_COLORS.length];
    colorIndex++;
    const id = toast.success(message, {
      iconTheme: { primary: color, secondary: "white" },
      style: { borderLeft: `4px solid ${color}` },
    });
    toastQueue.push(id);
  }
}
import { saveCategoryFile, loadAllFromDisk, loadSettings, saveSettings, createSnapshot, restoreSnapshot, getCurrentSnapshot, restoreRawSnapshot, savePreviousSnapshot, loadPreviousSnapshot, clearPreviousSnapshot, makeRawForNewEntry, cloneRawForDuplicate } from "./api";
import EntryForm from "./EntryForm";
import type { EntryFormHandle } from "./EntryForm";
import EntryList from "./EntryList";
import CategoryManager from "./CategoryManager";
import SettingsModal, { formatClipboard } from "./SettingsModal";
import RestoreModal from "./RestoreModal";
import { searchEntries, filterByCategory, type SearchMode } from "./search";
import "./App.css";

function generateId(): string {
  return crypto.randomUUID();
}

const FAVORITES_KEY = "lorebook-favorites";
const MAX_FAVORITES = 3;

function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveFavorites(names: string[]): void {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(names));
}

export default function App() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("name");
  const [filterCat, setFilterCat] = useState("");
  const [editing, setEditing] = useState<Entry | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [showRestore, setShowRestore] = useState(false);
  const [clipboardTemplate, setClipboardTemplate] = useState("{{content}}");
  const [dataDir, setDataDir] = useState("");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>(loadFavorites);
  const formRef = useRef<EntryFormHandle>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const undoLockRef = useRef(false);
  const highlightTimerRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  const lastCtrlFRef = useRef(0);

  function toggleFavorite(name: string) {
    setFavorites((prev) => {
      if (prev.includes(name)) {
        const next = prev.filter((f) => f !== name);
        saveFavorites(next);
        return next;
      }
      if (prev.length >= MAX_FAVORITES) {
        showToast(`Maximum ${MAX_FAVORITES} favorites allowed.`, "error");
        return prev;
      }
      const next = [...prev, name];
      saveFavorites(next);
      return next;
    });
  }

  useEffect(() => {
    if (!showCategories) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowCategories(false);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [showCategories]);

  const loadFromDisk = useCallback(async () => {
    try {
      const [files, settings] = await Promise.all([loadAllFromDisk(), loadSettings()]);

      const newCategories: Category[] = [];
      const newEntries: Entry[] = [];

      for (const file of files) {
        const catId = generateId();
        newCategories.push({ id: catId, name: file.fileName, extras: file.fileExtras });

        for (const val of Object.values(file.entries)) {
          const v = val as Record<string, unknown>;
          newEntries.push({
            id: generateId(),
            name: (v.comment as string) ?? "",
            keys: (v.key as string[]) ?? [],
            content: (v.content as string) ?? "",
            category: catId,
            extra: { _raw: v },
          });
        }
      }

      setCategories(newCategories);
      setEntries(newEntries);
      setEditing(null);
      setFilterCat("");
      setClipboardTemplate(settings.clipboardTemplate || "{{content}}");
      setDataDir(settings.dataDir ?? "");
    } catch (err) {
      console.error("Failed to load from disk:", err);
    }
  }, []);

  useEffect(() => {
    loadFromDisk();
  }, [loadFromDisk]);

  // Ctrl+Z to restore latest snapshot (2s debounce, disabled when input focused)
  useEffect(() => {
    async function handleUndo(e: KeyboardEvent) {
      if (e.key !== "z" || !e.ctrlKey || e.shiftKey || e.altKey) return;
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (undoLockRef.current) return;

      e.preventDefault();
      undoLockRef.current = true;
      setTimeout(() => { undoLockRef.current = false; }, 2000);

      try {
        const settings = await loadSettings();
        const snapshotName = settings.latestSnapshot;
        if (!snapshotName) return;
        const current = await getCurrentSnapshot();
        savePreviousSnapshot(current);
        const result = await restoreSnapshot(snapshotName);
        if (result.error) {
          showToast(result.error, "error");
        } else {
          showToast(`Restored: ${result.restored}`, "success");
          await saveSettings({ latestSnapshot: null });
          await loadFromDisk();
        }
      } catch {
        showToast("Failed to restore snapshot.", "error");
      }
    }
    window.addEventListener("keydown", handleUndo);
    return () => window.removeEventListener("keydown", handleUndo);
  }, [loadFromDisk]);

  // Ctrl+Y to redo (restore previousSnapshot from localStorage)
  useEffect(() => {
    async function handleRedo(e: KeyboardEvent) {
      if (e.key !== "y" || !e.ctrlKey || e.shiftKey || e.altKey) return;
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (undoLockRef.current) return;

      e.preventDefault();
      undoLockRef.current = true;
      setTimeout(() => { undoLockRef.current = false; }, 2000);

      const prev = loadPreviousSnapshot();
      if (!prev) return;

      try {
        await restoreRawSnapshot(prev);
        clearPreviousSnapshot();
        showToast("Redo: restored previous state.", "success");
        await loadFromDisk();
      } catch {
        showToast("Failed to redo.", "error");
      }
    }
    window.addEventListener("keydown", handleRedo);
    return () => window.removeEventListener("keydown", handleRedo);
  }, [loadFromDisk]);

  // Ctrl+F to focus search; Ctrl+F+F (within 500ms) for browser search
  useEffect(() => {
    function handleCtrlF(e: KeyboardEvent) {
      if (e.key !== "f" || !e.ctrlKey || e.shiftKey || e.altKey) return;

      const now = Date.now();
      if (now - lastCtrlFRef.current < 500) {
        lastCtrlFRef.current = 0;
        return;
      }

      e.preventDefault();
      lastCtrlFRef.current = now;
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
    window.addEventListener("keydown", handleCtrlF);
    return () => window.removeEventListener("keydown", handleCtrlF);
  }, []);


  function syncCategoryToDisk(catId: string, allEntries: Entry[], catName?: string) {
    const cat = categories.find((c) => c.id === catId);
    const name = catName ?? cat?.name;
    if (!name) return;
    const catEntries = allEntries.filter((e) => e.category === catId);
    saveCategoryFile(name, catEntries, cat?.extras ?? {});
  }

  const filtered = searchEntries(filterByCategory(entries, filterCat), search, searchMode).map((r) => r.entry);

  function handleSave(name: string, keys: string[], content: string, category: string) {
    if (editing) {
      const oldCategory = editing.category;
      const updatedEntry = { ...editing, name, keys, content, category };
      setEntries((prev) => {
        const next = prev.map((e) => (e.id === editing.id ? updatedEntry : e));
        syncCategoryToDisk(category, next);
        if (oldCategory !== category) {
          syncCategoryToDisk(oldCategory, next);
        }
        return next;
      });
      setEditing(updatedEntry);
    } else {
      setEntries((prev) => {
        const siblings = prev.filter((e) => e.category === category);
        const newRaw = makeRawForNewEntry(siblings);
        const newEntry: Entry = {
          id: generateId(),
          name,
          keys,
          content,
          category,
          extra: { _raw: newRaw },
        };
        const next = [...prev, newEntry];
        syncCategoryToDisk(category, next);
        return next;
      });
    }
    dirtyRef.current = true;
  }

  function handleDelete(id: string) {
    createSnapshot();
    const entry = entries.find((e) => e.id === id);
    setEntries((prev) => {
      const next = prev.filter((e) => e.id !== id);
      if (entry) syncCategoryToDisk(entry.category, next);
      return next;
    });
    if (editing?.id === id) setEditing(null);
  }

  function handleEdit(entry: Entry) {
    if (dirtyRef.current) {
      createSnapshot();
      dirtyRef.current = false;
    }
    setEditing(entry);
  }

  function handleDuplicate(id: string) {
    const newId = generateId();
    setEntries((prev) => {
      const source = prev.find((e) => e.id === id);
      if (!source) return prev;
      const siblings = prev.filter((e) => e.category === source.category);
      const sourceRaw = source.extra?._raw as Record<string, unknown> | undefined;
      const newRaw = sourceRaw
        ? cloneRawForDuplicate(sourceRaw, siblings)
        : makeRawForNewEntry(siblings);
      const duplicate: Entry = {
        ...source,
        id: newId,
        extra: { _raw: newRaw },
      };
      const next = [...prev, duplicate];
      syncCategoryToDisk(source.category, next);
      return next;
    });
    setHighlightId(newId);
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightId(null);
      highlightTimerRef.current = null;
    }, 5000);
  }

  function handleMove(id: string, categoryId: string) {
    const entry = entries.find((e) => e.id === id);
    setEntries((prev) => {
      const next = prev.map((e) => (e.id === id ? { ...e, category: categoryId } : e));
      if (entry) {
        syncCategoryToDisk(entry.category, next);
        syncCategoryToDisk(categoryId, next);
      }
      return next;
    });
  }

  return (
    <div className="app">
      <header>
        <div className="header-left">
          <h1>Lorebook Management</h1>
          {favorites.length > 0 && (
            <div className="favorite-tags">
              {favorites.map((fname) => {
                const entry = entries.find((e) => e.name === fname);
                if (!entry) return null;
                const displayName = fname.includes("-")
                  ? fname.split("-").pop()!.trim()
                  : fname;
                return (
                  <button
                    key={fname}
                    className="favorite-tag"
                    onClick={() => handleEdit(entry)}
                    title={fname}
                  >
                    {displayName}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="header-actions">
          {!editing && (
            <button className="header-btn header-submit" title="Add" onClick={() => formRef.current?.submit()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14"/><path d="M5 12h14"/>
              </svg>
            </button>
          )}
          <div className="header-divider" />
          <button className="header-btn" title="Categories" onClick={() => setShowCategories(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
          </button>
          <button className="header-btn" title="Refresh" onClick={loadFromDisk}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M21 21v-5h-5"/>
            </svg>
          </button>
          <button className="header-btn" title="Settings" onClick={() => setShowSettings(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
          <button className="header-btn" title="Open worlds folder" onClick={() => fetch("/api/open-folder", { method: "POST" })}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
          <button className="header-btn" title="Restore snapshot" onClick={() => setShowRestore(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><circle cx="12" cy="12" r="1"/>
            </svg>
          </button>
        </div>
      </header>

      <div className="main-layout">
        <div className="left-panel">
          <div className="filters">
            <div className="filters-row">
              <div className="search-input-wrapper">
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search... (quotes for phrase, | for OR)"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    className="search-clear-btn"
                    onClick={() => setSearch("")}
                    type="button"
                    title="Clear search"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
            <div className="filters-row">
              <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <label className="search-mode-toggle">
                <input
                  type="checkbox"
                  checked={searchMode === "content"}
                  onChange={(e) => setSearchMode(e.target.checked ? "content" : "name")}
                />
                <span className="toggle-label">{searchMode === "name" ? "Name" : "Content"}</span>
              </label>
            </div>
          </div>
          <EntryList
            entries={filtered}
            categories={categories}
            onEdit={handleEdit}
            onDelete={handleDelete}
            editingId={editing?.id ?? null}
            highlightId={highlightId}
            onDuplicate={handleDuplicate}
            onMove={handleMove}
            onCopy={(content) => {
              navigator.clipboard.writeText(formatClipboard(clipboardTemplate, content));
              showToast("Copied to clipboard", "success");
            }}
          />
        </div>

        <div className="right-panel">
          <EntryForm
            ref={formRef}
            editing={editing}
            categories={categories}
            onSave={handleSave}
            onCancel={() => setEditing(null)}
            isFavorite={editing ? favorites.includes(editing.name) : false}
            onToggleFavorite={editing ? () => toggleFavorite(editing.name) : undefined}
            searchQuery={search}
            searchMode={searchMode}
          />
        </div>

      </div>

      {showCategories && (
        <div className="modal-backdrop" onClick={() => setShowCategories(false)}>
          <div className="modal categories-modal" onClick={(e) => e.stopPropagation()}>
            <CategoryManager
              categories={categories}
              entries={entries}
              highlightId={highlightId}
              onDuplicate={handleDuplicate}
              onMove={handleMove}
              onDelete={handleDelete}
            />
            <div className="modal-actions">
              <button onClick={() => setShowCategories(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showRestore && (
        <RestoreModal
          onRestore={loadFromDisk}
          onClose={() => setShowRestore(false)}
        />
      )}

      {showSettings && (
        <SettingsModal
          clipboardTemplate={clipboardTemplate}
          dataDir={dataDir}
          onSave={({ clipboardTemplate: ct, dataDir: dd }) => {
            setClipboardTemplate(ct);
            setDataDir(dd);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}

      <Toaster
        position="top-center"
        toastOptions={{
          duration: 2000,
          style: {
            background: "var(--surface)",
            color: "var(--text-h)",
            border: "1px solid var(--border)",
          },
          success: {
            iconTheme: { primary: "var(--accent)", secondary: "white" },
          },
          error: {
            iconTheme: { primary: "var(--danger)", secondary: "white" },
          },
        }}
        containerStyle={{ top: 20 }}
      />
    </div>
  );
}

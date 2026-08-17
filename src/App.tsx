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
import { saveCategoryFile, loadAllFromDisk, loadSettings, loadDataSource, saveSettings, makeRawForNewEntry, cloneRawForDuplicate } from "./api";
import EntryForm from "./EntryForm";
import type { EntryFormHandle } from "./EntryForm";
import EntryList from "./EntryList";
import CategoryManager from "./CategoryManager";
import SettingsModal from "./SettingsModal";
import { formatClipboard } from "./clipboard";
import { searchEntries, filterByCategory, type SearchMode } from "./search";
import "./App.css";

function generateId(): string {
  return crypto.randomUUID();
}

const DEFAULT_MAX_FAVORITES = 5;

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function keyMatches(key: string, text: string): boolean {
  if (!key || !text) return false;
  // Remove trailing ++ or + or single s (but not multiple s like in "Dress")
  const baseKey = key.replace(/(\+{1,2}|s)$/i, '');
  const pattern = new RegExp(`\\b${escapeRegex(baseKey)}(\\+{1,2}|s)?(?![a-zA-Z])`, 'i');
  return pattern.test(text);
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
  const [clipboardTemplate, setClipboardTemplate] = useState("{{content}}");
  const [dataDir, setDataDir] = useState("");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [quickFilter, setQuickFilter] = useState<string[]>([]);
  const [maxFavorites, setMaxFavorites] = useState(DEFAULT_MAX_FAVORITES);
  const [stTextarea, setStTextarea] = useState("");
  const [wsConnected, setWsConnected] = useState(false);
  const [liveSelected, setLiveSelected] = useState<Set<string>>(new Set());
  const [liveCopied, setLiveCopied] = useState<Set<string>>(new Set());
  const formRef = useRef<EntryFormHandle>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const lastCtrlFRef = useRef(0);

  // Refs for silent auto-copy (accessed inside SSE handler)
  const entriesRef = useRef(entries);
  const quickFilterRef = useRef(quickFilter);
  const clipboardTemplateRef = useRef(clipboardTemplate);
  entriesRef.current = entries;
  quickFilterRef.current = quickFilter;
  clipboardTemplateRef.current = clipboardTemplate;

  function toggleFavorite(name: string) {
    setFavorites((prev) => {
      if (prev.includes(name)) {
        const next = prev.filter((f) => f !== name);
        saveSettings({ favorites: next });
        return next;
      }
      if (prev.length >= maxFavorites) {
        showToast(`Maximum ${maxFavorites} favorites allowed.`, "error");
        return prev;
      }
      const next = [...prev, name];
      saveSettings({ favorites: next });
      return next;
    });
  }

  function toggleQuickFilter(id: string) {
    setQuickFilter((prev) => {
      const next = prev.includes(id)
        ? prev.filter((f) => f !== id)
        : [...prev, id];
      saveSettings({ quickFilter: next });
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
      const [files, settings, dataSource] = await Promise.all([loadAllFromDisk(), loadSettings(), loadDataSource()]);

      const newCategories: Category[] = [];
      const newEntries: Entry[] = [];

      for (const file of files) {
        const catId = `cat:${file.fileName}`;
        newCategories.push({ id: catId, name: file.fileName, extras: file.fileExtras });

        for (const val of Object.values(file.entries)) {
          const v = val as Record<string, unknown>;
          const entryUid = v.uid ?? generateId();
          newEntries.push({
            id: `${file.fileName}:${entryUid}`,
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
      setDataDir(dataSource.dataDir ?? "");
      setFavorites(settings.favorites ?? []);
      setQuickFilter(settings.quickFilter ?? []);
      setMaxFavorites(settings.maxFavorites ?? DEFAULT_MAX_FAVORITES);
    } catch (err) {
      console.error("Failed to load from disk:", err);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Initial data load on mount
    loadFromDisk();
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

  // SSE connection to receive SillyTavern textarea content and chat entry IDs
  useEffect(() => {
    const eventSource = new EventSource("/api/st-textarea/stream");

    eventSource.onopen = () => setWsConnected(true);
    eventSource.onerror = () => setWsConnected(false);
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const content = data.content || "";
        setStTextarea(content);
        setWsConnected(true);

        // Update liveCopied based on entry IDs found in chat
        const chatIds = new Set<string>(Array.isArray(data.chatEntryIds) ? data.chatEntryIds : []);
        setLiveCopied(chatIds);

        // Silent auto-copy: copy available quick-filtered entries to clipboard
        if (content) {
          const currentEntries = entriesRef.current;
          const currentQuickFilter = quickFilterRef.current;
          const currentTemplate = clipboardTemplateRef.current;

          // Find disabled entries with matching keys that are in quickFilter and NOT in chat
          const availableEntries = currentEntries.filter((e) => {
            const isDisabled = Boolean((e.extra?._raw as Record<string, unknown> | undefined)?.disable);
            const hasMatchingKey = e.keys.some((key) => keyMatches(key, content));
            const inQuickFilter = currentQuickFilter.includes(e.id);
            const notInChat = !chatIds.has(e.id);
            return isDisabled && hasMatchingKey && inQuickFilter && notInChat;
          });

          if (availableEntries.length > 0) {
            const combinedContent = availableEntries.map((e) => e.content).join("\n---\n");
            const entryIds = availableEntries.map((e) => e.id);
            navigator.clipboard.writeText(formatClipboard(currentTemplate, combinedContent, entryIds)).catch(() => {});
          }
        }
      } catch { /* ignore invalid JSON */ }
    };

    return () => eventSource.close();
  }, []);


  const syncCategoryToDisk = useCallback((catId: string, allEntries: Entry[], catName?: string) => {
    const cat = categories.find((c) => c.id === catId);
    const name = catName ?? cat?.name;
    if (!name) return;
    const catEntries = allEntries.filter((e) => e.category === catId);
    saveCategoryFile(name, catEntries, cat?.extras ?? {});
  }, [categories]);

  const liveMatches = stTextarea
    ? entries.filter((e) =>
        e.keys.some((key) => keyMatches(key, stTextarea)) &&
        quickFilter.includes(e.id)
      )
    : [];

  const hasLiveMatches = liveMatches.length > 0;
  const liveMatchIds = new Set(liveMatches.map((e) => e.id));

  // All disabled entries with matching keys (for display in live section)
  const allKeyMatches = stTextarea
    ? entries.filter((e) => {
        const isDisabled = Boolean((e.extra?._raw as Record<string, unknown> | undefined)?.disable);
        return isDisabled && e.keys.some((key) => keyMatches(key, stTextarea));
      })
    : [];
  const allKeyMatchIds = new Set(allKeyMatches.map((e) => e.id));
  const hasKeyMatches = allKeyMatches.length > 0;

  // Live section: all entries with matching keys that are NOT already in chat
  const liveSection = allKeyMatches.filter((e) => !liveCopied.has(e.id));

  // Main list: normal filtered entries (no live section mixing)
  const displayEntries = searchEntries(filterByCategory(entries, filterCat), search, searchMode).map((r) => r.entry);

  // Bulk action handlers for live selection
  const handleLiveSelectAll = useCallback(() => {
    // Only select entries that are in quickFilter (liveMatches), not all key matches
    const selectableIds = liveSection
      .filter((e) => liveMatchIds.has(e.id))
      .map((e) => e.id);
    setLiveSelected(new Set(selectableIds));
  }, [liveSection, liveMatchIds]);

  const handleLiveCopy = useCallback(() => {
    const selectedEntries = liveSection.filter((e) => liveSelected.has(e.id));
    if (selectedEntries.length === 0) return;

    const combinedContent = selectedEntries.map((e) => e.content).join("\n---\n");
    const entryIds = selectedEntries.map((e) => e.id);
    navigator.clipboard.writeText(formatClipboard(clipboardTemplate, combinedContent, entryIds));

    showToast(`Copied ${selectedEntries.length} entries`, "success");
    setLiveSelected(new Set());
  }, [liveSection, liveSelected, clipboardTemplate]);

  const handleLiveToggleSelect = useCallback((id: string) => {
    setLiveSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSave = useCallback((name: string, keys: string[], content: string, category: string) => {
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
        const catName = categories.find((c) => c.id === category)?.name ?? category;
        const newEntry: Entry = {
          id: `${catName}:${newRaw.uid}`,
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
  }, [editing, syncCategoryToDisk, categories]);

  function handleDelete(id: string) {
    const entry = entries.find((e) => e.id === id);
    setEntries((prev) => {
      const next = prev.filter((e) => e.id !== id);
      if (entry) syncCategoryToDisk(entry.category, next);
      return next;
    });
    if (editing?.id === id) setEditing(null);
  }

  function handleEdit(entry: Entry) {
    setEditing(entry);
  }

  function handleDuplicate(id: string) {
    let newId = "";
    setEntries((prev) => {
      const source = prev.find((e) => e.id === id);
      if (!source) return prev;
      const siblings = prev.filter((e) => e.category === source.category);
      const sourceRaw = source.extra?._raw as Record<string, unknown> | undefined;
      const newRaw = sourceRaw
        ? cloneRawForDuplicate(sourceRaw, siblings)
        : makeRawForNewEntry(siblings);
      const catName = categories.find((c) => c.id === source.category)?.name ?? source.category;
      newId = `${catName}:${newRaw.uid}`;
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

  function handleToggleDisabled(id: string) {
    setEntries((prev) => {
      const entry = prev.find((e) => e.id === id);
      if (!entry) return prev;
      const raw = (entry.extra?._raw ?? {}) as Record<string, unknown>;
      const newDisabled = !raw.disable;
      const updatedEntry: Entry = {
        ...entry,
        extra: { ...entry.extra, _raw: { ...raw, disable: newDisabled } },
      };
      const next = prev.map((e) => (e.id === id ? updatedEntry : e));
      syncCategoryToDisk(entry.category, next);
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
          <div
            className={`header-btn live-btn ${liveMatches.length > 0 ? "live-active" : ""}`}
            title={wsConnected ? `Live matches: ${liveMatches.length}` : "SillyTavern not connected"}
          >
            <span className={`live-dot ${wsConnected ? "connected" : ""}`} />
            <span className="live-label">Live{liveMatches.length > 0 ? ` (${liveMatches.length})` : ""}</span>
          </div>
          <div className="header-divider" />
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
            entries={displayEntries}
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
            onToggleDisabled={handleToggleDisabled}
            quickFilter={quickFilter}
          />
        </div>

        {/* Live matches overlay panel */}
        {hasKeyMatches && (
          <div className="live-panel">
            <div className="live-panel-header">
              <h3>Live Matches ({liveSection.length})</h3>
              <div className="live-panel-actions">
                <button
                  className="btn-select"
                  onClick={liveSelected.size > 0 ? handleLiveCopy : handleLiveSelectAll}
                >
                  {liveSelected.size > 0 ? `Copy (${liveSelected.size})` : "Select All"}
                </button>
              </div>
            </div>
            <div className="live-panel-list">
              {liveSection.length === 0 ? (
                <div className="empty">No matches</div>
              ) : (
                liveSection.map((entry) => {
                  const isSelected = liveSelected.has(entry.id);
                  const isFiltered = liveMatchIds.has(entry.id);
                  return (
                    <div
                      key={entry.id}
                      className={`live-panel-item${isSelected ? " selected" : ""}${isFiltered ? " filtered" : ""}`}
                      onClick={() => handleLiveToggleSelect(entry.id)}
                    >
                      <input
                        type="checkbox"
                        className="live-select-checkbox"
                        checked={isSelected}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => handleLiveToggleSelect(entry.id)}
                      />
                      <span className="live-panel-name" title={entry.name || "(unnamed)"}>{entry.name || "(unnamed)"}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        <div className="right-panel">
          <EntryForm
            ref={formRef}
            editing={editing}
            categories={categories}
            onSave={handleSave}
            onCancel={() => setEditing(null)}
            isFavorite={editing ? favorites.includes(editing.name) : false}
            onToggleFavorite={editing ? () => toggleFavorite(editing.name) : undefined}
            isQuickFilter={editing ? quickFilter.includes(editing.id) : false}
            onToggleQuickFilter={editing ? () => toggleQuickFilter(editing.id) : undefined}
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

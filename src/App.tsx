import { useState, useEffect, useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import toast, { Toaster } from "react-hot-toast";
import {
  Badge, Box, Button, Card, Checkbox, Dialog, DropdownMenu, Flex, Heading, IconButton,
  ScrollArea, Select, Separator, Switch, Text, Theme, Tooltip,
} from "@radix-ui/themes";
import {
  DesktopIcon, ExternalLinkIcon, GearIcon, MoonIcon,
  PlusIcon, ReloadIcon, StackIcon, SunIcon,
} from "@radix-ui/react-icons";
import type { Entry, Category } from "./types";

const MAX_TOASTS = 3;
const toastQueue: string[] = [];
const TOAST_COLORS = [
  "var(--indigo-9)",
  "var(--violet-9)",
  "var(--pink-9)",
  "var(--amber-9)",
  "var(--grass-9)",
  "var(--cyan-9)",
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
import { saveCategoryFile, loadAllFromDisk, loadSettings, loadDataSource, saveSettings, makeRawForNewEntry, cloneRawForDuplicate, type AppearancePref } from "./api";
import EntryForm from "./EntryForm";
import type { EntryFormHandle } from "./EntryForm";
import EntryList from "./EntryList";
import CategoryManager from "./CategoryManager";
import SettingsModal from "./SettingsModal";
import SearchInput from "./SearchInput";
import { formatClipboard } from "./clipboard";
import { searchEntries, filterByCategory, type SearchMode } from "./search";
import "./App.css";

function generateId(): string {
  return crypto.randomUUID();
}

const ALL_CATEGORIES = "__all__";

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
function subscribeDark(onChange: () => void) {
  darkQuery.addEventListener("change", onChange);
  return () => darkQuery.removeEventListener("change", onChange);
}
function useSystemDark(): boolean {
  return useSyncExternalStore(subscribeDark, () => darkQuery.matches);
}

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
  const [debouncedSearch, setDebouncedSearch] = useState("");
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
  const [stTextarea, setStTextarea] = useState("");
  const [wsConnected, setWsConnected] = useState(false);
  const [liveSelected, setLiveSelected] = useState<Set<string>>(new Set());
  const [liveCopied, setLiveCopied] = useState<Set<string>>(new Set());
  const [appearance, setAppearance] = useState<AppearancePref>("system");
  const systemDark = useSystemDark();
  const resolvedAppearance = appearance === "system" ? (systemDark ? "dark" : "light") : appearance;
  const formRef = useRef<EntryFormHandle>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const lastCtrlFRef = useRef(0);


  function toggleFavorite(name: string) {
    setFavorites((prev) => {
      const next = prev.includes(name)
        ? prev.filter((f) => f !== name)
        : [...prev, name];
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

  function changeAppearance(value: AppearancePref) {
    setAppearance(value);
    saveSettings({ appearance: value });
  }

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
      setAppearance(settings.appearance ?? "system");
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
        setStTextarea(data.content || "");
        setWsConnected(true);

        // Update liveCopied based on entry IDs found in chat
        if (Array.isArray(data.chatEntryIds)) {
          setLiveCopied(new Set(data.chatEntryIds));
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

  // Memoized so unrelated re-renders (e.g. each keystroke in the search box)
  // don't re-run key regexes and searches over every entry.
  const keyMatchedEntries = useMemo(
    () => (stTextarea ? entries.filter((e) => e.keys.some((key) => keyMatches(key, stTextarea))) : []),
    [entries, stTextarea],
  );

  const liveMatches = useMemo(
    () => keyMatchedEntries.filter((e) => quickFilter.includes(e.id)),
    [keyMatchedEntries, quickFilter],
  );

  const liveMatchIds = useMemo(() => new Set(liveMatches.map((e) => e.id)), [liveMatches]);

  // All disabled entries with matching keys (for display in live section)
  const allKeyMatches = useMemo(
    () => keyMatchedEntries.filter((e) => Boolean((e.extra?._raw as Record<string, unknown> | undefined)?.disable)),
    [keyMatchedEntries],
  );
  const hasKeyMatches = allKeyMatches.length > 0;

  // Live section: all entries with matching keys that are NOT already in chat
  const liveSection = useMemo(() => allKeyMatches.filter((e) => !liveCopied.has(e.id)), [allKeyMatches, liveCopied]);

  // Main list: normal filtered entries (no live section mixing)
  const displayEntries = useMemo(
    () => searchEntries(filterByCategory(entries, filterCat), debouncedSearch, searchMode).map((r) => r.entry),
    [entries, filterCat, debouncedSearch, searchMode],
  );

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

    const clipboardEntries = selectedEntries.map((e) => ({ id: e.id, content: e.content }));
    navigator.clipboard.writeText(formatClipboard(clipboardTemplate, clipboardEntries));

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

  const AppearanceIcon = appearance === "light" ? SunIcon : appearance === "dark" ? MoonIcon : DesktopIcon;

  return (
    <Theme accentColor="indigo" grayColor="slate" radius="medium" appearance={resolvedAppearance}>
      <Flex direction="column" className="app">
        <Flex justify="between" align="center" flexShrink="0" px="4" className="app-header bordered-bottom surface">
          <Flex align="center" gap="3" minWidth="0">
            <Heading size="4" weight="bold" className="nowrap">Lorebook Management</Heading>
            {favorites.length > 0 && (
              <Flex gap="2" wrap="wrap">
                {favorites.map((fname) => {
                  const entry = entries.find((e) => e.name === fname);
                  if (!entry) return null;
                  const displayName = fname.includes("-")
                    ? fname.split("-").pop()!.trim()
                    : fname;
                  return (
                    <Button
                      key={fname}
                      size="1"
                      variant="soft"
                      radius="full"
                      className="favorite-tag"
                      onClick={() => handleEdit(entry)}
                      title={fname}
                    >
                      <Text truncate>{displayName}</Text>
                    </Button>
                  );
                })}
              </Flex>
            )}
          </Flex>
          <Flex align="center" gap="3" flexShrink="0">
            <Tooltip content={wsConnected ? `Live matches: ${liveMatches.length}` : "SillyTavern not connected"}>
              <Badge size="2" variant="soft" color={liveMatches.length > 0 ? "indigo" : "gray"}>
                <span className={`live-dot${wsConnected ? " connected" : ""}`} />
                Live{liveMatches.length > 0 ? ` (${liveMatches.length})` : ""}
              </Badge>
            </Tooltip>
            {!editing && (
              <>
                <Separator orientation="vertical" />
                <Tooltip content="Add">
                  <IconButton aria-label="Add" variant="soft" onClick={() => formRef.current?.submit()}>
                    <PlusIcon />
                  </IconButton>
                </Tooltip>
              </>
            )}
            <Separator orientation="vertical" />
            <Tooltip content="Categories">
              <IconButton aria-label="Categories" variant="ghost" color="gray" onClick={() => setShowCategories(true)}>
                <StackIcon />
              </IconButton>
            </Tooltip>
            <Tooltip content="Refresh">
              <IconButton aria-label="Refresh" variant="ghost" color="gray" onClick={loadFromDisk}>
                <ReloadIcon />
              </IconButton>
            </Tooltip>
            <DropdownMenu.Root>
              {/* Plain title: a Tooltip would overwrite the trigger's open data-state */}
              <DropdownMenu.Trigger>
                <IconButton aria-label="Theme" title="Theme" variant="ghost" color="gray">
                  <AppearanceIcon />
                </IconButton>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end">
                <DropdownMenu.RadioGroup value={appearance} onValueChange={(v) => changeAppearance(v as AppearancePref)}>
                  <DropdownMenu.RadioItem value="light"><SunIcon /> Light</DropdownMenu.RadioItem>
                  <DropdownMenu.RadioItem value="dark"><MoonIcon /> Dark</DropdownMenu.RadioItem>
                  <DropdownMenu.RadioItem value="system"><DesktopIcon /> System</DropdownMenu.RadioItem>
                </DropdownMenu.RadioGroup>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
            <Tooltip content="Settings">
              <IconButton aria-label="Settings" variant="ghost" color="gray" onClick={() => setShowSettings(true)}>
                <GearIcon />
              </IconButton>
            </Tooltip>
            <Tooltip content="Open worlds folder">
              <IconButton aria-label="Open worlds folder" variant="ghost" color="gray" onClick={() => fetch("/api/open-folder", { method: "POST" })}>
                <ExternalLinkIcon />
              </IconButton>
            </Tooltip>
          </Flex>
        </Flex>

        <Flex className="main-layout">
          <Flex direction="column" className="left-panel">
            <Flex direction="column" gap="2" flexShrink="0" px="3" py="3" className="bordered-bottom surface">
              <SearchInput inputRef={searchInputRef} onSearch={setDebouncedSearch} />
              <Flex gap="2">
                <Box flexGrow="1" minWidth="0">
                  <Select.Root
                    value={filterCat || ALL_CATEGORIES}
                    onValueChange={(v) => setFilterCat(v === ALL_CATEGORIES ? "" : v)}
                  >
                    <Select.Trigger className="full-width" />
                    <Select.Content position="popper">
                      <Select.Item value={ALL_CATEGORIES}>All categories</Select.Item>
                      {categories.map((c) => (
                        <Select.Item key={c.id} value={c.id}>{c.name}</Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Root>
                </Box>
                <Text as="label" size="2">
                  <Flex gap="2" align="center" height="100%" className="nowrap">
                    <Switch
                      checked={searchMode === "content"}
                      onCheckedChange={(checked) => setSearchMode(checked ? "content" : "name")}
                    />
                    Search content
                  </Flex>
                </Text>
              </Flex>
            </Flex>
            <EntryList
              entries={displayEntries}
              categories={categories}
              onEdit={handleEdit}
              onDelete={handleDelete}
              editingId={editing?.id ?? null}
              highlightId={highlightId}
              onDuplicate={handleDuplicate}
              onMove={handleMove}
              onCopy={(content, id) => {
                navigator.clipboard.writeText(formatClipboard(clipboardTemplate, [{ id: id || "", content }]));
                showToast("Copied to clipboard", "success");
              }}
              onToggleDisabled={handleToggleDisabled}
              quickFilter={quickFilter}
            />
          </Flex>

          {/* Live matches overlay panel */}
          {hasKeyMatches && (
            <Card size="2" className="live-panel">
              <Flex direction="column" gap="3" height="100%">
                <Flex direction="column" gap="2" flexShrink="0">
                  <Heading size="3">Live Matches ({liveSection.length})</Heading>
                  <Box>
                    <Button
                      size="1"
                      onClick={liveSelected.size > 0 ? handleLiveCopy : handleLiveSelectAll}
                    >
                      {liveSelected.size > 0 ? `Copy (${liveSelected.size})` : "Select All"}
                    </Button>
                  </Box>
                </Flex>
                <ScrollArea type="auto" scrollbars="vertical">
                  <Flex direction="column" gap="1" pr="3">
                    {liveSection.length === 0 ? (
                      <Text as="p" size="2" color="gray" align="center" my="6">No matches</Text>
                    ) : (
                      liveSection.map((entry) => {
                        const isSelected = liveSelected.has(entry.id);
                        const isFiltered = liveMatchIds.has(entry.id);
                        return (
                          <Flex
                            key={entry.id}
                            align="center"
                            gap="2"
                            px="3"
                            py="2"
                            className="live-panel-item"
                            data-selected={isSelected || undefined}
                            data-filtered={isFiltered || undefined}
                            onClick={() => handleLiveToggleSelect(entry.id)}
                          >
                            <Checkbox
                              checked={isSelected}
                              onClick={(e) => e.stopPropagation()}
                              onCheckedChange={() => handleLiveToggleSelect(entry.id)}
                            />
                            <Text size="2" truncate title={entry.name || "(unnamed)"}>{entry.name || "(unnamed)"}</Text>
                          </Flex>
                        );
                      })
                    )}
                  </Flex>
                </ScrollArea>
              </Flex>
            </Card>
          )}

          <Flex direction="column" className="right-panel">
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
              searchQuery={debouncedSearch}
              searchMode={searchMode}
            />
          </Flex>
        </Flex>

        <Dialog.Root open={showCategories} onOpenChange={setShowCategories}>
          <Dialog.Content maxWidth="75vw" height="80vh" className="dialog-fill">
            <Dialog.Title>Categories</Dialog.Title>
            <Dialog.Description size="2" color="gray" mb="3">
              Browse every lorebook file and its entries.
            </Dialog.Description>
            <CategoryManager
              categories={categories}
              entries={entries}
              highlightId={highlightId}
              onDuplicate={handleDuplicate}
              onMove={handleMove}
              onDelete={handleDelete}
            />
            <Flex justify="end" mt="4" flexShrink="0">
              <Dialog.Close>
                <Button variant="soft" color="gray">Close</Button>
              </Dialog.Close>
            </Flex>
          </Dialog.Content>
        </Dialog.Root>

        {showSettings && (
          <SettingsModal
            clipboardTemplate={clipboardTemplate}
            dataDir={dataDir}
            favorites={favorites}
            onSave={({ clipboardTemplate: ct, dataDir: dd, favorites: favs, trackingChanged }) => {
              setClipboardTemplate(ct);
              setDataDir(dd);
              setFavorites(favs);
              if (trackingChanged) loadFromDisk();
            }}
            onClose={() => setShowSettings(false)}
          />
        )}

        <Toaster
          position="top-center"
          toastOptions={{
            duration: 2000,
            style: {
              background: "var(--color-panel-solid)",
              color: "var(--gray-12)",
              border: "1px solid var(--gray-a6)",
              boxShadow: "var(--shadow-4)",
              fontFamily: "var(--default-font-family)",
              fontSize: "var(--font-size-2)",
            },
            success: {
              iconTheme: { primary: "var(--accent-9)", secondary: "white" },
            },
            error: {
              iconTheme: { primary: "var(--red-9)", secondary: "white" },
            },
          }}
          containerStyle={{ top: 20 }}
        />
      </Flex>
    </Theme>
  );
}

import { useState, useEffect, useLayoutEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { Flex, IconButton, Select, Text, TextArea, TextField, Tooltip } from "@radix-ui/themes";
import { MixerHorizontalIcon, StarFilledIcon, StarIcon } from "@radix-ui/react-icons";
import type { Entry, Category } from "./types";
import { getHighlightRanges, type SearchMode } from "./search";

interface Props {
  editing: Entry | null;
  categories: Category[];
  onSave: (name: string, keys: string[], content: string, category: string) => void;
  onCancel: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  isQuickFilter?: boolean;
  onToggleQuickFilter?: () => void;
  searchQuery?: string;
  searchMode?: SearchMode;
}

export interface EntryFormHandle {
  submit: () => void;
}

const EntryForm = forwardRef<EntryFormHandle, Props>(({ editing, categories, onSave, onCancel, isFavorite, onToggleFavorite, isQuickFilter, onToggleQuickFilter, searchQuery, searchMode }, ref) => {
  const [name, setName] = useState("");
  const [keysInput, setKeysInput] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);

  useImperativeHandle(ref, () => ({
    submit: () => formRef.current?.requestSubmit(),
  }));

  useEffect(() => {
    if (editing) {
      const loadedKeys = editing.keys.join(", ");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Sync form state when editing prop changes
      if (name !== editing.name) setName(editing.name);
      if (keysInput !== loadedKeys) setKeysInput(loadedKeys);
      if (content !== editing.content) setContent(editing.content);
      if (category !== editing.category) setCategory(editing.category);
    } else {
      setName("");
      setKeysInput("");
      setContent("");
      setCategory("");
    }
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only sync when editing entry changes, not when form values change
  }, [editing?.id]);

  useEffect(() => {
    if (!editing) return;
    const loadedKeys = editing.keys.join(", ");
    if (name === editing.name && keysInput === loadedKeys && content === editing.content && category === editing.category) {
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      const trimmedName = name.trim();
      const keys = keysInput.split(",").map((k) => k.trim()).filter(Boolean);
      if (trimmedName && category) {
        onSave(trimmedName, keys, content, category);
      }
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [editing, name, keysInput, content, category, onSave]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && editing) {
        onCancel();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editing, onCancel]);

  const handleScroll = () => {
    if (textareaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  const showHighlights = Boolean(searchMode === "content" && searchQuery && editing);
  const highlightRanges = showHighlights ? getHighlightRanges(content, searchQuery!) : [];

  // Line the highlight backdrop up with the text inside Radix's TextArea, whose
  // padding, border and scrollbar width come from theme tokens.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    const backdrop = backdropRef.current;
    if (!showHighlights || !textarea || !backdrop) return;
    const root = textarea.parentElement!;

    function sync() {
      const ta = getComputedStyle(textarea!);
      const rootRect = root.getBoundingClientRect();
      const taRect = textarea!.getBoundingClientRect();
      const scrollbar = textarea!.offsetWidth - textarea!.clientWidth;
      const s = backdrop!.style;
      s.borderRadius = getComputedStyle(root).borderRadius;
      s.paddingTop = `${taRect.top - rootRect.top + parseFloat(ta.paddingTop)}px`;
      s.paddingBottom = `${rootRect.bottom - taRect.bottom + parseFloat(ta.paddingBottom)}px`;
      s.paddingLeft = `${taRect.left - rootRect.left + parseFloat(ta.paddingLeft)}px`;
      s.paddingRight = `${rootRect.right - taRect.right + parseFloat(ta.paddingRight) + scrollbar}px`;
      s.fontFamily = ta.fontFamily;
      s.fontSize = ta.fontSize;
      s.fontWeight = ta.fontWeight;
      s.lineHeight = ta.lineHeight;
      s.letterSpacing = ta.letterSpacing;
      backdrop!.scrollTop = textarea!.scrollTop;
    }

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [showHighlights, content]);

  function buildHighlightedContent(): React.ReactNode[] {
    if (highlightRanges.length === 0) {
      return [content + "\n"];
    }
    const parts: React.ReactNode[] = [];
    let lastEnd = 0;
    for (let i = 0; i < highlightRanges.length; i++) {
      const [start, end] = highlightRanges[i];
      if (start > lastEnd) {
        parts.push(content.slice(lastEnd, start));
      }
      parts.push(<mark key={i}>{content.slice(start, end)}</mark>);
      lastEnd = end;
    }
    if (lastEnd < content.length) {
      parts.push(content.slice(lastEnd));
    }
    parts.push("\n");
    return parts;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    const keys = keysInput
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    if (!category) {
      setError("Please select a category.");
      return;
    }
    setError("");
    onSave(name.trim(), keys, content, category);
    if (!editing) {
      setName("");
      setKeysInput("");
      setContent("");
    }
  }

  function handleCtrlEnter(e: React.KeyboardEvent) {
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  return (
    <form className="entry-form" ref={formRef} onSubmit={handleSubmit}>
      {error && <Text size="2" color="red">{error}</Text>}
      <Flex gap="3" flexShrink="0">
        <Flex direction="column" gap="1">
          <Text as="label" size="2" weight="bold">Category</Text>
          <Select.Root
            value={category}
            onValueChange={(v) => { setCategory(v); setError(""); }}
          >
            <Select.Trigger placeholder="Select" onKeyDown={handleCtrlEnter} />
            <Select.Content position="popper">
              {categories.map((c) => (
                <Select.Item key={c.id} value={c.id}>{c.name}</Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </Flex>
        <Flex direction="column" gap="1" flexGrow="1">
          <Text as="label" size="2" weight="bold">Name</Text>
          <TextField.Root
            value={name}
            onChange={(e) => { setName(e.target.value); setError(""); }}
            placeholder="Entry name"
          />
        </Flex>
        <Flex direction="column" gap="1" flexGrow="1">
          <Text as="label" size="2" weight="bold">Keys</Text>
          <TextField.Root
            value={keysInput}
            onChange={(e) => { setKeysInput(e.target.value); setError(""); }}
            placeholder="key1, key2, key3"
          />
        </Flex>
      </Flex>
      <Flex direction="column" gap="1" flexGrow="1" minHeight="0">
        <Flex justify="between" align="center">
          <Flex align="center" gap="3">
            <Text as="label" size="2" weight="bold">Content</Text>
            {editing && onToggleFavorite && (
              <Tooltip content={isFavorite ? "Remove from favorites" : "Add to favorites"}>
                <IconButton aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                  type="button"
                  size="1"
                  variant="ghost"
                  color={isFavorite ? "amber" : "gray"}
                  onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
                >
                  {isFavorite ? <StarFilledIcon /> : <StarIcon />}
                </IconButton>
              </Tooltip>
            )}
            {editing && onToggleQuickFilter && (
              <Tooltip content={isQuickFilter ? "Remove from quick filter" : "Add to quick filter"}>
                <IconButton aria-label={isQuickFilter ? "Remove from quick filter" : "Add to quick filter"}
                  type="button"
                  size="1"
                  variant={isQuickFilter ? "soft" : "ghost"}
                  color={isQuickFilter ? "blue" : "gray"}
                  onClick={(e) => { e.stopPropagation(); onToggleQuickFilter(); }}
                >
                  <MixerHorizontalIcon />
                </IconButton>
              </Tooltip>
            )}
          </Flex>
          <Text size="1" color="gray">~{Math.ceil(content.length / 4)} tokens</Text>
        </Flex>
        <div className="textarea-highlight-container">
          {showHighlights && (
            <div className="textarea-backdrop" ref={backdropRef}>
              {buildHighlightedContent()}
            </div>
          )}
          <TextArea
            ref={textareaRef}
            className={`content-textarea${showHighlights ? " with-highlights" : ""}`}
            size="3"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleCtrlEnter}
            onScroll={handleScroll}
            placeholder="Entry content..."
          />
        </div>
      </Flex>
    </form>
  );
});

export default EntryForm;

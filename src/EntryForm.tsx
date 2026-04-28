import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import type { Entry, Category } from "./types";

interface Props {
  editing: Entry | null;
  categories: Category[];
  onSave: (name: string, keys: string[], content: string, category: string) => void;
  onCancel: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

export interface EntryFormHandle {
  submit: () => void;
}

const EntryForm = forwardRef<EntryFormHandle, Props>(({ editing, categories, onSave, onCancel, isFavorite, onToggleFavorite }, ref) => {
  const [name, setName] = useState("");
  const [keysInput, setKeysInput] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const debounceRef = useRef<number | null>(null);

  useImperativeHandle(ref, () => ({
    submit: () => formRef.current?.requestSubmit(),
  }));

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setKeysInput(editing.keys.join(", "));
      setContent(editing.content);
      setCategory(editing.category);
    } else {
      setName("");
      setKeysInput("");
      setContent("");
      setCategory("");
    }
    setError("");
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    // Don't auto-save if form values match the editing entry (just loaded, no user changes)
    const loadedKeys = editing.keys.join(", ");
    if (name === editing.name && keysInput === loadedKeys && content === editing.content && category === editing.category) {
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      const trimmedName = name.trim();
      const keys = keysInput.split(",").map((k) => k.trim()).filter(Boolean);
      if (trimmedName && keys.length > 0 && category) {
        onSave(trimmedName, keys, content, category);
      }
    }, 1000);
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
    if (keys.length === 0) {
      setError("At least one key is required.");
      return;
    }
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
      {error && <div className="form-error">{error}</div>}
      <div className="form-row">
        <div className="form-field">
          <label>Category</label>
          <select
            className={category ? "" : "placeholder"}
            value={category}
            onChange={(e) => { setCategory(e.target.value); setError(""); }}
            onKeyDown={handleCtrlEnter}
          >
            <option value="" disabled hidden>Select</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="form-field form-field-grow">
          <label>Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(""); }}
            placeholder="Entry name"
          />
        </div>
        <div className="form-field form-field-grow">
          <label>Keys</label>
          <input
            type="text"
            value={keysInput}
            onChange={(e) => { setKeysInput(e.target.value); setError(""); }}
            placeholder="key1, key2, key3"
          />
        </div>
      </div>
      <div className="form-field form-field-grow">
        <div className="label-with-meta">
          <span className="label-left">
            <label>Content</label>
            {editing && onToggleFavorite && (
              <button
                type="button"
                className={`btn-favorite ${isFavorite ? "favorited" : ""}`}
                onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
                title={isFavorite ? "Remove from favorites" : "Add to favorites"}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
              </button>
            )}
          </span>
          <span className="token-count">~{Math.ceil(content.length / 4)} tokens</span>
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleCtrlEnter}
          placeholder="Entry content..."
        />
      </div>
    </form>
  );
});

export default EntryForm;

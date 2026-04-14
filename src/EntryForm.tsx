import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import type { Entry, Category } from "./types";

interface Props {
  editing: Entry | null;
  categories: Category[];
  onSave: (name: string, keys: string[], content: string, category: string) => void;
  onCancel: () => void;
}

export interface EntryFormHandle {
  submit: () => void;
}

const EntryForm = forwardRef<EntryFormHandle, Props>(({ editing, categories, onSave, onCancel }, ref) => {
  const [name, setName] = useState("");
  const [keysInput, setKeysInput] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

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
      <h2>{editing ? "Edit Entry" : "New Entry"}</h2>
      {error && <div className="form-error">{error}</div>}
      <div className="form-field">
        <label>Category *</label>
        <select
          value={category}
          onChange={(e) => { setCategory(e.target.value); setError(""); }}
          onKeyDown={handleCtrlEnter}
        >
          <option value="">— Select category —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label>Name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(""); }}
          placeholder="Entry name"
        />
      </div>
      <div className="form-field">
        <label>Keys (comma-separated) *</label>
        <input
          type="text"
          value={keysInput}
          onChange={(e) => { setKeysInput(e.target.value); setError(""); }}
          placeholder="key1, key2, key3"
        />
      </div>
      <div className="form-field form-field-grow">
        <label>Content</label>
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

import { useState } from "react";
import type { Category } from "./types";
import ConfirmModal from "./ConfirmModal";

interface Props {
  categories: Category[];
  catError: string;
  onAdd: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export default function CategoryManager({ categories, catError, onAdd, onRename, onDelete }: Props) {
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const deletingCat = deletingId ? categories.find((c) => c.id === deletingId) : null;

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setName("");
  }

  function startRename(cat: Category) {
    setEditingId(cat.id);
    setEditName(cat.name);
  }

  function commitRename() {
    if (editingId && editName.trim()) {
      onRename(editingId, editName.trim());
    }
    setEditingId(null);
    setEditName("");
  }

  return (
    <div className="category-manager">
      <h2>Categories</h2>
      {catError && <div className="form-error">{catError}</div>}
      <form className="cat-add" onSubmit={handleAdd}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New category..."
        />
        <button type="submit">Add</button>
      </form>
      <div className="cat-list">
        {categories.map((cat) => (
          <div key={cat.id} className="cat-item">
            {editingId === cat.id ? (
              <input
                className="cat-rename-input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => e.key === "Enter" && commitRename()}
                autoFocus
              />
            ) : (
              <span className="cat-name" onDoubleClick={() => startRename(cat)}>
                {cat.name}
              </span>
            )}
            <div className="cat-item-actions">
              <button className="btn-sm" onClick={() => startRename(cat)}>Rename</button>
              <button className="btn-sm danger" onClick={() => setDeletingId(cat.id)}>Delete</button>
            </div>
          </div>
        ))}
        {categories.length === 0 && (
          <p className="empty-sm">No categories yet.</p>
        )}
      </div>

      {deletingId && deletingCat && (
        <ConfirmModal
          message={`Delete category "${deletingCat.name}"? All entries in this category will also be deleted.`}
          onConfirm={() => { onDelete(deletingId); setDeletingId(null); }}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </div>
  );
}

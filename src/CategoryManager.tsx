import { useState } from "react";
import type { Category, Entry } from "./types";
import EntryActions from "./EntryActions";

interface Props {
  categories: Category[];
  entries: Entry[];
  highlightId: string | null;
  onDuplicate: (id: string) => void;
  onMove: (id: string, categoryId: string) => void;
  onDelete: (id: string) => void;
}

export default function CategoryManager({ categories, entries, highlightId, onDuplicate, onMove, onDelete }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="category-manager">
      <div className="cat-tree-actions">
        <button
          type="button"
          className="btn-sm"
          onClick={() => setExpanded(new Set(categories.map((c) => c.id)))}
          disabled={categories.length === 0}
        >
          Expand all
        </button>
        <button
          type="button"
          className="btn-sm"
          onClick={() => setExpanded(new Set())}
          disabled={expanded.size === 0}
        >
          Collapse all
        </button>
      </div>
      <div className="cat-tree">
        {categories.map((cat) => {
          const isOpen = expanded.has(cat.id);
          const catEntries = entries
            .filter((e) => e.category === cat.id)
            .sort((a, b) => a.name.localeCompare(b.name));
          return (
            <div key={cat.id} className="cat-node">
              <button
                type="button"
                className="cat-node-header"
                onClick={() => toggle(cat.id)}
                aria-expanded={isOpen}
              >
                <span className={`cat-chevron${isOpen ? " open" : ""}`}>▶</span>
                <span className="cat-name">{cat.name}</span>
                <span className="cat-count">{catEntries.length}</span>
              </button>
              {isOpen && (
                <div className="cat-children">
                  {catEntries.map((entry) => (
                    <div key={entry.id} className={`cat-entry${highlightId === entry.id ? " highlight-new" : ""}`}>
                      <span className="cat-entry-name">
                        {entry.name || <span className="cat-entry-empty">(unnamed)</span>}
                      </span>
                      <EntryActions
                        entry={entry}
                        categories={categories}
                        onDuplicate={onDuplicate}
                        onMove={onMove}
                        onDelete={onDelete}
                      />
                    </div>
                  ))}
                  {catEntries.length === 0 && (
                    <div className="cat-entry cat-entry-empty">No entries</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {categories.length === 0 && (
          <p className="empty-sm">No categories found in the worlds folder.</p>
        )}
      </div>
    </div>
  );
}

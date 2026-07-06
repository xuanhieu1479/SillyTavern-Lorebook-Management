import { useState, useRef, useEffect } from "react";
import type { Entry, Category } from "./types";
import EntryActions from "./EntryActions";

const PAGE_SIZE = 50;

interface Props {
  entries: Entry[];
  categories: Category[];
  onEdit: (entry: Entry) => void;
  onDelete: (id: string) => void;
  editingId: string | null;
  highlightId: string | null;
  onDuplicate: (id: string) => void;
  onMove: (id: string, categoryId: string) => void;
  onCopy: (content: string) => void;
  onToggleDisabled: (id: string) => void;
  quickFilter: string[];
}

export default function EntryList({ entries, categories, onEdit, onDelete, editingId, highlightId, onDuplicate, onMove, onCopy, onToggleDisabled, quickFilter }: Props) {
  const [page, setPage] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paged = entries.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  useEffect(() => {
    listRef.current?.scrollTo(0, 0);
  }, [safePage]);

  if (entries.length === 0) {
    return <p className="empty">No entries found.</p>;
  }

  return (
    <div className="entry-list-wrapper">
      <div className="list-header">
        <span className="entry-count">{entries.length} entries</span>
        {totalPages > 1 && (
          <div className="pagination">
            <button className="btn-sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Prev</button>
            <span>{safePage + 1} / {totalPages}</span>
            <button className="btn-sm" disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)}>Next</button>
          </div>
        )}
      </div>
      <div className="entry-list" ref={listRef}>
        {paged.map((entry) => {
          const isDisabled = Boolean((entry.extra?._raw as Record<string, unknown> | undefined)?.disable);
          const isQuickFiltered = quickFilter.includes(entry.id);
          return (
            <div
              key={entry.id}
              className={`entry-card${editingId === entry.id ? " selected" : ""}${highlightId === entry.id ? " highlight-new" : ""}${isDisabled ? " entry-disabled" : ""}${isQuickFiltered ? " quick-filtered" : ""}`}
              onClick={() => onEdit(entry)}
            >
              <div className="entry-card-header">
                <div className="entry-card-name">{entry.name}</div>
                <button
                  className={`entry-toggle${isDisabled ? "" : " active"}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleDisabled(entry.id);
                  }}
                  title={isDisabled ? "Enable entry" : "Disable entry"}
                >
                  <span className="toggle-track">
                    <span className="toggle-thumb" />
                  </span>
                </button>
              </div>
              <div className="entry-card-row">
                <div className="entry-keys">
                  {entry.keys.map((k, i) => (
                    <span key={i} className="key-tag">{k}</span>
                  ))}
                </div>
                <EntryActions
                  entry={entry}
                  categories={categories}
                  onCopy={onCopy}
                  onEdit={() => onEdit(entry)}
                  onDuplicate={onDuplicate}
                  onMove={onMove}
                  onDelete={onDelete}
                />
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}

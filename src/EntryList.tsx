import { useState } from "react";
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
}

export default function EntryList({ entries, categories, onEdit, onDelete, editingId, highlightId, onDuplicate, onMove, onCopy }: Props) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paged = entries.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

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
      <div className="entry-list">
        {paged.map((entry) => (
          <div
            key={entry.id}
            className={`entry-card${editingId === entry.id ? " selected" : ""}${highlightId === entry.id ? " highlight-new" : ""}`}
            onClick={() => onEdit(entry)}
          >
            <div className="entry-card-name">{entry.name}</div>
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
        ))}
      </div>

    </div>
  );
}

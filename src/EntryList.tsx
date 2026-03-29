import { useState, useEffect, useRef } from "react";
import type { Entry, Category } from "./types";

const PAGE_SIZE = 20;

interface Props {
  entries: Entry[];
  categories: Category[];
  onEdit: (entry: Entry) => void;
  onDelete: (id: string) => void;
  editingId: string | null;
  onDuplicate: (id: string) => void;
  onMove: (id: string, categoryId: string) => void;
  onCopy: (content: string) => void;
}

export default function EntryList({ entries, categories, onEdit, onDelete, editingId, onDuplicate, onMove, onCopy }: Props) {
  const [page, setPage] = useState(0);
  const [moveOpenId, setMoveOpenId] = useState<string | null>(null);
  const moveRef = useRef<HTMLDivElement>(null);
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paged = entries.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  useEffect(() => {
    if (!moveOpenId) return;
    function handleClick(e: MouseEvent) {
      if (moveRef.current && !moveRef.current.contains(e.target as Node)) {
        setMoveOpenId(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [moveOpenId]);

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
            className={`entry-card${editingId === entry.id ? " selected" : ""}`}
            onClick={() => { onEdit(entry); onCopy(entry.content); setMoveOpenId(null); }}
          >
            <div className="entry-card-name">{entry.name}</div>
            <div className="entry-card-row">
              <div className="entry-keys">
                {entry.keys.map((k, i) => (
                  <span key={i} className="key-tag">{k}</span>
                ))}
              </div>
              <div className="card-actions" onClick={(e) => e.stopPropagation()}>
                {/* Duplicate */}
                <button
                  className="btn-icon btn-duplicate"
                  title="Duplicate"
                  onClick={() => onDuplicate(entry.id)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                </button>
                {/* Move */}
                <div className="dropdown-anchor" ref={moveOpenId === entry.id ? moveRef : undefined}>
                  <button
                    className="btn-icon btn-move"
                    title="Move to category"
                    onClick={() => setMoveOpenId(moveOpenId === entry.id ? null : entry.id)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    </svg>
                  </button>
                  {moveOpenId === entry.id && (
                    <div className="dropdown-menu">
                      {categories.filter((c) => c.id !== entry.category).map((c) => (
                        <button
                          key={c.id}
                          className="dropdown-item"
                          onClick={() => { onMove(entry.id, c.id); setMoveOpenId(null); }}
                        >
                          {c.name}
                        </button>
                      ))}
                      {categories.filter((c) => c.id !== entry.category).length === 0 && (
                        <span className="dropdown-item disabled">No other categories</span>
                      )}
                    </div>
                  )}
                </div>
                {/* Delete */}
                <button
                  className="btn-icon btn-delete"
                  title="Delete"
                  onClick={() => onDelete(entry.id)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}

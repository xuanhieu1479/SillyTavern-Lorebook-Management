import { useState, useEffect, useRef } from "react";
import type { Entry, Category } from "./types";

interface Props {
  entry: Entry;
  categories: Category[];
  onDuplicate: (id: string) => void;
  onMove: (id: string, categoryId: string) => void;
  onDelete: (id: string) => void;
}

export default function EntryActions({ entry, categories, onDuplicate, onMove, onDelete }: Props) {
  const [moveOpen, setMoveOpen] = useState(false);
  const moveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moveOpen) return;
    function handleClick(e: MouseEvent) {
      if (moveRef.current && !moveRef.current.contains(e.target as Node)) {
        setMoveOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [moveOpen]);

  const otherCats = categories.filter((c) => c.id !== entry.category);

  return (
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
      <div className="dropdown-anchor" ref={moveRef}>
        <button
          className="btn-icon btn-move"
          title="Move to category"
          onClick={() => setMoveOpen((v) => !v)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          </svg>
        </button>
        {moveOpen && (
          <div className="dropdown-menu">
            {otherCats.map((c) => (
              <button
                key={c.id}
                className="dropdown-item"
                onClick={() => { onMove(entry.id, c.id); setMoveOpen(false); }}
              >
                {c.name}
              </button>
            ))}
            {otherCats.length === 0 && (
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
  );
}

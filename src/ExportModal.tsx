import { useState, useEffect } from "react";
import type { Entry, Category } from "./types";
import { exportCategoryToFile } from "./api";

interface Props {
  entries: Entry[];
  categories: Category[];
  onClose: () => void;
}

export default function ExportModal({ entries, categories, onClose }: Props) {
  const [selectedCat, setSelectedCat] = useState("");

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function handleExport() {
    if (!selectedCat) return;
    const cat = categories.find((c) => c.id === selectedCat);
    if (!cat) return;
    const catEntries = entries.filter((e) => e.category === selectedCat);
    exportCategoryToFile(cat.name, catEntries);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal export-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Export Category</h2>
        <div className="form-field">
          <label>Select a category to export</label>
          <select value={selectedCat} onChange={(e) => setSelectedCat(e.target.value)}>
            <option value="">— Select category —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <p className="settings-hint">
          {selectedCat
            ? `${entries.filter((e) => e.category === selectedCat).length} entries will be exported.`
            : "Pick a category to see the entry count."}
        </p>
        <div className="modal-actions">
          <button disabled={!selectedCat} onClick={handleExport}>Export</button>
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

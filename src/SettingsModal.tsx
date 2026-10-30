import { useState, useEffect, useCallback } from "react";
import { saveSettings, saveDataSource } from "./api";
import { DEFAULT_TEMPLATE, formatClipboard } from "./clipboard";

interface Props {
  clipboardTemplate: string;
  dataDir: string;
  favorites: string[];
  onSave: (update: { clipboardTemplate: string; dataDir: string; favorites: string[] }) => void;
  onClose: () => void;
}

type Tab = "data" | "clipboard" | "favorites";

export default function SettingsModal({ clipboardTemplate, dataDir, favorites, onSave, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("data");
  const [dataDirInput, setDataDirInput] = useState(dataDir);
  const [template, setTemplate] = useState(clipboardTemplate || DEFAULT_TEMPLATE);
  const [favoriteList, setFavoriteList] = useState(favorites);

  const handleSave = useCallback(() => {
    const trimmedDir = dataDirInput.trim();
    saveSettings({ clipboardTemplate: template, favorites: favoriteList });
    saveDataSource({ dataDir: trimmedDir });
    onSave({ clipboardTemplate: template, dataDir: trimmedDir, favorites: favoriteList });
    onClose();
  }, [dataDirInput, template, favoriteList, onSave, onClose]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && e.ctrlKey) {
        e.preventDefault();
        handleSave();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, handleSave]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-tabs">
          <button
            className={`settings-tab${tab === "data" ? " active" : ""}`}
            onClick={() => setTab("data")}
          >
            Data
          </button>
          <button
            className={`settings-tab${tab === "clipboard" ? " active" : ""}`}
            onClick={() => setTab("clipboard")}
          >
            Clipboard
          </button>
          <button
            className={`settings-tab${tab === "favorites" ? " active" : ""}`}
            onClick={() => setTab("favorites")}
          >
            Favorites
          </button>
        </div>

        {tab === "data" && (
          <div className="settings-tab-content">
            <p className="settings-hint">
              Absolute path to the folder holding SillyTavern lorebook files (usually
              <code>SillyTavern/data/default-user/worlds</code>). Leave empty to use the bundled
              <code>./data</code> folder. The app reads and edits files in this folder directly;
              it never creates or deletes files here. Reload after changing this.
            </p>
            <input
              type="text"
              className="settings-input"
              value={dataDirInput}
              onChange={(e) => setDataDirInput(e.target.value)}
              placeholder="C:\Users\you\SillyTavern\data\default-user\worlds"
              spellCheck={false}
            />
          </div>
        )}

        {tab === "clipboard" && (
          <div className="settings-tab-content">
            <p className="settings-hint">
              Use <code>{"{{content}}"}</code> for entry content and <code>{"{{id}}"}</code> for entry IDs (used for live tracking).
              Multiple entries are joined with <code>---</code>.
            </p>
            <textarea
              className="settings-textarea"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={6}
              placeholder="{{content}}"
            />
            <div className="settings-preview">
              <label>Preview:</label>
              <span>{formatClipboard(template, [{ id: "Category:42", content: "Sample entry content" }])}</span>
            </div>
          </div>
        )}

        {tab === "favorites" && (
          <div className="settings-tab-content">
            <p className="settings-hint">
              Remove favorites here. To add one, open an entry and click its star.
            </p>
            {favoriteList.length === 0 ? (
              <p className="settings-hint">No favorites.</p>
            ) : (
              <ul className="settings-favorites">
                {favoriteList.map((name) => (
                  <li key={name}>
                    <span>{name}</span>
                    <button
                      className="btn-clear"
                      onClick={() => setFavoriteList((prev) => prev.filter((f) => f !== name))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="modal-actions">
          <button onClick={handleSave}>Save</button>
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

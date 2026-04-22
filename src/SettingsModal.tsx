import { useState, useEffect } from "react";
import { saveSettings } from "./api";

const DEFAULT_TEMPLATE = "{{content}}";

export function formatClipboard(template: string, content: string): string {
  if (template.includes("{{content}}")) {
    return template.replaceAll("{{content}}", content);
  }
  return template;
}

interface Props {
  clipboardTemplate: string;
  dataDir: string;
  onSave: (update: { clipboardTemplate: string; dataDir: string }) => void;
  onClose: () => void;
}

type Tab = "data" | "clipboard";

export default function SettingsModal({ clipboardTemplate, dataDir, onSave, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("data");
  const [dataDirInput, setDataDirInput] = useState(dataDir);
  const [template, setTemplate] = useState(clipboardTemplate || DEFAULT_TEMPLATE);

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
  }, [onClose, template, dataDirInput]);

  function handleSave() {
    const trimmedDir = dataDirInput.trim();
    saveSettings({ clipboardTemplate: template, dataDir: trimmedDir });
    onSave({ clipboardTemplate: template, dataDir: trimmedDir });
    onClose();
  }

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
              Use <code>{"{{content}}"}</code> as a placeholder for the entry's content.
              If omitted, the template text itself will be copied.
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
              <span>{formatClipboard(template, "ABC123")}</span>
            </div>
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

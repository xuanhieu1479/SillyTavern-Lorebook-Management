import { useState, useEffect } from "react";
import { saveSettings } from "./api";

const DEFAULT_TEMPLATE = "{{content}}";

const DEFAULT_EXPORT_TEMPLATE: Record<string, unknown> = {
  keysecondary: [],
  constant: false,
  vectorized: false,
  selective: true,
  selectiveLogic: 0,
  addMemo: true,
  order: 100,
  position: 4,
  disable: false,
  ignoreBudget: false,
  excludeRecursion: true,
  preventRecursion: false,
  matchPersonaDescription: false,
  matchCharacterDescription: false,
  matchCharacterPersonality: false,
  matchCharacterDepthPrompt: false,
  matchScenario: false,
  matchCreatorNotes: false,
  delayUntilRecursion: false,
  probability: 100,
  useProbability: true,
  depth: 2,
  outletName: "",
  group: "",
  groupOverride: false,
  groupWeight: 100,
  scanDepth: null,
  caseSensitive: null,
  matchWholeWords: null,
  useGroupScoring: null,
  automationId: "",
  role: 0,
  sticky: 0,
  cooldown: 0,
  delay: 0,
  triggers: [],
  characterFilter: {
    isExclude: false,
    names: [],
    tags: [],
  },
};

export function formatClipboard(template: string, content: string): string {
  if (template.includes("{{content}}")) {
    return template.replaceAll("{{content}}", content);
  }
  return template;
}

interface Props {
  clipboardTemplate: string;
  exportTemplate: Record<string, unknown>;
  onSave: (clipboardTemplate: string, exportTemplate: Record<string, unknown>) => void;
  onClose: () => void;
}

type Tab = "clipboard" | "export";

export default function SettingsModal({ clipboardTemplate, exportTemplate, onSave, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("clipboard");
  const [template, setTemplate] = useState(clipboardTemplate || DEFAULT_TEMPLATE);
  const [exportJson, setExportJson] = useState(
    JSON.stringify(Object.keys(exportTemplate).length ? exportTemplate : DEFAULT_EXPORT_TEMPLATE, null, 2)
  );
  const [exportError, setExportError] = useState("");

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
  }, [onClose, template, exportJson]);

  function handleSave() {
    let parsedExport: Record<string, unknown>;
    try {
      parsedExport = JSON.parse(exportJson);
      if (typeof parsedExport !== "object" || Array.isArray(parsedExport)) {
        setExportError("Must be a JSON object.");
        return;
      }
    } catch {
      setExportError("Invalid JSON.");
      return;
    }
    setExportError("");
    saveSettings({ clipboardTemplate: template, exportTemplate: parsedExport });
    onSave(template, parsedExport);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-tabs">
          <button
            className={`settings-tab${tab === "clipboard" ? " active" : ""}`}
            onClick={() => setTab("clipboard")}
          >
            Clipboard
          </button>
          <button
            className={`settings-tab${tab === "export" ? " active" : ""}`}
            onClick={() => setTab("export")}
          >
            Export Template
          </button>
        </div>

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

        {tab === "export" && (
          <div className="settings-tab-content">
            <p className="settings-hint">
              Define default fields for every exported entry. These are merged under each entry
              alongside <code>uid</code>, <code>key</code>, <code>comment</code>, <code>content</code>,
              and <code>displayIndex</code>. Fields from imported entries override these defaults.
            </p>
            {exportError && <div className="form-error">{exportError}</div>}
            <textarea
              className="settings-textarea settings-export-textarea"
              value={exportJson}
              onChange={(e) => { setExportJson(e.target.value); setExportError(""); }}
              spellCheck={false}
            />
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

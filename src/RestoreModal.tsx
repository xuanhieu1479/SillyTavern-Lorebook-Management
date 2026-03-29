import { useState, useEffect } from "react";
import type { BackupInfo } from "./api";
import { listBackups, restoreSnapshot, getCurrentSnapshot, savePreviousSnapshot, loadPreviousSnapshot, clearPreviousSnapshot, restoreRawSnapshot } from "./api";
import ConfirmModal from "./ConfirmModal";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  onRestore: () => void;
  onClose: () => void;
}

export default function RestoreModal({ onRestore, onClose }: Props) {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmName, setConfirmName] = useState<string | null>(null);
  const [confirmPrev, setConfirmPrev] = useState(false);
  const [error, setError] = useState("");
  const hasPrevious = loadPreviousSnapshot() !== null;

  useEffect(() => {
    listBackups().then((b) => { setBackups(b); setLoading(false); });
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (confirmName || confirmPrev) { setConfirmName(null); setConfirmPrev(false); }
        else onClose();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, confirmName, confirmPrev]);

  async function handleRestorePrevious() {
    setConfirmPrev(false);
    const prev = loadPreviousSnapshot();
    if (!prev) return;
    try {
      await restoreRawSnapshot(prev);
      clearPreviousSnapshot();
      onRestore();
      onClose();
    } catch {
      setError("Failed to restore previous snapshot.");
    }
  }

  async function handleRestore(name: string) {
    setConfirmName(null);
    // Save current state to localStorage before restoring
    const current = await getCurrentSnapshot();
    savePreviousSnapshot(current);
    const result = await restoreSnapshot(name);
    if (result.error) {
      setError(result.error);
    } else {
      onRestore();
      onClose();
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal restore-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Restore Snapshot</h2>
        {error && <div className="form-error">{error}</div>}

        <div className="prev-snapshot-section">
          <label className="prev-snapshot-label">Previous Snapshot (Ctrl+Y)</label>
          {hasPrevious ? (
            <div className="restore-item">
              <div className="restore-info">
                <span className="restore-name">Pre-restore state</span>
                <span className="restore-size">Stored in browser</span>
              </div>
              <button
                className="btn-icon"
                title="Restore previous state"
                onClick={() => setConfirmPrev(true)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
                </svg>
              </button>
            </div>
          ) : (
            <span className="prev-snapshot-empty">Empty</span>
          )}
        </div>

        <div className="restore-list">
          {loading && <p className="empty-sm">Loading...</p>}
          {!loading && backups.length === 0 && <p className="empty-sm">No snapshots found.</p>}
          {backups.map((b) => (
            <div key={b.name} className="restore-item">
              <div className="restore-info">
                <span className="restore-name">{b.name.replace(/\.json$/, "")}</span>
                <span className="restore-size">{formatSize(b.size)}</span>
              </div>
              <button
                className="btn-icon"
                title="Restore this snapshot"
                onClick={() => setConfirmName(b.name)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>Close</button>
        </div>

        {confirmName && (
          <ConfirmModal
            message={`Restore to "${confirmName.replace(/\.json$/, "")}"? This will replace all current data.`}
            variant="confirm"
            onConfirm={() => handleRestore(confirmName)}
            onCancel={() => setConfirmName(null)}
          />
        )}

        {confirmPrev && (
          <ConfirmModal
            message="Restore to the previous state before your last restore? This will replace all current data."
            variant="confirm"
            onConfirm={handleRestorePrevious}
            onCancel={() => setConfirmPrev(false)}
          />
        )}
      </div>
    </div>
  );
}

interface Props {
  message: string;
  confirmLabel?: string;
  variant?: "danger" | "confirm";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({ message, confirmLabel, variant = "danger", onConfirm, onCancel }: Props) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <p className="modal-message">{message}</p>
        <div className="modal-actions">
          {variant === "danger" ? (
            <>
              <button className="danger" onClick={onConfirm}>{confirmLabel ?? "Delete"}</button>
              <button onClick={onCancel}>Cancel</button>
            </>
          ) : (
            <>
              <button onClick={onConfirm}>{confirmLabel ?? "Confirm"}</button>
              <button className="btn-cancel" onClick={onCancel}>Cancel</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

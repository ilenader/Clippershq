// Phase 10 — minimal in-app confirmation modal. Replaces window.confirm in
// marketplace flows so cancel-deletion + approve-deletion match the rest of
// the in-app modal pattern. Reuses the shared <Modal/> wrapper.
"use client";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "primary" | "danger";
  loading?: boolean;
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmVariant = "primary",
  loading = false,
}: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        <p className="text-sm text-[var(--text-secondary)]">{body}</p>

        <div className="sticky bottom-0 -mx-6 -mb-6 border-t border-[var(--border-color)] bg-[var(--bg-card)] px-6 pb-1 pt-3">
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={loading}
            >
              {cancelLabel}
            </Button>
            <Button
              type="button"
              variant={confirmVariant === "danger" ? "danger" : undefined}
              onClick={onConfirm}
              loading={loading}
              disabled={loading}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

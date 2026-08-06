"use client";

import { AlertTriangle, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, RefObject } from "react";
import { useModalDialog } from "@/lib/use-modal-dialog";

interface ActionDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  inputLabel?: string;
  initialValue?: string;
  maxLength?: number;
  multiline?: boolean;
  onClose: () => void;
  onConfirm: (value?: string) => void | Promise<void>;
}

export function ActionDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  inputLabel,
  initialValue = "",
  maxLength = 100,
  multiline = false,
  onClose,
  onConfirm,
}: ActionDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useModalDialog<HTMLElement>(open, onClose, inputLabel ? inputRef as RefObject<HTMLElement | null> : undefined, !submitting);

  useEffect(() => {
    if (open) setValue(initialValue);
  }, [initialValue, open]);

  if (!open) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = inputLabel ? value.trim() : undefined;
    if (inputLabel && !normalized) return;
    setSubmitting(true);
    try {
      await onConfirm(normalized);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !submitting && onClose()}>
      <section
        ref={dialogRef}
        className="dialog action-dialog"
        role={destructive ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={submitting || undefined}
        tabIndex={-1}
      >
        <form onSubmit={submit}>
          <header className="dialog-header">
            <div className="action-dialog-heading">
              {destructive && <span className="danger-icon" aria-hidden="true"><AlertTriangle size={19} /></span>}
              <div>
                <p className="eyebrow">Confirm action</p>
                <h2 id={titleId}>{title}</h2>
              </div>
            </div>
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog" disabled={submitting}><X size={19} /></button>
          </header>

          <p id={descriptionId} className="dialog-description">{description}</p>

          {inputLabel && (
            <label className="field action-dialog-field">
              <span>{inputLabel}</span>
              {multiline ? (
                <textarea
                  ref={inputRef as RefObject<HTMLTextAreaElement | null>}
                  value={value}
                  maxLength={maxLength}
                  rows={7}
                  onChange={(event) => setValue(event.target.value)}
                  required
                />
              ) : (
                <input
                  ref={inputRef as RefObject<HTMLInputElement | null>}
                  value={value}
                  maxLength={maxLength}
                  onChange={(event) => setValue(event.target.value)}
                  required
                  autoComplete="off"
                />
              )}
              <small>{value.length}/{maxLength} characters</small>
            </label>
          )}

          <div className="dialog-footer">
            <button type="button" className="secondary-button" onClick={onClose} disabled={submitting}>{cancelLabel}</button>
            <button
              type="submit"
              className={destructive ? "danger-button solid" : "primary-button"}
              disabled={submitting || Boolean(inputLabel && !value.trim())}
            >
              {submitting ? "Working…" : confirmLabel}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

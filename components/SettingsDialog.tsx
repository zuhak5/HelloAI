"use client";

import { AlertTriangle, CheckCircle2, Download, HardDrive, Import, MonitorSmartphone, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useModalDialog } from "@/lib/use-modal-dialog";
import type { ModelInfo, Preferences } from "@/lib/types";

interface Props {
  open: boolean;
  preferences: Preferences;
  models: ModelInfo[];
  storageText: string;
  pwaInstalled: boolean;
  pwaRegistrationState: "checking" | "ready" | "development" | "unsupported" | "insecure" | "error";
  onChange: (value: Preferences) => void;
  onClose: () => void;
  onOpenInstall: () => void;
  onExport: () => void;
  onImport: () => void;
  onClear: () => void;
  onReset: () => void;
}

export function SettingsDialog(props: Props) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const tokenHelpId = useId();
  const dialogRef = useModalDialog<HTMLElement>(props.open, props.onClose, closeButtonRef);
  const [tokenDraft, setTokenDraft] = useState(String(props.preferences.maxOutputTokens));

  useEffect(() => {
    setTokenDraft(String(props.preferences.maxOutputTokens));
  }, [props.preferences.maxOutputTokens]);

  if (!props.open) return null;

  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) => props.onChange({ ...props.preferences, [key]: value });
  const currentModel = props.models.find((model) => model.id === props.preferences.model);
  const commitTokenDraft = () => {
    const parsed = Number(tokenDraft);
    const next = Number.isFinite(parsed) ? Math.min(8000, Math.max(16, Math.round(parsed))) : props.preferences.maxOutputTokens;
    setTokenDraft(String(next));
    if (next !== props.preferences.maxOutputTokens) update("maxOutputTokens", next);
  };
  const pwaStatus = props.pwaRegistrationState === "ready"
    ? "Offline support ready"
    : props.pwaRegistrationState === "checking"
      ? "Checking offline support"
      : props.pwaRegistrationState === "development"
        ? "Enabled in production builds"
      : props.pwaRegistrationState === "insecure"
        ? "HTTPS required"
        : props.pwaRegistrationState === "unsupported"
          ? "Not supported by this browser"
          : "Offline support needs attention";

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}>
      <section
        ref={dialogRef}
        className="dialog settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <header className="dialog-header">
          <div>
            <p className="eyebrow">Local preferences</p>
            <h2 id={titleId}>Settings</h2>
          </div>
          <button ref={closeButtonRef} type="button" className="icon-button" onClick={props.onClose} aria-label="Close settings"><X size={19} /></button>
        </header>

        <p id={descriptionId} className="dialog-description settings-intro">
          Adjust appearance, model behavior, installation, and device-only data controls. Changes are saved automatically in this browser.
        </p>

        <h3 className="settings-section-title">Appearance and responses</h3>
        <div className="settings-grid">
          <label className="field">
            <span>Theme</span>
            <select value={props.preferences.theme} onChange={(event) => update("theme", event.target.value as Preferences["theme"])}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label className="field">
            <span>Text size</span>
            <select value={props.preferences.fontSize} onChange={(event) => update("fontSize", event.target.value as Preferences["fontSize"])}>
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </label>
          <label className="field field-wide">
            <span>Default model</span>
            <select value={props.preferences.model} onChange={(event) => update("model", event.target.value)}>
              {props.models.map((model) => <option key={model.id} value={model.id} disabled={!model.available}>{model.name}{model.available ? "" : " (unavailable)"}</option>)}
            </select>
            <small>{currentModel?.vision ? "Image input enabled. " : "Text only. "}{currentModel?.reasoning ? "Reasoning control available." : "Reasoning control unavailable."}</small>
          </label>
          <label className="field">
            <span>Reasoning effort</span>
            <select
              value={props.preferences.reasoning}
              onChange={(event) => update("reasoning", event.target.value as Preferences["reasoning"])}
              disabled={!currentModel?.reasoning}
            >
              <option value="off">Off</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <small>{currentModel?.reasoning ? "Higher effort may take longer." : "Not supported by this model."}</small>
          </label>
          <label className="field">
            <span>Maximum response tokens</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={tokenDraft}
              aria-describedby={tokenHelpId}
              onChange={(event) => /^\d*$/.test(event.target.value) && setTokenDraft(event.target.value)}
              onBlur={commitTokenDraft}
              onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
            />
            <small id={tokenHelpId}>Allowed range: 16–8,000. The value is validated when you leave the field.</small>
          </label>
          <label className="field field-wide">
            <span>Default system instruction</span>
            <textarea
              rows={4}
              maxLength={10000}
              value={props.preferences.systemPrompt}
              placeholder="Optional instructions applied to new AI requests"
              onChange={(event) => update("systemPrompt", event.target.value)}
            />
            <small>{props.preferences.systemPrompt.length.toLocaleString()}/10,000 characters</small>
          </label>
          <label className="check-field field-wide">
            <input type="checkbox" checked={props.preferences.compact} onChange={(event) => update("compact", event.target.checked)} />
            <span>Use compact conversation spacing</span>
          </label>
        </div>

        <h3 className="settings-section-title settings-section-spaced">Application and storage</h3>
        <button type="button" className="settings-status-card pwa-settings-card" onClick={props.onOpenInstall}>
          {props.pwaInstalled ? <CheckCircle2 size={20} aria-hidden="true" /> : props.pwaRegistrationState === "error" || props.pwaRegistrationState === "insecure" ? <AlertTriangle size={20} aria-hidden="true" /> : <MonitorSmartphone size={20} aria-hidden="true" />}
          <span><strong>{props.pwaInstalled ? "HelloAI is installed" : "Install HelloAI"}</strong><small>{pwaStatus}</small></span>
          <span className="status-action">{props.pwaInstalled ? "View" : "Open"}</span>
        </button>

        <div className="storage-card" role="status" aria-live="polite">
          <HardDrive size={19} aria-hidden="true" />
          <div><strong>Device storage</strong><span>{props.storageText}</span></div>
        </div>

        <div className="settings-actions" aria-label="Local data actions">
          <button type="button" className="secondary-button" onClick={props.onExport}><Download size={17} /> Export chats</button>
          <button type="button" className="secondary-button" onClick={props.onImport}><Import size={17} /> Import chats</button>
          <button type="button" className="secondary-button" onClick={props.onReset}><RotateCcw size={17} /> Reset settings</button>
          <button type="button" className="danger-button" onClick={props.onClear}><Trash2 size={17} /> Clear local data</button>
        </div>

        <p className="settings-note">Chats, images, drafts, and preferences stay in this browser profile. AI requests still travel through the configured HomePilot gateway for processing.</p>
      </section>
    </div>
  );
}

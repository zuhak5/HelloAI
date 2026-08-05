"use client";

import { Download, HardDrive, Import, RotateCcw, Trash2, X } from "lucide-react";
import type { ModelInfo, Preferences } from "@/lib/types";

interface Props {
  open: boolean;
  preferences: Preferences;
  models: ModelInfo[];
  storageText: string;
  onChange: (value: Preferences) => void;
  onClose: () => void;
  onExport: () => void;
  onImport: () => void;
  onClear: () => void;
  onReset: () => void;
}

export function SettingsDialog(props: Props) {
  if (!props.open) return null;
  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) => props.onChange({ ...props.preferences, [key]: value });
  const currentModel = props.models.find((model) => model.id === props.preferences.model);

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}>
      <section className="dialog settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="dialog-header">
          <div>
            <p className="eyebrow">Local preferences</p>
            <h2 id="settings-title">Settings</h2>
          </div>
          <button className="icon-button" onClick={props.onClose} aria-label="Close settings"><X size={19} /></button>
        </header>

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
          </label>
          <label className="field">
            <span>Maximum response tokens</span>
            <input type="number" min={16} max={8000} value={props.preferences.maxOutputTokens} onChange={(event) => update("maxOutputTokens", Math.min(8000, Math.max(16, Number(event.target.value) || 16)))} />
          </label>
          <label className="field field-wide">
            <span>Default system instruction</span>
            <textarea rows={4} maxLength={10000} value={props.preferences.systemPrompt} onChange={(event) => update("systemPrompt", event.target.value)} />
          </label>
          <label className="check-field field-wide">
            <input type="checkbox" checked={props.preferences.compact} onChange={(event) => update("compact", event.target.checked)} />
            <span>Use compact conversation spacing</span>
          </label>
        </div>

        <div className="storage-card">
          <HardDrive size={19} />
          <div><strong>Device storage</strong><span>{props.storageText}</span></div>
        </div>

        <div className="settings-actions">
          <button className="secondary-button" onClick={props.onExport}><Download size={17} /> Export chats</button>
          <button className="secondary-button" onClick={props.onImport}><Import size={17} /> Import chats</button>
          <button className="secondary-button" onClick={props.onReset}><RotateCcw size={17} /> Reset settings</button>
          <button className="danger-button" onClick={props.onClear}><Trash2 size={17} /> Clear local data</button>
        </div>

        <p className="settings-note">Chats, images, drafts, and preferences stay in this browser. AI requests still travel through the configured HomePilot gateway for processing.</p>
      </section>
    </div>
  );
}

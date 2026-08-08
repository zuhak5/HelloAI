"use client";

import { CheckCircle2, Download, MonitorSmartphone, ShieldCheck, WifiOff, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { getPwaInstallInstructions } from "@/lib/pwa";
import { useModalDialog } from "@/lib/use-modal-dialog";
import { usePwa } from "@/components/PwaProvider";

interface Props {
  open: boolean;
  onClose: () => void;
  onResult: (message: string, tone?: "success" | "error" | "info") => void;
}

export function PwaInstallDialog({ open, onClose, onResult }: Props) {
  const pwa = usePwa();
  const [working, setWorking] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useModalDialog<HTMLElement>(open, onClose, pwa.canPrompt ? undefined : closeButtonRef, !working);

  if (!open) return null;

  const isAndroid = pwa.platform === "android";
  const instructions = getPwaInstallInstructions({ platform: pwa.platform, browser: pwa.browser });
  const registrationLabel = pwa.registrationState === "ready"
    ? "Offline app support is ready."
    : pwa.registrationState === "checking"
      ? "Checking offline app support…"
      : pwa.registrationState === "development"
        ? "Offline installation is enabled in production builds."
      : pwa.registrationState === "insecure"
        ? "Installation requires HTTPS or localhost."
        : pwa.registrationState === "unsupported"
          ? "This browser does not support service workers."
          : "Offline app support could not be initialized.";

  const statusTitle = pwa.installed
    ? "Installed on this device"
    : pwa.canPrompt && isAndroid
      ? "Ready for Android app install"
      : pwa.canPrompt
        ? "Ready to install"
        : pwa.androidWebApkTarget
          ? "Waiting for Chrome app install"
          : isAndroid
            ? "Google Chrome required for WebAPK"
            : "Manual installation available";

  const nativeStatus = pwa.installed
    ? "HelloAI is running as an installed app."
    : pwa.canPrompt && isAndroid
      ? "Chrome has exposed its native PWA install prompt. Installing from this button is the path that can produce a WebAPK."
      : pwa.androidWebApkTarget
        ? "Chrome has not exposed native app installation yet. Do not create a home-screen shortcut while this status is shown."
        : isAndroid
          ? "This browser may create only a shortcut. Open the same URL in Google Chrome to target a WebAPK."
          : registrationLabel;

  const install = async () => {
    setWorking(true);
    const outcome = await pwa.install();
    setWorking(false);
    if (outcome === "accepted") {
      onResult(isAndroid ? "Android app installation was accepted by the browser." : "HelloAI installation was accepted.", "success");
      onClose();
    } else if (outcome === "dismissed") {
      onResult("Installation was dismissed. You can try again from Install app.", "info");
    } else if (outcome === "not-ready") {
      onResult("Chrome has not exposed native app installation yet. Do not create a shortcut; keep using HelloAI in Chrome and try again.", "info");
    } else if (outcome === "error") {
      onResult("The browser could not open the installation prompt.", "error");
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !working && onClose()}>
      <section
        ref={dialogRef}
        className="dialog pwa-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={working || undefined}
        tabIndex={-1}
      >
        <header className="dialog-header">
          <div>
            <p className="eyebrow">Progressive web app</p>
            <h2 id={titleId}>{pwa.installed ? "HelloAI is installed" : isAndroid ? "Install as an Android app" : "Install HelloAI"}</h2>
          </div>
          <button ref={closeButtonRef} type="button" className="icon-button" onClick={onClose} aria-label="Close installation instructions" disabled={working}><X size={19} /></button>
        </header>

        <p id={descriptionId} className="dialog-description">
          {isAndroid
            ? "Use Chrome's native install prompt so Android can install HelloAI as an app package instead of a browser-badged shortcut."
            : "Install HelloAI for a dedicated app window, reliable launch access, and the local conversation workspace when the network is unavailable."}
        </p>

        <div className={`pwa-status-card ${pwa.installed ? "installed" : ""}`} role="status" aria-live="polite">
          {pwa.installed ? <CheckCircle2 size={21} aria-hidden="true" /> : <MonitorSmartphone size={21} aria-hidden="true" />}
          <div>
            <strong>{statusTitle}</strong>
            <span>{nativeStatus}</span>
          </div>
        </div>

        <div className="pwa-benefits" aria-label="Installation benefits">
          <div><MonitorSmartphone size={18} aria-hidden="true" /><span><strong>App window</strong>Launch without browser chrome.</span></div>
          <div><WifiOff size={18} aria-hidden="true" /><span><strong>Offline shell</strong>Open local chats without a network.</span></div>
          <div><ShieldCheck size={18} aria-hidden="true" /><span><strong>Device-local data</strong>Your stored chats stay in this browser profile.</span></div>
        </div>

        {!pwa.installed && !pwa.canPrompt && (
          <div className="pwa-instructions">
            <h3>{isAndroid ? "WebAPK installation requirements" : "Install on this browser"}</h3>
            <ol>{instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}</ol>
          </div>
        )}

        <div className="dialog-footer">
          <button type="button" className="secondary-button" onClick={onClose} disabled={working}>{pwa.installed ? "Done" : "Close"}</button>
          {!pwa.installed && pwa.canPrompt && (
            <button type="button" className="primary-button" onClick={install} disabled={working} autoFocus>
              <Download size={17} /> {working ? "Opening prompt…" : isAndroid ? "Install Android app" : "Install now"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { detectPwaClient, isAndroidChromeWebApkTarget, isStandaloneDisplay } from "@/lib/pwa";
import type { PwaBrowser, PwaPlatform } from "@/lib/pwa";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
}

declare global {
  interface Window {
    __helloaiInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

type RegistrationState = "checking" | "ready" | "development" | "unsupported" | "insecure" | "error";
export type InstallOutcome = "accepted" | "dismissed" | "manual" | "not-ready" | "installed" | "error";
export type NativeInstallState = "installed" | "ready" | "waiting-chrome" | "manual";

interface PwaContextValue {
  installed: boolean;
  canPrompt: boolean;
  secureContext: boolean;
  registrationState: RegistrationState;
  updateAvailable: boolean;
  platform: PwaPlatform;
  browser: PwaBrowser;
  androidWebApkTarget: boolean;
  nativeInstallState: NativeInstallState;
  install: () => Promise<InstallOutcome>;
  applyUpdate: () => void;
}

const PwaContext = createContext<PwaContextValue | null>(null);

function readStandaloneState(): boolean {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return isStandaloneDisplay(window.matchMedia("(display-mode: standalone)").matches, navigatorWithStandalone.standalone === true);
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const [installed, setInstalled] = useState(false);
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [registrationState, setRegistrationState] = useState<RegistrationState>("checking");
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const reloadForUpdateRef = useRef(false);

  const client = useMemo(() => {
    if (typeof navigator === "undefined") return { platform: "other" as const, browser: "other" as const };
    const navigatorWithBrave = navigator as Navigator & { brave?: unknown };
    return detectPwaClient({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
      isBrave: Boolean(navigatorWithBrave.brave),
    });
  }, []);
  const androidWebApkTarget = isAndroidChromeWebApkTarget(client);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const updateInstalledState = () => setInstalled(readStandaloneState());
    const capturePrompt = (event: BeforeInstallPromptEvent) => {
      event.preventDefault();
      window.__helloaiInstallPrompt = event;
      setPromptEvent(event);
    };
    const consumeBootstrapPrompt = () => {
      const event = window.__helloaiInstallPrompt;
      if (event) setPromptEvent(event);
    };
    const onBeforeInstallPrompt = (event: Event) => capturePrompt(event as BeforeInstallPromptEvent);
    const onAppInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
      window.__helloaiInstallPrompt = null;
    };

    updateInstalledState();
    consumeBootstrapPrompt();
    displayMode.addEventListener?.("change", updateInstalledState);
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("helloai:beforeinstallprompt", consumeBootstrapPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      displayMode.removeEventListener?.("change", updateInstalledState);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("helloai:beforeinstallprompt", consumeBootstrapPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      setRegistrationState("unsupported");
      return;
    }
    if (!window.isSecureContext) {
      setRegistrationState("insecure");
      return;
    }
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => undefined)
        .finally(() => setRegistrationState("development"));
      return;
    }

    let disposed = false;
    const markWaitingWorker = (registration: ServiceWorkerRegistration) => {
      if (registration.waiting && navigator.serviceWorker.controller) setUpdateAvailable(true);
    };
    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        if (disposed) return;
        registrationRef.current = registration;
        markWaitingWorker(registration);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) setUpdateAvailable(true);
          });
        });
        await navigator.serviceWorker.ready;
        if (!disposed) setRegistrationState("ready");
        registration.update().catch(() => undefined);
      } catch {
        if (!disposed) setRegistrationState("error");
      }
    };

    const onControllerChange = () => {
      if (reloadForUpdateRef.current) window.location.reload();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") registrationRef.current?.update().catch(() => undefined);
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    register().catch(() => undefined);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  const install = useCallback(async (): Promise<InstallOutcome> => {
    if (installed) return "installed";
    if (!promptEvent) return androidWebApkTarget ? "not-ready" : "manual";
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      setPromptEvent(null);
      window.__helloaiInstallPrompt = null;
      return choice.outcome;
    } catch {
      setPromptEvent(null);
      window.__helloaiInstallPrompt = null;
      return "error";
    }
  }, [androidWebApkTarget, installed, promptEvent]);

  const applyUpdate = useCallback(() => {
    const waiting = registrationRef.current?.waiting;
    if (!waiting) return;
    reloadForUpdateRef.current = true;
    waiting.postMessage({ type: "SKIP_WAITING" });
    waiting.postMessage("SKIP_WAITING");
  }, []);

  const nativeInstallState: NativeInstallState = installed
    ? "installed"
    : promptEvent
      ? "ready"
      : androidWebApkTarget
        ? "waiting-chrome"
        : "manual";

  const value = useMemo<PwaContextValue>(() => ({
    installed,
    canPrompt: Boolean(promptEvent) && !installed,
    secureContext: typeof window !== "undefined" ? window.isSecureContext : true,
    registrationState,
    updateAvailable,
    platform: client.platform,
    browser: client.browser,
    androidWebApkTarget,
    nativeInstallState,
    install,
    applyUpdate,
  }), [androidWebApkTarget, applyUpdate, client.browser, client.platform, install, installed, nativeInstallState, promptEvent, registrationState, updateAvailable]);

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

export function usePwa(): PwaContextValue {
  const value = useContext(PwaContext);
  if (!value) throw new Error("usePwa must be used inside PwaProvider.");
  return value;
}

"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => undefined);
      return;
    }

    let reloading = false;
    const controllerChanged = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        await registration.update().catch(() => undefined);
        registration.waiting?.postMessage("SKIP_WAITING");
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) worker.postMessage("SKIP_WAITING");
          });
        });
      } catch {
        // The application remains usable without offline installation support.
      }
    };

    navigator.serviceWorker.addEventListener("controllerchange", controllerChanged);
    if (document.readyState === "complete") register().catch(() => undefined);
    else window.addEventListener("load", register, { once: true });

    return () => {
      window.removeEventListener("load", register);
      navigator.serviceWorker.removeEventListener("controllerchange", controllerChanged);
    };
  }, []);

  return null;
}

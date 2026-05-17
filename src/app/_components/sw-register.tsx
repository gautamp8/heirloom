"use client";

import { useEffect } from "react";

/** Registers /sw.js on the client. Skipped in the Tauri shell (which
 *  unregisters any stale SW) and when NEXT_PUBLIC_DISABLE_SW=1. In dev
 *  the SW is registered with ?dev=1 so push + notification handlers
 *  work but the fetch handler stays out of HMR's way. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NEXT_PUBLIC_DISABLE_SW === "1") return;

    const isTauri =
      "__TAURI_INTERNALS__" in window ||
      navigator.userAgent.includes("Heirloom/");

    if (isTauri) {
      // Drop any SW that survived a prior install so cached chunks
      // from an older web build don't get served inside the shell.
      navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const r of regs) r.unregister().catch(() => {});
      });
      return;
    }

    const isDev = process.env.NODE_ENV !== "production";
    const url = isDev ? "/sw.js?dev=1" : "/sw.js";

    const onLoad = () => {
      navigator.serviceWorker
        .register(url, { scope: "/" })
        .catch((err) => {
          console.warn("[sw] registration failed", err);
        });
    };

    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
  }, []);

  return null;
}

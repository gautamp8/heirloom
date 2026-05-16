"use client";

import { useEffect } from "react";

/** Registers /sw.js on the client. Skipped in dev, in the Tauri shell,
 *  and when NEXT_PUBLIC_DISABLE_SW=1. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    if (process.env.NEXT_PUBLIC_DISABLE_SW === "1") return;

    const isTauri =
      "__TAURI_INTERNALS__" in window ||
      navigator.userAgent.includes("Heirloom/");

    if (isTauri) {
      // Drop any SW that survived a prior install so cached chunks from
      // an older bundle don't get served on the new one.
      navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const r of regs) r.unregister().catch(() => {});
      });
      return;
    }

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => {
          console.warn("[sw] registration failed", err);
        });
    };

    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
  }, []);

  return null;
}

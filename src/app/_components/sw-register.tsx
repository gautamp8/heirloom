"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js once on the client. Skipped in dev where Next.js'
 * HMR + the SW's runtime cache would race and serve stale chunks.
 *
 * To force-disable in production for a debugging session, set
 * NEXT_PUBLIC_DISABLE_SW=1.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    if (process.env.NEXT_PUBLIC_DISABLE_SW === "1") return;

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

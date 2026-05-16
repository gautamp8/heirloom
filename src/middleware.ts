import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Force `no-store` on every HTML/JSON response so the Tauri WKWebView
 * doesn't heuristically cache prerendered pages across DMG updates.
 * Static, fingerprinted assets under /_next/static stay `immutable`.
 */
export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const res = NextResponse.next();
  // Identifies a response as coming from the bundled SQLite server -
  // the Tauri shell checks for this on /api/health before navigating
  // the WebView, so an unrelated process on port 3000 can't impersonate it.
  if (process.env.HEIRLOOM_BACKEND === "sqlite") {
    res.headers.set("x-heirloom-backend", "sqlite");
  }
  if (pathname.startsWith("/_next/static") || pathname === "/favicon.ico") {
    return res;
  }
  res.headers.set("Cache-Control", "no-store, must-revalidate");
  return res;
}

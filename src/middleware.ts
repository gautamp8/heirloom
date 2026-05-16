import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Force `no-store` on every HTML/JSON response so the Tauri WKWebView
 * doesn't heuristically cache prerendered pages across DMG updates.
 * Static, fingerprinted assets under /_next/static stay `immutable`.
 */
export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  if (pathname.startsWith("/_next/static") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }
  const res = NextResponse.next();
  res.headers.set("Cache-Control", "no-store, must-revalidate");
  return res;
}

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Force `no-store` on HTML/JSON so the Tauri WebView doesn't cache
 *  prerendered pages across updates. Fingerprinted assets under
 *  /_next/static stay long-cached. */
export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const res = NextResponse.next();
  if (pathname.startsWith("/_next/static") || pathname === "/favicon.ico") {
    return res;
  }
  res.headers.set("Cache-Control", "no-store, must-revalidate");
  return res;
}

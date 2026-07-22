import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Force `no-store` on HTML/JSON so the Tauri WebView doesn't cache
 *  prerendered pages across updates. Fingerprinted assets under
 *  /_next/static stay long-cached. */
export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const res = NextResponse.next();
  // Never touch Next internals: /_next/static (fingerprinted assets, stay
  // long-cached), the dev HMR websocket + RSC under /_next/, or the
  // favicon. Injecting a Cache-Control header onto the HMR websocket
  // upgrade corrupts its 101 response and breaks hydration in dev.
  if (pathname.startsWith("/_next/") || pathname === "/favicon.ico") {
    return res;
  }
  res.headers.set("Cache-Control", "no-store, must-revalidate");
  return res;
}

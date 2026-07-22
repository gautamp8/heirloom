import type { Metadata, Viewport } from "next";
import { Source_Serif_4, Geist, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "./_components/sw-register";
import { DemoBanner } from "./_components/demo-banner";
import { MotionProvider } from "./_components/motion-provider";

const DEMO_NOTICE = process.env.NEXT_PUBLIC_HEIRLOOM_DEMO_NOTICE === "1";

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["200", "300", "400", "500"],
  style: ["normal", "italic"],
  display: "swap",
});

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Heirloom",
  description: "A private place for the memories you mean to leave behind.",
  manifest: "/manifest.webmanifest",
  applicationName: "Heirloom",
  appleWebApp: {
    capable: true,
    title: "Heirloom",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#faf7f0",
  width: "device-width",
  initialScale: 1,
  // No maximumScale: pinch-zoom must stay available for low-vision users
  // (Lighthouse a11y flags maximum-scale=1). iOS auto-zoom on input focus
  // is prevented the accessible way instead — inputs are ≥16px (globals.css
  // `.input`), which stops the zoom without trapping the whole viewport.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sourceSerif.variable} ${geist.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-paper text-ink" suppressHydrationWarning>
        {/* Applies the per-session demo-banner dismissal BEFORE the banner
            paints. The banner is server-rendered (so it costs no layout
            shift); this hides it for someone who already dismissed it,
            without a flash. It sits at the top of <body> rather than in a
            <head> element, because declaring a raw <head> in the root
            layout changes how Next generates the document shell. */}
        {DEMO_NOTICE && (
          <script
            dangerouslySetInnerHTML={{
              __html:
                "try{if(sessionStorage.getItem('heirloom-demo-banner-dismissed')==='1')" +
                "document.documentElement.setAttribute('data-demo-banner-dismissed','1')}catch(e){}",
            }}
          />
        )}
        <MotionProvider>
          <DemoBanner enabled={DEMO_NOTICE} />
          {children}
          <ServiceWorkerRegister />
        </MotionProvider>
      </body>
    </html>
  );
}

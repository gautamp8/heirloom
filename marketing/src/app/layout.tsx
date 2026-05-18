import type { Metadata, Viewport } from "next";
import { Source_Serif_4, Geist, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600"],
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

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://heirloom.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Heirloom — Preserve presence across generations",
    template: "%s — Heirloom",
  },
  description:
    "A private, local-first place for the voice, photographs, and letters someone wanted to leave behind. Not a chatbot. Not a resurrection. A held space.",
  applicationName: "Heirloom",
  authors: [{ name: "Heirloom" }],
  keywords: [
    "memory archive",
    "local-first",
    "Gemma 4",
    "Ollama",
    "voice preservation",
    "legacy",
    "privacy",
  ],
  openGraph: {
    type: "website",
    siteName: "Heirloom",
    title: "Heirloom — Preserve presence across generations",
    description:
      "A private, local-first place for the voice, photographs, and letters someone wanted to leave behind.",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "Heirloom — Preserve presence across generations",
    description:
      "A private, local-first place for the voice, photographs, and letters someone wanted to leave behind.",
  },
  alternates: { canonical: SITE_URL },
  icons: {
    icon: [{ url: "/seal.png", sizes: "any", type: "image/png" }],
    apple: [{ url: "/seal-2x.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#faf7f0",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${sourceSerif.variable} ${geist.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-dvh bg-paper text-ink antialiased">
        <Nav />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}

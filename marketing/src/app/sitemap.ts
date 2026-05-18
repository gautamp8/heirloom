import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://heirloom.vercel.app";
  const now = new Date();
  return [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: `${SITE}/design`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/transparency`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
  ];
}

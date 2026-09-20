import type { MetadataRoute } from "next";

const siteUrl = (
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  "https://sabekframe.arunjaiswal139.workers.dev"
).replace(/\/$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl, changeFrequency: "weekly", priority: 1 },
    {
      url: `${siteUrl}/ai-photo-generator`,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    { url: `${siteUrl}/about`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${siteUrl}/contact`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${siteUrl}/privacy-policy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${siteUrl}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${siteUrl}/refund-policy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${siteUrl}/delivery-policy`, changeFrequency: "yearly", priority: 0.2 },
  ];
}

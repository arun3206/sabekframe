import type { MetadataRoute } from "next";

const siteUrl = (
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  "https://sabekframe.arunjaiswal139.workers.dev"
).replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/result/"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}

import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

describe("SEO foundation", () => {
  it("publishes the portrait landing page in the sitemap", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain(
      "https://sabekframe.arunjaiswal139.workers.dev/ai-photo-generator",
    );
    expect(urls.some((url) => url.includes("/product/"))).toBe(false);
  });

  it("keeps private workflow routes out of search", () => {
    const rules = robots().rules;
    expect(rules).toMatchObject({ disallow: ["/api/", "/result/"] });
  });
});

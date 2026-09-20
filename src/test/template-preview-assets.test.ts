import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { portraitTemplates } from "@/config/portrait-templates";

describe("static template preview assets", () => {
  it.each(portraitTemplates)(
    "serves $name from a local versioned WebP",
    async (template) => {
      expect(template.previewImage).toMatch(/^\/templates\/.+-v\d+\.webp$/);
      expect(template.previewImage).not.toContain("/api/");
      expect(template.previewImage).not.toContain("amazonaws.com");
      expect(template.masterFilePath).not.toBe(template.previewImage);

      const preview = await readFile(
        path.join(process.cwd(), "public", template.previewImage.slice(1)),
      );
      expect(preview.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(preview.subarray(8, 12).toString("ascii")).toBe("WEBP");
      expect(preview.byteLength).toBeLessThan(250_000);
    },
  );
});

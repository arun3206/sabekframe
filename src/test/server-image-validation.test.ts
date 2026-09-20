// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  detectRasterSignature,
  validateAndSanitizeImage,
} from "@/server/uploads/image-validation";

describe("server image validation", () => {
  it("rejects non-raster signatures", () =>
    expect(detectRasterSignature(new TextEncoder().encode("<svg"))).toBeNull());
  it("recognizes JPEG, PNG and WebP signatures", () => {
    expect(detectRasterSignature(new Uint8Array([0xff, 0xd8, 0xff]))).toBe("jpeg");
    expect(
      detectRasterSignature(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10])),
    ).toBe("png");
    expect(detectRasterSignature(new TextEncoder().encode("RIFF0000WEBP"))).toBe("webp");
  });
  it("rejects impossible browser face coordinates", async () => {
    const source = await sharp({
      create: { width: 800, height: 800, channels: 3, background: "#888" },
    })
      .jpeg()
      .toBuffer();
    await expect(
      validateAndSanitizeImage(source, { x: 0.9, y: 0.1, width: 0.5, height: 0.5 }),
    ).rejects.toThrow("INVALID_FACE_BOX");
  });
  it("accepts a valid face box covering two percent of a wider portrait", async () => {
    const source = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: "#888" },
    })
      .jpeg()
      .toBuffer();
    const result = await validateAndSanitizeImage(source, {
      x: 0.4,
      y: 0.2,
      width: 0.1,
      height: 0.2,
    });

    expect(result.reasons).toContain("blur-warning");
    expect(result.hardFailure).toBe(false);
  });
  it("uses the full photograph when the optional face check finds no single face", async () => {
    const source = await sharp({
      create: { width: 800, height: 800, channels: 3, background: "#888" },
    })
      .jpeg()
      .toBuffer();

    const result = await validateAndSanitizeImage(source, null);

    expect(result.width).toBe(800);
    expect(result.height).toBe(800);
    expect(result.hardFailure).toBe(false);
  });
  it("rejects images below the minimum dimension", async () => {
    const source = await sharp({
      create: { width: 400, height: 700, channels: 3, background: "#888" },
    })
      .jpeg()
      .toBuffer();
    await expect(
      validateAndSanitizeImage(source, { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }),
    ).rejects.toThrow("IMAGE_TOO_SMALL");
  });
  it("re-encodes without source metadata", async () => {
    const source = await sharp({
      create: { width: 800, height: 800, channels: 3, background: "#888" },
    })
      .withMetadata({ exif: { IFD0: { ImageDescription: "private test metadata" } } })
      .jpeg()
      .toBuffer();
    const result = await validateAndSanitizeImage(source, {
      x: 0.1,
      y: 0.1,
      width: 0.8,
      height: 0.8,
    });
    const metadata = await sharp(result.bytes).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(metadata.comments).toBeUndefined();
  });
  it("treats severe blur as a warning instead of a hard failure", async () => {
    const source = await sharp({
      create: { width: 800, height: 800, channels: 3, background: "#888" },
    })
      .jpeg()
      .toBuffer();
    const result = await validateAndSanitizeImage(source, {
      x: 0.1,
      y: 0.1,
      width: 0.8,
      height: 0.8,
    });

    expect(result.measurements.faceSharpness).toBe(0);
    expect(result.reasons).toContain("blur-warning");
    expect(result.hardFailure).toBe(false);
  });
});

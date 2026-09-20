import { describe, expect, it } from "vitest";
import { photoUploadRestrictions } from "@/config/photo-upload";
import {
  detectImageFormat,
  isAnimatedWebP,
  normalizePhoto,
} from "@/features/photo-upload/normalization";

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (value: string) => new TextEncoder().encode(value);

describe("input signatures", () => {
  it("detects JPEG magic bytes", () =>
    expect(detectImageFormat(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg"));
  it("detects PNG magic bytes", () =>
    expect(detectImageFormat(bytes(0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10))).toBe("png"));
  it("detects static WebP", () =>
    expect(detectImageFormat(ascii("RIFF0000WEBPVP8 "))).toBe("webp"));
  it("detects HEIC by its ftyp brand", () =>
    expect(detectImageFormat(bytes(0, 0, 0, 24, ...ascii("ftypheic")))).toBe("heic"));
  it("detects HEIF by its ftyp brand", () =>
    expect(detectImageFormat(bytes(0, 0, 0, 24, ...ascii("ftypmif1")))).toBe("heif"));
  it("rejects PDF as an image format", () =>
    expect(detectImageFormat(ascii("%PDF-1.7"))).toBe("pdf"));
  it("rejects GIF as an image format", () =>
    expect(detectImageFormat(ascii("GIF89a"))).toBe("gif"));
  it("does not trust executable bytes with an image name", () =>
    expect(detectImageFormat(ascii("MZ executable"))).toBeNull());
  it("recognizes animated WebP chunks", () =>
    expect(isAnimatedWebP(ascii("RIFF0000WEBPVP8X0000ANIM"))).toBe(true));
});

describe("input size", () => {
  it("rejects a photo larger than the configured 15 MB limit", async () => {
    const oversizedPhoto = {
      size: photoUploadRestrictions.maxSourceFileSizeBytes + 1,
    } as File;

    await expect(normalizePhoto(oversizedPhoto)).rejects.toMatchObject({
      code: "FILE_TOO_LARGE",
      message: "This photo is larger than 15 MB. Choose a smaller photo.",
    });
  });
});

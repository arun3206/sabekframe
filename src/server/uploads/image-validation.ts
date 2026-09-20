import sharp from "sharp";
import { photoUploadRestrictions } from "@/config/photo-upload";
import type { FaceBoundingBox, QualityReason } from "@/features/photo-upload/types";

function has(bytes: Uint8Array, values: number[], offset = 0) {
  return values.every((value, index) => bytes[offset + index] === value);
}

export function detectRasterSignature(bytes: Uint8Array): "jpeg" | "png" | "webp" | null {
  if (has(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (has(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (has(bytes, [0x52, 0x49, 0x46, 0x46]) && has(bytes, [0x57, 0x45, 0x42, 0x50], 8))
    return "webp";
  return null;
}

function validateBox(box: FaceBoundingBox): FaceBoundingBox {
  const values = [box.x, box.y, box.width, box.height];
  if (
    values.some((value) => !Number.isFinite(value)) ||
    box.x < 0 ||
    box.y < 0 ||
    box.width <= 0 ||
    box.height <= 0 ||
    box.width * box.height < photoUploadRestrictions.face.minimumAreaRatioFail ||
    box.x + box.width > 1 ||
    box.y + box.height > 1
  ) {
    throw new Error("INVALID_FACE_BOX");
  }
  return box;
}

function laplacianVariance(pixels: Uint8Array, width: number, height: number) {
  if (width < 3 || height < 3) return 0;
  let sum = 0;
  let sumSquares = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const value =
        4 * (pixels[index] ?? 0) -
        (pixels[index - 1] ?? 0) -
        (pixels[index + 1] ?? 0) -
        (pixels[index - width] ?? 0) -
        (pixels[index + width] ?? 0);
      sum += value;
      sumSquares += value * value;
      count += 1;
    }
  }
  const mean = sum / count;
  return sumSquares / count - mean * mean;
}

export interface ValidatedServerImage {
  bytes: Uint8Array;
  width: number;
  height: number;
  reasons: QualityReason[];
  hardFailure: boolean;
  measurements: { faceSharpness: number; brightness: number };
}

export async function validateAndSanitizeImage(
  source: Uint8Array,
  suppliedBox: FaceBoundingBox | null,
): Promise<ValidatedServerImage> {
  if (source.byteLength > photoUploadRestrictions.maxSourceFileSizeBytes)
    throw new Error("FILE_TOO_LARGE");
  if (!detectRasterSignature(source)) throw new Error("UNSUPPORTED_SIGNATURE");

  const input = sharp(source, {
    animated: true,
    limitInputPixels: photoUploadRestrictions.maxDecodedPixelCount,
    failOn: "error",
  });
  const metadata = await input.metadata();
  if (
    !metadata.width ||
    !metadata.height ||
    !["jpeg", "png", "webp"].includes(metadata.format ?? "")
  )
    throw new Error("INVALID_IMAGE");
  if ((metadata.pages ?? 1) !== 1) throw new Error("MULTI_FRAME_IMAGE");

  const box = suppliedBox
    ? validateBox(suppliedBox)
    : { x: 0, y: 0, width: 1, height: 1 };
  const sanitizedBuffer = await input
    .rotate()
    .resize({
      width: photoUploadRestrictions.maxNormalizedLongestSide,
      height: photoUploadRestrictions.maxNormalizedLongestSide,
      fit: "inside",
      withoutEnlargement: true,
    })
    .toColourspace("srgb")
    .jpeg({
      quality: Math.round(photoUploadRestrictions.normalizedJpegQuality * 100),
      mozjpeg: true,
    })
    .toBuffer();
  const sanitized = sharp(sanitizedBuffer);
  const safeMetadata = await sanitized.metadata();
  const width = safeMetadata.width ?? 0;
  const height = safeMetadata.height ?? 0;
  if (Math.min(width, height) < photoUploadRestrictions.hardMinimumShortestSide)
    throw new Error("IMAGE_TOO_SMALL");

  const left = Math.max(0, Math.floor(box.x * width));
  const top = Math.max(0, Math.floor(box.y * height));
  const cropWidth = Math.max(1, Math.min(width - left, Math.ceil(box.width * width)));
  const cropHeight = Math.max(1, Math.min(height - top, Math.ceil(box.height * height)));
  const { data, info } = await sharp(sanitizedBuffer)
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = new Uint8Array(data);
  const faceSharpness = laplacianVariance(pixels, info.width, info.height);
  const brightness = pixels.reduce((total, value) => total + value, 0) / pixels.length;
  const reasons: QualityReason[] = [];
  if (faceSharpness < photoUploadRestrictions.sharpness.warnBelow)
    reasons.push("blur-warning");
  if (brightness < photoUploadRestrictions.brightness.severeDarkBelow) {
    reasons.push("too-dark");
  } else if (brightness < photoUploadRestrictions.brightness.warnDarkBelow)
    reasons.push("too-dark");
  if (brightness > photoUploadRestrictions.brightness.severeBrightAbove) {
    reasons.push("too-bright");
  } else if (brightness > photoUploadRestrictions.brightness.warnBrightAbove)
    reasons.push("too-bright");

  return {
    bytes: new Uint8Array(sanitizedBuffer),
    width,
    height,
    reasons,
    hardFailure: false,
    measurements: { faceSharpness, brightness },
  };
}

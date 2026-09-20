import { photoUploadRestrictions } from "@/config/photo-upload";
import type { NormalizedImage } from "@/features/photo-upload/types";

type SourceFormat = NormalizedImage["sourceFormat"];
export class PhotoInputError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

export function detectImageFormat(
  bytes: Uint8Array,
): SourceFormat | "gif" | "pdf" | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (ascii(bytes, 0, 8) === "\u0089PNG\r\n\u001a\n") return "png";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "webp";
  if (ascii(bytes, 0, 3) === "GIF") return "gif";
  if (ascii(bytes, 0, 4) === "%PDF") return "pdf";
  if (ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4).toLowerCase();
    if (["heic", "heix", "hevc", "hevx"].includes(brand)) return "heic";
    if (["heif", "mif1", "msf1"].includes(brand)) return "heif";
  }
  return null;
}

export function isAnimatedWebP(bytes: Uint8Array): boolean {
  return (
    ascii(bytes, 0, 4) === "RIFF" &&
    new TextDecoder("latin1").decode(bytes).includes("ANIM")
  );
}

function expectedMime(format: SourceFormat) {
  return format === "jpeg" ? ["image/jpeg", "image/jpg"] : [`image/${format}`];
}

async function decodeToBitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(blob, { imageOrientation: "from-image" });
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function normalizePhoto(
  source: File,
  onStage?: (stage: "reading" | "converting" | "normalizing") => void,
): Promise<NormalizedImage> {
  onStage?.("reading");
  if (source.size > photoUploadRestrictions.maxSourceFileSizeBytes)
    throw new PhotoInputError(
      "FILE_TOO_LARGE",
      `This photo is larger than ${photoUploadRestrictions.maxSourceFileSizeMegabytes} MB. Choose a smaller photo.`,
    );
  const bytes = new Uint8Array(await source.arrayBuffer());
  const format = detectImageFormat(bytes.slice(0, Math.min(bytes.length, 64 * 1024)));
  if (!format || format === "gif" || format === "pdf")
    throw new PhotoInputError(
      "UNSUPPORTED_FORMAT",
      "Choose a JPEG, PNG, WebP, HEIC or HEIF photo.",
    );
  if (format === "webp" && isAnimatedWebP(bytes))
    throw new PhotoInputError(
      "ANIMATED_IMAGE",
      "Animated images are not supported. Choose a still photograph.",
    );
  if (
    source.type &&
    source.type !== "application/octet-stream" &&
    !expectedMime(format).includes(source.type.toLowerCase())
  )
    throw new PhotoInputError(
      "MIME_MISMATCH",
      "This file does not match its image type. Choose the original photograph.",
    );

  let safeBlob: Blob = source;
  if (format === "heic" || format === "heif") {
    onStage?.("converting");
    try {
      const { heicTo } = await import("heic-to/next");
      safeBlob = await heicTo({
        blob: source,
        type: "image/jpeg",
        quality: photoUploadRestrictions.normalizedJpegQuality,
      });
    } catch {
      throw new PhotoInputError(
        "HEIC_CONVERSION_FAILED",
        "We couldn’t prepare this iPhone photo. Try exporting it as JPEG.",
      );
    }
  }
  onStage?.("normalizing");
  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = await decodeToBitmap(safeBlob);
  } catch {
    throw new PhotoInputError(
      "UNDECODABLE_IMAGE",
      "This photo could not be opened. Choose another copy.",
    );
  }
  try {
    if (bitmap.width * bitmap.height > photoUploadRestrictions.maxDecodedPixelCount)
      throw new PhotoInputError(
        "TOO_MANY_PIXELS",
        "This photo is too large to process safely. Choose a lower-resolution copy.",
      );
    if (
      Math.min(bitmap.width, bitmap.height) <
      photoUploadRestrictions.hardMinimumShortestSide
    )
      throw new PhotoInputError(
        "IMAGE_TOO_SMALL",
        "This photo is too small. Choose one at least 512px on its shortest side.",
      );
    const scale = Math.min(
      1,
      photoUploadRestrictions.maxNormalizedLongestSide /
        Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context)
      throw new PhotoInputError(
        "UNDECODABLE_IMAGE",
        "This browser could not prepare the photo.",
      );
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", photoUploadRestrictions.normalizedJpegQuality),
    );
    if (!blob)
      throw new PhotoInputError(
        "UNDECODABLE_IMAGE",
        "This browser could not prepare the photo.",
      );
    return {
      file: new File([blob], `${crypto.randomUUID()}.jpg`, { type: "image/jpeg" }),
      width,
      height,
      sourceFormat: format,
    };
  } finally {
    if ("close" in bitmap) bitmap.close();
  }
}

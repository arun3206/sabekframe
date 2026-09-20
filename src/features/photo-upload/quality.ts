import { photoUploadRestrictions } from "@/config/photo-upload";
import type {
  FaceBoundingBox,
  ImageQualityResult,
  QualityReason,
} from "@/features/photo-upload/types";

export function laplacianVariance(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
) {
  let sum = 0;
  let squares = 0;
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
      squares += value * value;
      count += 1;
    }
  }
  if (!count) return 0;
  const mean = sum / count;
  return squares / count - mean * mean;
}

export function classifyQuality(input: {
  faceCount: number;
  faceBoundingBox: FaceBoundingBox | null;
  faceSizeRatio: number;
  faceSharpness: number;
  overallSharpness: number;
  brightness: number;
  cropped: boolean;
  shortestSide: number;
}): ImageQualityResult {
  const reasons: QualityReason[] = [];
  if (input.faceCount === 0) {
    reasons.push("no-face");
  }
  if (input.faceCount > 1) {
    reasons.push("multiple-faces");
  }
  if (input.faceCount === 1) {
    if (input.faceSizeRatio < photoUploadRestrictions.face.minimumAreaRatioFail) {
      reasons.push("face-too-small");
    } else if (input.faceSizeRatio < photoUploadRestrictions.face.minimumAreaRatioWarning)
      reasons.push("face-too-small");
    if (input.cropped) reasons.push("face-cropped");
    if (input.faceSharpness < photoUploadRestrictions.sharpness.warnBelow)
      reasons.push("blur-warning");
    if (input.brightness < photoUploadRestrictions.brightness.warnDarkBelow)
      reasons.push("too-dark");
    if (input.brightness > photoUploadRestrictions.brightness.warnBrightAbove)
      reasons.push("too-bright");
  }
  if (input.shortestSide < photoUploadRestrictions.recommendedMinimumShortestSide)
    reasons.push("recommended-dimensions");
  return {
    status: reasons.length ? "warning" : "pass",
    faceCount: input.faceCount,
    faceBoundingBox: input.faceBoundingBox,
    faceSizeRatio: input.faceSizeRatio,
    faceSharpness: input.faceSharpness,
    overallSharpness: input.overallSharpness,
    brightness: input.brightness,
    reasons,
  };
}

export function applyExpectedFaceCount(
  result: ImageQualityResult,
  expectedFaceCount: 1 | 2 | 3,
): ImageQualityResult {
  if (
    result.faceCount !== expectedFaceCount ||
    !result.reasons.includes("multiple-faces")
  )
    return result;

  const reasons = result.reasons.filter((reason) => reason !== "multiple-faces");
  return {
    ...result,
    status: reasons.length ? "warning" : "pass",
    reasons,
  };
}

export const photoUploadRestrictions = {
  peoplePerPortrait: 2,
  filesRequired: 2,
  maxSourceFileSizeMegabytes: 15,
  maxSourceFileSizeBytes: 15 * 1024 * 1024,
  maxDecodedPixelCount: 40_000_000,
  hardMinimumShortestSide: 512,
  recommendedMinimumShortestSide: 768,
  maxNormalizedLongestSide: 2048,
  normalizedJpegQuality: 0.9,
  acceptedMimeTypes: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
  ],
  acceptedExtensions: ["jpg", "jpeg", "png", "webp", "heic", "heif"],
  rawUploadRetentionMinutes: 60,
  sanitizedUploadRetentionHours: 24,
  signedUploadLifetimeSeconds: 120,
  signedPreviewLifetimeSeconds: 300,
  face: {
    minimumDetectionConfidence: 0.45,
    boundingBoxExpansionRatio: 0.15,
    croppedEdgeRatio: 0.02,
    // High-resolution half/full-body portraits can retain a detailed face at 1-3%.
    minimumAreaRatioFail: 0.01,
    minimumAreaRatioWarning: 0.03,
  },
  sharpness: {
    // Laplacian variance measured on an expanded, greyscale face crop.
    // Blur is advisory because older family photos can still be useful inputs.
    warnBelow: 80,
  },
  brightness: {
    // Mean face-crop luminance on the 0-255 scale.
    severeDarkBelow: 24,
    warnDarkBelow: 45,
    warnBrightAbove: 220,
    severeBrightAbove: 240,
  },
} as const;

export const uploadRateLimits = {
  prepare: { limit: 8, windowMs: 60_000 },
  finalize: { limit: 8, windowMs: 60_000 },
  delete: { limit: 16, windowMs: 60_000 },
  preview: { limit: 60, windowMs: 60_000 },
  generate: { limit: 4, windowMs: 60_000 },
  generationStatus: { limit: 60, windowMs: 60_000 },
  generationOutput: { limit: 20, windowMs: 60_000 },
} as const;

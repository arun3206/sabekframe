import type { Relationship } from "@/features/portrait-flow/types";

export type PhotoRole = "first" | "second";
export type QualityStatus = "pass" | "warning" | "fail";

export interface FaceBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type QualityReason =
  | "no-face"
  | "multiple-faces"
  | "face-too-small"
  | "face-cropped"
  | "blur-warning"
  | "too-dark"
  | "too-bright"
  | "quality-check-unavailable"
  | "recommended-dimensions";

export interface ImageQualityResult {
  status: QualityStatus;
  faceCount: number;
  faceBoundingBox: FaceBoundingBox | null;
  faceSizeRatio: number;
  faceSharpness: number;
  overallSharpness: number;
  brightness: number;
  reasons: readonly QualityReason[];
}

export interface NormalizedImage {
  file: File;
  width: number;
  height: number;
  sourceFormat: "jpeg" | "png" | "webp" | "heic" | "heif";
}

export interface StoredUploadAsset {
  assetId: string;
  role: PhotoRole;
  validationStatus: "pass" | "warning-accepted";
  width: number;
  height: number;
}

export interface PreparedUploadResponse {
  uploadId: string;
  uploadUrl: string;
  uploadKind: "binary";
  uploadHeaders: Readonly<Record<string, string>>;
}

export interface FinalizedUploadResponse {
  assetId: string;
  role: PhotoRole;
  validationStatus: "pass" | "warning-accepted";
  width: number;
  height: number;
}

export interface PrepareUploadInput {
  relationship: Relationship;
  role: PhotoRole;
}

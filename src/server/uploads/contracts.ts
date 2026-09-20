import { z } from "zod";
import { relationships } from "@/config/relationships";

const relationshipIds = relationships.map(({ id }) => id) as [string, ...string[]];

export const photoRoleSchema = z.enum(["first", "second"]);
export const relationshipIdSchema = z.enum(relationshipIds);

export const prepareUploadSchema = z.object({
  relationship: relationshipIdSchema,
  role: photoRoleSchema,
});

export const finalizeUploadSchema = z.object({
  uploadId: z.string().uuid(),
  relationship: relationshipIdSchema,
  role: photoRoleSchema,
  clientQualityStatus: z.enum(["pass", "warning-accepted"]),
  faceBoundingBox: z
    .object({
      x: z.number().finite().min(0).max(1),
      y: z.number().finite().min(0).max(1),
      width: z.number().finite().positive().max(1),
      height: z.number().finite().positive().max(1),
    })
    .nullable(),
});

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "INVALID_IMAGE"
  | "QUALITY_REJECTED"
  | "STORAGE_UNAVAILABLE";

export function apiError(code: ApiErrorCode, message: string, status: number) {
  return Response.json({ ok: false, error: { code, message } }, { status });
}

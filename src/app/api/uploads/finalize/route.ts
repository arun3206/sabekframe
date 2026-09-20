import { photoUploadRestrictions } from "@/config/photo-upload";
import { getAnonymousSession, isSameOrigin } from "@/server/security/anonymous-session";
import { getRateLimiter } from "@/server/security/rate-limit";
import { apiError, finalizeUploadSchema } from "@/server/uploads/contracts";
import { finalizeAwsUpload } from "@/server/uploads/aws-image-finalizer";
import { getPrivateImageStorage } from "@/server/uploads/storage";

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return apiError("FORBIDDEN", "This request could not be verified.", 403);
  const sessionId = await getAnonymousSession();
  if (!(await getRateLimiter().take(sessionId, "finalize")))
    return apiError(
      "RATE_LIMITED",
      "Too many validation attempts. Please wait a moment.",
      429,
    );
  const parsed = finalizeUploadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return apiError("BAD_REQUEST", "The photo validation details were invalid.", 400);
  const storage = getPrivateImageStorage();
  const upload = await storage.getUpload(parsed.data.uploadId).catch(() => null);
  if (
    !upload ||
    upload.sessionId !== sessionId ||
    upload.role !== parsed.data.role ||
    upload.relationship !== parsed.data.relationship
  )
    return apiError(
      "NOT_FOUND",
      "This upload expired. Please choose the photo again.",
      404,
    );
  if (upload.finalizedAsset)
    return Response.json({ ok: true, data: upload.finalizedAsset });
  if (process.env.UPLOAD_STORAGE_PROVIDER === "aws") {
    try {
      const result = await finalizeAwsUpload({
        uploadId: upload.uploadId,
        sessionId,
        relationship: parsed.data.relationship,
        role: parsed.data.role,
        clientQualityStatus: parsed.data.clientQualityStatus,
        faceBoundingBox: parsed.data.faceBoundingBox,
      });
      if (!result.ok)
        return apiError(result.error.code, result.error.message, result.error.status);
      return Response.json({ ok: true, data: result.data });
    } catch {
      return apiError(
        "STORAGE_UNAVAILABLE",
        "Photo validation is temporarily unavailable. Please try again.",
        503,
      );
    }
  }
  if (process.env.NODE_ENV === "production")
    return apiError(
      "STORAGE_UNAVAILABLE",
      "AWS photo validation is required in production.",
      503,
    );
  try {
    const { validateAndSanitizeImage } =
      await import("@/server/uploads/image-validation");
    const raw = await storage.readRaw(upload);
    const validated = await validateAndSanitizeImage(raw, parsed.data.faceBoundingBox);
    const assetId = upload.uploadId;
    const validationStatus =
      validated.reasons.length > 0
        ? ("warning-accepted" as const)
        : parsed.data.clientQualityStatus;
    await storage.saveSanitized(
      {
        assetId,
        sourceUploadId: upload.uploadId,
        sessionId,
        relationship: parsed.data.relationship,
        role: parsed.data.role,
        sanitizedPath: `uploads/${sessionId}/${upload.uploadId}.jpg`,
        width: validated.width,
        height: validated.height,
        validationStatus,
        expiresAt:
          Date.now() + photoUploadRestrictions.sanitizedUploadRetentionHours * 3_600_000,
      },
      validated.bytes,
    );
    return Response.json({
      ok: true,
      data: {
        assetId,
        role: parsed.data.role,
        validationStatus,
        width: validated.width,
        height: validated.height,
      },
    });
  } catch {
    return apiError(
      "INVALID_IMAGE",
      "The server could not safely validate this photo. Please choose another.",
      422,
    );
  } finally {
    await storage.deleteRaw(upload).catch(() => undefined);
  }
}

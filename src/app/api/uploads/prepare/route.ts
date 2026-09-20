import { getAnonymousSession, isSameOrigin } from "@/server/security/anonymous-session";
import { getRateLimiter } from "@/server/security/rate-limit";
import { apiError, prepareUploadSchema } from "@/server/uploads/contracts";
import { getPrivateImageStorage } from "@/server/uploads/storage";
import { photoUploadRestrictions } from "@/config/photo-upload";

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return apiError("FORBIDDEN", "This request could not be verified.", 403);
  const sessionId = await getAnonymousSession();
  if (!(await getRateLimiter().take(sessionId, "prepare")))
    return apiError(
      "RATE_LIMITED",
      "Too many upload attempts. Please wait a moment.",
      429,
    );
  const parsed = prepareUploadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return apiError("BAD_REQUEST", "Choose a valid photo role and try again.", 400);
  try {
    const uploadId = crypto.randomUUID();
    const createdAt = Date.now();
    const prepared = await getPrivateImageStorage().prepare(
      {
        uploadId,
        sessionId,
        relationship: parsed.data.relationship,
        role: parsed.data.role,
        rawPath: `${sessionId}/${uploadId}.jpg`,
        createdAt,
        expiresAt: createdAt + photoUploadRestrictions.rawUploadRetentionMinutes * 60_000,
      },
      request.url,
    );
    return Response.json({ ok: true, data: prepared });
  } catch {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Photo storage is temporarily unavailable. Please try again.",
      503,
    );
  }
}

import { generationApiError, generationTokenSchema } from "@/server/generation/contracts";
import {
  GenerationService,
  GenerationServiceError,
} from "@/server/generation/generation-service";
import { getAnonymousSession } from "@/server/security/anonymous-session";
import { getRateLimiter } from "@/server/security/rate-limit";
import { getPrivateImageStorage } from "@/server/uploads/storage";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobToken: string }> },
) {
  const sessionId = await getAnonymousSession();
  if (!(await getRateLimiter().take(sessionId, "generationOutput")))
    return generationApiError("FORBIDDEN", "Too many image requests.", 429);
  const { jobToken } = await context.params;
  if (!generationTokenSchema.safeParse(jobToken).success)
    return generationApiError("NOT_FOUND", "This portrait was not found.", 404);
  try {
    const job = await new GenerationService().getOwnedJob(jobToken, sessionId);
    if (job.status !== "complete" || !job.outputS3Key)
      return generationApiError("NOT_FOUND", "This portrait is not ready yet.", 404);
    const storage = getPrivateImageStorage();
    const signedUrl = await storage.createPrivateObjectUrl(job.outputS3Key, 5 * 60);
    if (signedUrl) return Response.redirect(signedUrl, 307);
    const bytes = await storage.readPrivateObject(job.outputS3Key);
    if (!bytes) return generationApiError("NOT_FOUND", "This portrait has expired.", 404);
    return new Response(bytes.slice().buffer, {
      headers: {
        "Content-Type": job.outputContentType ?? "image/png",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof GenerationServiceError)
      return generationApiError(error.code, error.message, error.httpStatus);
    return generationApiError(
      "STORAGE_UNAVAILABLE",
      "This portrait is unavailable.",
      503,
    );
  }
}

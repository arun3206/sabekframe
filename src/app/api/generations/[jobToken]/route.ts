import { generationApiError, generationTokenSchema } from "@/server/generation/contracts";
import {
  GenerationService,
  GenerationServiceError,
} from "@/server/generation/generation-service";
import { getAnonymousSession } from "@/server/security/anonymous-session";
import { getRateLimiter } from "@/server/security/rate-limit";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobToken: string }> },
) {
  const sessionId = await getAnonymousSession();
  if (!(await getRateLimiter().take(sessionId, "generationStatus")))
    return generationApiError(
      "FORBIDDEN",
      "Too many status checks. Please wait a moment.",
      429,
    );
  const { jobToken } = await context.params;
  if (!generationTokenSchema.safeParse(jobToken).success)
    return generationApiError("NOT_FOUND", "This portrait was not found.", 404);
  try {
    const job = await new GenerationService().refresh(jobToken, sessionId);
    return Response.json(
      { ok: true, data: job },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof GenerationServiceError)
      return generationApiError(error.code, error.message, error.httpStatus);
    return generationApiError(
      "PROVIDER_FAILED",
      "Portrait status is temporarily unavailable.",
      500,
    );
  }
}

import { getAnonymousSession, isSameOrigin } from "@/server/security/anonymous-session";
import { getRateLimiter } from "@/server/security/rate-limit";
import { apiError } from "@/server/uploads/contracts";
import { getPrivateImageStorage } from "@/server/uploads/storage";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ assetId: string }> },
) {
  if (!isSameOrigin(request))
    return apiError("FORBIDDEN", "This request could not be verified.", 403);
  const sessionId = await getAnonymousSession();
  if (!(await getRateLimiter().take(sessionId, "delete")))
    return apiError("RATE_LIMITED", "Too many requests. Please wait a moment.", 429);
  const { assetId } = await context.params;
  const storage = getPrivateImageStorage();
  const asset = await storage.getAsset(assetId).catch(() => null);
  if (!asset || asset.sessionId !== sessionId)
    return apiError("NOT_FOUND", "This photo was not found.", 404);
  await storage.deleteAsset(asset);
  return new Response(null, { status: 204 });
}

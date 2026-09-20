import { getAnonymousSession } from "@/server/security/anonymous-session";
import { getRateLimiter } from "@/server/security/rate-limit";
import { apiError } from "@/server/uploads/contracts";
import {
  getDevelopmentAssetBytes,
  getPrivateImageStorage,
} from "@/server/uploads/storage";

export async function GET(
  request: Request,
  context: { params: Promise<{ assetId: string }> },
) {
  const sessionId = await getAnonymousSession();
  if (!(await getRateLimiter().take(sessionId, "preview")))
    return apiError(
      "RATE_LIMITED",
      "Too many preview requests. Please wait a moment.",
      429,
    );
  const { assetId } = await context.params;
  const storage = getPrivateImageStorage();
  const asset = await storage.getAsset(assetId).catch(() => null);
  if (!asset || asset.sessionId !== sessionId || asset.expiresAt <= Date.now())
    return apiError("NOT_FOUND", "This photo has expired. Please upload it again.", 404);
  if (new URL(request.url).searchParams.get("content") === "1") {
    const bytes = getDevelopmentAssetBytes(assetId);
    if (!bytes) return apiError("NOT_FOUND", "This preview is unavailable.", 404);
    return new Response(bytes.slice().buffer, {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" },
    });
  }
  const preview = await storage.createPreview(asset);
  return Response.json(
    { ok: true, data: preview },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

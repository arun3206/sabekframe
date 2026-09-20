import { photoUploadRestrictions } from "@/config/photo-upload";
import { apiError } from "@/server/uploads/contracts";
import { getPrivateImageStorage } from "@/server/uploads/storage";

export async function PUT(
  request: Request,
  context: { params: Promise<{ uploadId: string }> },
) {
  if (process.env.NODE_ENV === "production")
    return apiError("NOT_FOUND", "Not found.", 404);
  const { uploadId } = await context.params;
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > photoUploadRestrictions.maxSourceFileSizeBytes)
    return apiError(
      "BAD_REQUEST",
      `This photo is larger than ${photoUploadRestrictions.maxSourceFileSizeMegabytes} MB.`,
      413,
    );
  try {
    await getPrivateImageStorage().putDevelopmentRaw(uploadId, token, bytes);
    return new Response(null, { status: 204 });
  } catch {
    return apiError("FORBIDDEN", "The upload token is invalid or expired.", 403);
  }
}

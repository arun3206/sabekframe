import { apiError } from "@/server/uploads/contracts";
import { getPrivateImageStorage } from "@/server/uploads/storage";

export async function POST(request: Request) {
  const secret = process.env.UPLOAD_CLEANUP_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return apiError("FORBIDDEN", "Not authorized.", 403);
  const deleted = await getPrivateImageStorage().cleanup(Date.now());
  return Response.json({ ok: true, data: { deleted } });
}

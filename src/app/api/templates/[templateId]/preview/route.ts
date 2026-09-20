import { getActivePortraitTemplate } from "@/config/portrait-templates";
import { readTemplateAsset } from "@/server/generation/template-assets";
import { getPrivateImageStorage } from "@/server/uploads/storage";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ templateId: string }> },
) {
  const { templateId } = await context.params;
  const template = getActivePortraitTemplate(templateId);
  if (!template || !template.s3Key || !template.masterFilePath || !template.contentType)
    return new Response("Not found", { status: 404 });
  try {
    const stored = await getPrivateImageStorage().readPrivateObject(template.s3Key);
    const bytes = stored ?? (await readTemplateAsset(template.masterFilePath));
    return new Response(bytes.slice().buffer, {
      headers: {
        "Content-Type": template.contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new Response("Template preview unavailable", { status: 503 });
  }
}

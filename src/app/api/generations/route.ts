import {
  createGenerationSchema,
  generationApiError,
} from "@/server/generation/contracts";
import {
  GenerationService,
  GenerationServiceError,
} from "@/server/generation/generation-service";
import { getActivePortraitTemplate } from "@/config/portrait-templates";
import { formatPrice, pricing } from "@/config/pricing";
import {
  OpenAiGenerationService,
  OpenAiGenerationServiceError,
} from "@/server/generation/openai-generation-service";
import { getAnonymousSession, isSameOrigin } from "@/server/security/anonymous-session";
import { getRateLimiter } from "@/server/security/rate-limit";
import { isPaidForGeneration } from "@/server/payments/payment-service";
import { getPrivateImageStorage } from "@/server/uploads/storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return generationApiError("FORBIDDEN", "This request could not be verified.", 403);
  const sessionId = await getAnonymousSession();
  if (!(await getRateLimiter().take(sessionId, "generate")))
    return generationApiError(
      "FORBIDDEN",
      "Too many generation attempts. Please wait a moment.",
      429,
    );
  const parsed = createGenerationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return generationApiError("BAD_REQUEST", "The generation details were invalid.", 400);
  try {
    const template = getActivePortraitTemplate(parsed.data.templateId);
    if (!template)
      return generationApiError(
        "INVALID_TEMPLATE",
        "Unknown or inactive templateId.",
        400,
      );
    const payment = await getPrivateImageStorage().getPayment(parsed.data.requestId);
    if (
      !isPaidForGeneration(payment, {
        sessionId,
        generationJobId: parsed.data.requestId,
        templateId: template.id,
      })
    )
      return generationApiError(
        "PAYMENT_REQUIRED",
        `Please complete the ${formatPrice(pricing.offer.amountMinor)} payment before generating your portrait.`,
        402,
      );
    const job =
      template.provider === "OPENAI"
        ? (template.identityMode === "RETRO_SINGLE" ||
            template.identityMode === "RETRO_COUPLE" ||
            template.identityMode === "RETRO_FAMILY") &&
          "subject" in parsed.data.photos
          ? await new OpenAiGenerationService().start({
              requestId: parsed.data.requestId,
              sessionId,
              templateId: template.id,
              subjectAssetId: parsed.data.photos.subject,
            })
          : template.identityMode === "CHILD" && "child" in parsed.data.photos
            ? await new OpenAiGenerationService().start({
                requestId: parsed.data.requestId,
                sessionId,
                templateId: template.id,
                childAssetId: parsed.data.photos.child,
              })
            : template.identityMode === "MOTHER_DAUGHTER_COMBINED" &&
                "motherDaughter" in parsed.data.photos
              ? await new OpenAiGenerationService().start({
                  requestId: parsed.data.requestId,
                  sessionId,
                  templateId: template.id,
                  motherDaughterAssetId: parsed.data.photos.motherDaughter,
                })
              : template.identityMode === "COUPLE" && "woman" in parsed.data.photos
                ? await new OpenAiGenerationService().start({
                    requestId: parsed.data.requestId,
                    sessionId,
                    templateId: template.id,
                    womanAssetId: parsed.data.photos.woman,
                    manAssetId: parsed.data.photos.man,
                  })
                : null
        : "brother" in parsed.data.photos
          ? await new GenerationService().start({
              requestId: parsed.data.requestId,
              sessionId,
              templateId: template.id,
              brotherAssetId: parsed.data.photos.brother,
              sisterAssetId: parsed.data.photos.sister,
            })
          : null;
    if (!job)
      return generationApiError(
        "INVALID_PHOTOS",
        template.provider === "OPENAI"
          ? template.identityMode === "COUPLE"
            ? "Please upload valid woman and man photos first."
            : template.identityMode === "RETRO_COUPLE"
              ? "Please upload one valid photo containing the couple first."
              : template.identityMode === "RETRO_FAMILY"
                ? "Please upload one valid photo containing the family first."
                : template.identityMode === "MOTHER_DAUGHTER_COMBINED"
                  ? "Please upload one valid photo containing the mother and daughter first."
                  : template.identityMode === "RETRO_SINGLE"
                    ? "Please upload one valid photo first."
                    : "Please upload one valid child photo first."
          : "Please upload both required photos first.",
        400,
      );
    return Response.json(
      { ok: true, data: job },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (
      error instanceof GenerationServiceError ||
      error instanceof OpenAiGenerationServiceError
    )
      return generationApiError(error.code, error.message, error.httpStatus);
    return generationApiError(
      "PROVIDER_FAILED",
      "We couldn’t start portrait generation. Please try again.",
      500,
    );
  }
}

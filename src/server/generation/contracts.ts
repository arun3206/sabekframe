import { z } from "zod";
import { portraitTemplateSchema } from "@/features/portrait-flow/validation/flow";

export const createGenerationSchema = z.object({
  requestId: z.string().uuid(),
  templateId: portraitTemplateSchema,
  photos: z.union([
    z.object({ child: z.string().uuid() }).strict(),
    z.object({ motherDaughter: z.string().uuid() }).strict(),
    z.object({ subject: z.string().uuid() }).strict(),
    z
      .object({
        woman: z.string().uuid(),
        man: z.string().uuid(),
      })
      .strict(),
    z
      .object({
        brother: z.string().uuid(),
        sister: z.string().uuid(),
      })
      .strict(),
  ]),
});

export const generationTokenSchema = z.string().uuid();

export type GenerationApiErrorCode =
  | "BAD_REQUEST"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_TEMPLATE"
  | "INVALID_PHOTOS"
  | "PAYMENT_REQUIRED"
  | "PROVIDER_NOT_CONFIGURED"
  | "PROVIDER_AUTHENTICATION_FAILED"
  | "PROVIDER_CREDITS_REQUIRED"
  | "PROVIDER_FAILED"
  | "STORAGE_UNAVAILABLE";

export function generationApiError(
  code: GenerationApiErrorCode,
  message: string,
  status: number,
) {
  return Response.json({ ok: false, error: { code, message } }, { status });
}

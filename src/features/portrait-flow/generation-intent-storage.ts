import { z } from "zod";
import type { StartGenerationInput } from "@/features/portrait-flow/generation-client";
import { portraitTemplateSchema } from "@/features/portrait-flow/validation/flow";

export const PENDING_GENERATION_STORAGE_KEY = "yaadon:generation-intent:v1";

const generationPhotosSchema = z.union([
  z.object({ childAssetId: z.string().uuid() }).strict(),
  z.object({ motherDaughterAssetId: z.string().uuid() }).strict(),
  z.object({ subjectAssetId: z.string().uuid() }).strict(),
  z
    .object({
      womanAssetId: z.string().uuid(),
      manAssetId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      brotherAssetId: z.string().uuid(),
      sisterAssetId: z.string().uuid(),
    })
    .strict(),
]);

const pendingGenerationIntentSchema = z
  .object({
    version: z.literal(1),
    requestId: z.string().uuid(),
    templateId: portraitTemplateSchema,
    photos: generationPhotosSchema,
    phase: z.enum([
      "PREPARING_PAYMENT",
      "PAYMENT_OPEN",
      "PAYMENT_VERIFICATION",
      "GENERATING",
      "FAILED",
    ]),
    autoStart: z.boolean(),
    failureKind: z.enum(["PAYMENT", "GENERATION"]).optional(),
  })
  .strict();

export type PendingGenerationIntent = z.infer<typeof pendingGenerationIntentSchema>;

interface GenerationIntentStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function readPendingGenerationIntent(
  storage: GenerationIntentStorage,
): PendingGenerationIntent | null {
  try {
    const value: unknown = JSON.parse(
      storage.getItem(PENDING_GENERATION_STORAGE_KEY) ?? "null",
    );
    const parsed = pendingGenerationIntentSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function storePendingGenerationIntent(
  storage: GenerationIntentStorage,
  intent: PendingGenerationIntent,
) {
  storage.setItem(PENDING_GENERATION_STORAGE_KEY, JSON.stringify(intent));
}

export function updatePendingGenerationIntent(
  storage: GenerationIntentStorage,
  intent: PendingGenerationIntent,
  update: Partial<Pick<PendingGenerationIntent, "phase" | "autoStart" | "failureKind">>,
) {
  const next = pendingGenerationIntentSchema.parse({ ...intent, ...update });
  storePendingGenerationIntent(storage, next);
  return next;
}

export function clearPendingGenerationIntent(storage: GenerationIntentStorage) {
  storage.removeItem(PENDING_GENERATION_STORAGE_KEY);
}

export function toStartGenerationInput(
  intent: PendingGenerationIntent,
): StartGenerationInput {
  return {
    requestId: intent.requestId,
    templateId: intent.templateId,
    ...intent.photos,
  } as StartGenerationInput;
}

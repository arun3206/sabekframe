import type { PortraitTemplate } from "@/features/portrait-flow/types";
import type { PublicGenerationJob } from "@/server/generation/types";

async function readResponse(response: Response): Promise<PublicGenerationJob> {
  const body: unknown = await response.json().catch(() => null);
  if (
    body &&
    typeof body === "object" &&
    "ok" in body &&
    body.ok === true &&
    "data" in body
  )
    return body.data as PublicGenerationJob;
  const message =
    body &&
    typeof body === "object" &&
    "error" in body &&
    body.error &&
    typeof body.error === "object" &&
    "message" in body.error &&
    typeof body.error.message === "string"
      ? body.error.message
      : "Portrait generation is temporarily unavailable. Please try again.";
  throw new Error(message);
}

export type StartGenerationInput = {
  requestId: string;
  templateId: PortraitTemplate;
} & (
  | { childAssetId: string }
  | { motherDaughterAssetId: string }
  | { subjectAssetId: string }
  | { womanAssetId: string; manAssetId: string }
  | { brotherAssetId: string; sisterAssetId: string }
);

export async function startGeneration(input: StartGenerationInput) {
  const photos =
    "childAssetId" in input
      ? { child: input.childAssetId }
      : "motherDaughterAssetId" in input
        ? { motherDaughter: input.motherDaughterAssetId }
        : "subjectAssetId" in input
          ? { subject: input.subjectAssetId }
          : "womanAssetId" in input
            ? { woman: input.womanAssetId, man: input.manAssetId }
            : { brother: input.brotherAssetId, sister: input.sisterAssetId };
  return readResponse(
    await fetch("/api/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: input.requestId,
        templateId: input.templateId,
        photos,
      }),
    }),
  );
}

export async function getGeneration(jobToken: string) {
  return readResponse(
    await fetch(`/api/generations/${encodeURIComponent(jobToken)}`, {
      cache: "no-store",
    }),
  );
}

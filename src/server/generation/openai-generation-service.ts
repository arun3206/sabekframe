import path from "node:path";
import {
  getActivePortraitTemplate,
  type OpenAiPortraitTemplateConfiguration,
} from "@/config/portrait-templates";
import { buildKrishnaPrompt } from "@/server/generation/krishna-prompt";
import {
  OpenAiImageClient,
  OpenAiImageError,
  type OpenAiImageApi,
} from "@/server/generation/openai-image-client";
import type { GenerationJobRecord, PublicGenerationJob } from "@/server/generation/types";
import type { GenerationApiErrorCode } from "@/server/generation/contracts";
import { readTemplateAsset } from "@/server/generation/template-assets";
import {
  getPrivateImageStorage,
  type AssetRecord,
  type PrivateImageStorageProvider,
} from "@/server/uploads/storage";

const GENERATION_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;

export class OpenAiGenerationServiceError extends Error {
  constructor(
    readonly code: GenerationApiErrorCode,
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = "OpenAiGenerationServiceError";
  }
}

interface BaseStartOpenAiGenerationInput {
  requestId: string;
  sessionId: string;
  templateId: string;
}

export type StartOpenAiGenerationInput = BaseStartOpenAiGenerationInput &
  (
    | { childAssetId: string }
    | { motherDaughterAssetId: string }
    | { subjectAssetId: string }
    | { womanAssetId: string; manAssetId: string }
  );

interface OpenAiGenerationServiceDependencies {
  storage?: PrivateImageStorageProvider;
  openAi?: OpenAiImageApi;
  readTemplate?: (relativePath: string) => Promise<Uint8Array>;
  now?: () => number;
}

function safeLog(event: string, details: Record<string, unknown>) {
  console.info(JSON.stringify({ scope: "openai-krishna-generation", event, ...details }));
}

function toPublicJob(job: GenerationJobRecord): PublicGenerationJob {
  return {
    jobToken: job.jobToken,
    templateId: job.templateId,
    status: job.status,
    errorMessage: job.errorMessage,
    outputUrl:
      job.status === "complete" ? `/api/generations/${job.jobToken}/output` : undefined,
  };
}

function providerFailure(error: unknown) {
  if (error instanceof OpenAiGenerationServiceError) return error;
  if (error instanceof OpenAiImageError) {
    if (error.category === "not-configured")
      return new OpenAiGenerationServiceError(
        "PROVIDER_NOT_CONFIGURED",
        "OpenAI API key is not configured.",
        503,
      );
    if (error.category === "authentication")
      return new OpenAiGenerationServiceError(
        "PROVIDER_AUTHENTICATION_FAILED",
        "The portrait service is not configured correctly. Please contact support.",
        503,
      );
    return new OpenAiGenerationServiceError(
      "PROVIDER_FAILED",
      error.category === "rate-limit"
        ? "Portrait generation is busy right now. Please try again shortly."
        : "We couldn’t generate this portrait right now. Please try again.",
      error.category === "rate-limit" ? 429 : 502,
    );
  }
  return new OpenAiGenerationServiceError(
    "STORAGE_UNAVAILABLE",
    "Portrait storage is temporarily unavailable. Please try again.",
    503,
  );
}

function imageContentType(pathname: string) {
  if (pathname.toLowerCase().endsWith(".png")) return "image/png" as const;
  if (pathname.toLowerCase().endsWith(".webp")) return "image/webp" as const;
  return "image/jpeg" as const;
}

function isSameGenerationRequest(
  existing: GenerationJobRecord | null,
  job: GenerationJobRecord,
) {
  return (
    existing?.sessionId === job.sessionId &&
    existing.templateId === job.templateId &&
    existing.childAssetId === job.childAssetId &&
    existing.womanAssetId === job.womanAssetId &&
    existing.manAssetId === job.manAssetId &&
    existing.motherDaughterAssetId === job.motherDaughterAssetId &&
    existing.subjectAssetId === job.subjectAssetId
  );
}

export class OpenAiGenerationService {
  private readonly storage: PrivateImageStorageProvider;
  private readonly openAi: OpenAiImageApi;
  private readonly readTemplate: (relativePath: string) => Promise<Uint8Array>;
  private readonly now: () => number;

  constructor(dependencies: OpenAiGenerationServiceDependencies = {}) {
    this.storage = dependencies.storage ?? getPrivateImageStorage();
    this.openAi = dependencies.openAi ?? new OpenAiImageClient();
    this.readTemplate = dependencies.readTemplate ?? readTemplateAsset;
    this.now = dependencies.now ?? Date.now;
  }

  async start(input: StartOpenAiGenerationInput): Promise<PublicGenerationJob> {
    const startedAt = this.now();
    const template = getActivePortraitTemplate(input.templateId);
    if (!template || template.provider !== "OPENAI")
      throw new OpenAiGenerationServiceError(
        "INVALID_TEMPLATE",
        "Unknown or inactive templateId.",
        400,
      );
    let generationPrompt: string;
    try {
      generationPrompt = buildKrishnaPrompt(template);
    } catch (error) {
      safeLog("template_configuration_failed", {
        templateId: template.id,
        error: error instanceof Error ? error.message : "Unknown prompt mapping error",
      });
      throw new OpenAiGenerationServiceError(
        "INVALID_TEMPLATE",
        "The selected portrait style is not configured for generation.",
        500,
      );
    }

    const usesCombinedRetroPhoto =
      template.identityMode === "RETRO_SINGLE" ||
      template.identityMode === "RETRO_COUPLE" ||
      template.identityMode === "RETRO_FAMILY";
    const identitySpecs = usesCombinedRetroPhoto
      ? "subjectAssetId" in input
        ? [
            {
              assetId: input.subjectAssetId,
              role: "first" as const,
              fallbackName:
                template.identityMode === "RETRO_COUPLE"
                  ? "couple-identity.jpg"
                  : template.identityMode === "RETRO_FAMILY"
                    ? "family-identity.jpg"
                    : "subject-identity.jpg",
            },
          ]
        : null
      : template.identityMode === "COUPLE"
        ? "womanAssetId" in input
          ? [
              {
                assetId: input.womanAssetId,
                role: "first" as const,
                fallbackName: "woman-identity.jpg",
              },
              {
                assetId: input.manAssetId,
                role: "second" as const,
                fallbackName: "man-identity.jpg",
              },
            ]
          : null
        : template.identityMode === "MOTHER_DAUGHTER_COMBINED"
          ? "motherDaughterAssetId" in input
            ? [
                {
                  assetId: input.motherDaughterAssetId,
                  role: "first" as const,
                  fallbackName: "mother-daughter-identity.jpg",
                },
              ]
            : null
          : "childAssetId" in input
            ? [
                {
                  assetId: input.childAssetId,
                  role: "first" as const,
                  fallbackName: "child.jpg",
                },
              ]
            : null;
    if (
      !identitySpecs ||
      (template.identityMode === "COUPLE" &&
        identitySpecs[0]!.assetId === identitySpecs[1]!.assetId)
    )
      throw new OpenAiGenerationServiceError(
        "INVALID_PHOTOS",
        template.identityMode === "COUPLE"
          ? "Please upload valid woman and man photos first."
          : template.identityMode === "RETRO_COUPLE"
            ? "Please upload one valid photo containing the couple first."
            : template.identityMode === "RETRO_FAMILY"
              ? "Please upload one valid photo containing the family first."
              : template.identityMode === "MOTHER_DAUGHTER_COMBINED"
                ? "Please upload one valid photo containing the mother and daughter first."
                : template.identityMode === "RETRO_SINGLE"
                  ? "Please upload one valid photo first."
                  : "Please upload one valid child photo first.",
        400,
      );
    const identityAssets = await Promise.all(
      identitySpecs.map(({ assetId }) =>
        this.storage.getAsset(assetId).catch(() => {
          throw new OpenAiGenerationServiceError(
            "STORAGE_UNAVAILABLE",
            "The uploaded identity photo could not be loaded. Please try again.",
            503,
          );
        }),
      ),
    );
    const validatedIdentityAssets = this.validateIdentityAssets(
      identityAssets,
      identitySpecs,
      input.sessionId,
      template,
    );

    const identityJobFields = usesCombinedRetroPhoto
      ? { subjectAssetId: identitySpecs[0]!.assetId }
      : template.identityMode === "COUPLE"
        ? {
            womanAssetId: identitySpecs[0]!.assetId,
            manAssetId: identitySpecs[1]!.assetId,
          }
        : template.identityMode === "MOTHER_DAUGHTER_COMBINED"
          ? { motherDaughterAssetId: identitySpecs[0]!.assetId }
          : { childAssetId: identitySpecs[0]!.assetId };

    const job: GenerationJobRecord = {
      jobId: input.requestId,
      jobToken: input.requestId,
      sessionId: input.sessionId,
      templateId: template.id,
      occasion: template.occasion,
      provider: template.provider,
      model: this.openAi.model,
      ...identityJobFields,
      status: "initializing",
      createdAt: startedAt,
      updatedAt: startedAt,
      expiresAt: startedAt + GENERATION_RETENTION_MS,
    };
    const created = await this.storage.createGenerationJob(job);
    if (!created) {
      const existing = await this.storage.getGenerationJob(job.jobId);
      if (!isSameGenerationRequest(existing, job))
        throw new OpenAiGenerationServiceError(
          "FORBIDDEN",
          "This generation request could not be verified.",
          403,
        );
      if (existing!.status !== "failed") return toPublicJob(existing!);

      const restarted = await this.storage.restartFailedGenerationJob(job);
      if (!restarted) {
        const latest = await this.storage.getGenerationJob(job.jobId);
        if (isSameGenerationRequest(latest, job)) return toPublicJob(latest!);
        throw new OpenAiGenerationServiceError(
          "FORBIDDEN",
          "This generation request could not be verified.",
          403,
        );
      }
      safeLog("generation_retry_started", {
        jobId: job.jobId,
        templateId: template.id,
        provider: template.provider,
        model: this.openAi.model,
      });
    }

    try {
      const usesTemplateImage = template.generationInputMode !== "IDENTITIES_ONLY";
      if (
        usesTemplateImage &&
        (!template.s3Key || !template.masterFilePath || !template.contentType)
      )
        throw new OpenAiGenerationServiceError(
          "INVALID_TEMPLATE",
          "The selected template is missing its generation reference.",
          500,
        );
      const templateUploaded = usesTemplateImage
        ? await this.ensureTemplate(template)
        : undefined;
      const [templateBytes, ...identityBytes] = await Promise.all([
        usesTemplateImage
          ? this.storage.readPrivateObject(template.s3Key!)
          : Promise.resolve(null),
        ...validatedIdentityAssets.map((asset) => this.storage.readSanitizedAsset(asset)),
      ]);
      if (usesTemplateImage && !templateBytes)
        throw new OpenAiGenerationServiceError(
          "STORAGE_UNAVAILABLE",
          "The selected Krishna template is unavailable.",
          503,
        );

      const processing: GenerationJobRecord = {
        ...job,
        status: "rendering",
        updatedAt: this.now(),
      };
      await this.storage.saveGenerationJob(processing);
      safeLog("generation_started", {
        jobId: job.jobId,
        templateId: template.id,
        provider: template.provider,
        model: this.openAi.model,
        identityUploadKeys: validatedIdentityAssets.map((asset) => asset.sanitizedPath),
        templateS3Key: usesTemplateImage ? template.s3Key : undefined,
        templateAssetUploaded: templateUploaded,
      });

      const result = await this.openAi.generateKrishnaImage({
        prompt: generationPrompt,
        template: templateBytes
          ? {
              bytes: templateBytes,
              filename: `template.${
                template.contentType === "image/png"
                  ? "png"
                  : template.contentType === "image/webp"
                    ? "webp"
                    : "jpeg"
              }`,
              contentType: template.contentType!,
            }
          : undefined,
        identityImages: validatedIdentityAssets.map((asset, index) => ({
          bytes: identityBytes[index]!,
          filename:
            template.identityMode !== "CHILD"
              ? identitySpecs[index]!.fallbackName
              : path.basename(asset.sanitizedPath) || identitySpecs[index]!.fallbackName,
          contentType: imageContentType(asset.sanitizedPath),
        })),
        size: template.outputSize,
        quality: template.outputQuality,
      });
      const outputS3Key = `outputs/${job.jobId}/final.png`;
      await this.storage.putPrivateObject(outputS3Key, result.bytes, result.contentType);
      const completedAt = this.now();
      const complete: GenerationJobRecord = {
        ...processing,
        status: "complete",
        model: result.model,
        outputS3Key,
        outputContentType: result.contentType,
        completedAt,
        updatedAt: completedAt,
      };
      await this.storage.saveGenerationJob(complete);
      safeLog("generation_completed", {
        jobId: job.jobId,
        templateId: template.id,
        provider: template.provider,
        model: result.model,
        openAiRequestId: result.requestId,
        outputS3Key,
        durationMs: completedAt - startedAt,
      });
      return toPublicJob(complete);
    } catch (error) {
      const failure = providerFailure(error);
      await this.storage
        .saveGenerationJob({
          ...job,
          status: "failed",
          errorMessage: failure.message,
          updatedAt: this.now(),
        })
        .catch(() => undefined);
      safeLog("generation_failed", {
        jobId: job.jobId,
        templateId: template.id,
        provider: template.provider,
        model: this.openAi.model,
        errorCategory: error instanceof OpenAiImageError ? error.category : failure.code,
        providerStatus: error instanceof OpenAiImageError ? error.status : undefined,
        providerCode: error instanceof OpenAiImageError ? error.providerCode : undefined,
        providerType: error instanceof OpenAiImageError ? error.providerType : undefined,
        openAiRequestId: error instanceof OpenAiImageError ? error.requestId : undefined,
        durationMs: this.now() - startedAt,
      });
      throw failure;
    }
  }

  private validateIdentityAssets(
    assets: readonly (AssetRecord | null)[],
    specs: readonly { role: "first" | "second" }[],
    sessionId: string,
    template: OpenAiPortraitTemplateConfiguration,
  ): readonly AssetRecord[] {
    if (
      assets.length !== specs.length ||
      assets.some(
        (asset, index) =>
          !asset ||
          asset.sessionId !== sessionId ||
          asset.role !== specs[index]!.role ||
          asset.relationship !== template.relationshipId,
      )
    )
      throw new OpenAiGenerationServiceError(
        "INVALID_PHOTOS",
        template.identityMode === "COUPLE"
          ? "Please upload valid woman and man photos first."
          : template.identityMode === "RETRO_COUPLE"
            ? "Please upload one valid photo containing the couple first."
            : template.identityMode === "RETRO_FAMILY"
              ? "Please upload one valid photo containing the family first."
              : template.identityMode === "MOTHER_DAUGHTER_COMBINED"
                ? "Please upload one valid photo containing the mother and daughter first."
                : template.identityMode === "RETRO_SINGLE"
                  ? "Please upload one valid photo first."
                  : "Please upload one valid child photo first.",
        400,
      );
    return assets as readonly AssetRecord[];
  }

  private async ensureTemplate(template: OpenAiPortraitTemplateConfiguration) {
    if (!template.s3Key || !template.masterFilePath || !template.contentType)
      throw new OpenAiGenerationServiceError(
        "INVALID_TEMPLATE",
        "The selected template is missing its generation reference.",
        500,
      );
    const existing = await this.storage.readPrivateObject(template.s3Key);
    if (existing) return false;
    const bytes = await this.readTemplate(template.masterFilePath).catch(() => {
      throw new OpenAiGenerationServiceError(
        "STORAGE_UNAVAILABLE",
        "The selected Krishna template could not be loaded.",
        503,
      );
    });
    return this.storage.putPrivateObject(template.s3Key, bytes, template.contentType, {
      ifAbsent: true,
    });
  }
}

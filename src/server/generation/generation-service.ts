import { z } from "zod";
import {
  getActivePortraitTemplate,
  type MagicHourPortraitTemplateConfiguration,
  type PortraitTemplateConfiguration,
} from "@/config/portrait-templates";
import type { GenerationApiErrorCode } from "@/server/generation/contracts";
import {
  MagicHourClient,
  MagicHourError,
  type FaceDetection,
  type MagicHourApi,
} from "@/server/generation/magic-hour-client";
import type {
  GenerationJobRecord,
  PublicGenerationJob,
  TemplateFaceMapping,
} from "@/server/generation/types";
import { readTemplateAsset } from "@/server/generation/template-assets";
import {
  getPrivateImageStorage,
  type AssetRecord,
  type PrivateImageStorageProvider,
} from "@/server/uploads/storage";

const PROVIDER_URL_LIFETIME_SECONDS = 15 * 60;
const GENERATION_TIMEOUT_MS = 5 * 60 * 1_000;
const GENERATION_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_OUTPUT_BYTES = 25 * 1_024 * 1_024;

const templateFaceMappingSchema = z.object({
  mappingVersion: z.literal(2),
  templateId: z.literal("rakhi-brother-sister-traditional-001"),
  detectedAt: z.string().datetime(),
  detectionIds: z.object({
    brother: z.string().min(1),
    sister: z.string().min(1),
  }),
  referenceS3Keys: z.object({
    brother: z.string().min(1),
    sister: z.string().min(1),
  }),
  faces: z.object({
    brother: z.object({ path: z.string().min(1) }),
    sister: z.object({ path: z.string().min(1) }),
  }),
});

export class GenerationServiceError extends Error {
  constructor(
    readonly code: GenerationApiErrorCode,
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = "GenerationServiceError";
  }
}

export interface StartGenerationInput {
  requestId: string;
  sessionId: string;
  templateId: string;
  brotherAssetId: string;
  sisterAssetId: string;
}

interface GenerationServiceDependencies {
  storage?: PrivateImageStorageProvider;
  magicHour?: MagicHourApi;
  fetcher?: typeof fetch;
  readTemplate?: (relativePath: string) => Promise<Uint8Array>;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
}

function safeLog(event: string, details: Record<string, unknown>) {
  console.info(JSON.stringify({ scope: "magic-hour-generation", event, ...details }));
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

function providerFailure(error: unknown): GenerationServiceError {
  if (error instanceof GenerationServiceError) return error;
  if (error instanceof MagicHourError) {
    if (error.message === "Magic Hour API key is not configured.")
      return new GenerationServiceError("PROVIDER_NOT_CONFIGURED", error.message, 503);
    if (error.status === 401)
      return new GenerationServiceError(
        "PROVIDER_AUTHENTICATION_FAILED",
        "The portrait service is not configured correctly. Please contact support.",
        503,
      );
    if (error.status === 402)
      return new GenerationServiceError(
        "PROVIDER_CREDITS_REQUIRED",
        "Portrait generation is temporarily unavailable because provider credits are insufficient.",
        503,
      );
  }
  return new GenerationServiceError(
    "PROVIDER_FAILED",
    "We couldn’t generate this portrait right now. Please try again.",
    502,
  );
}

function isRecoverableMappingError(error: unknown) {
  return (
    error instanceof MagicHourError &&
    error.status !== undefined &&
    [400, 404, 422].includes(error.status)
  );
}

export class GenerationService {
  private readonly storage: PrivateImageStorageProvider;
  private readonly magicHour: MagicHourApi;
  private readonly fetcher: typeof fetch;
  private readonly readTemplate: (relativePath: string) => Promise<Uint8Array>;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;

  constructor(dependencies: GenerationServiceDependencies = {}) {
    this.storage = dependencies.storage ?? getPrivateImageStorage();
    this.magicHour = dependencies.magicHour ?? new MagicHourClient();
    this.fetcher = dependencies.fetcher ?? fetch;
    this.readTemplate = dependencies.readTemplate ?? readTemplateAsset;
    this.sleep =
      dependencies.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.now = dependencies.now ?? Date.now;
  }

  async start(input: StartGenerationInput): Promise<PublicGenerationJob> {
    const startedAt = this.now();
    const template = getActivePortraitTemplate(input.templateId);
    if (!template)
      throw new GenerationServiceError(
        "INVALID_TEMPLATE",
        "Unknown or inactive templateId.",
        400,
      );
    if (template.provider !== "MAGIC_HOUR")
      throw new GenerationServiceError(
        "INVALID_TEMPLATE",
        "This template uses a different portrait provider.",
        400,
      );

    const [brother, sister] = await Promise.all([
      this.storage.getAsset(input.brotherAssetId),
      this.storage.getAsset(input.sisterAssetId),
    ]).catch(() => {
      throw new GenerationServiceError(
        "STORAGE_UNAVAILABLE",
        "The uploaded photos could not be loaded. Please try again.",
        503,
      );
    });
    this.validateAsset(brother, input.sessionId, "first", template);
    this.validateAsset(sister, input.sessionId, "second", template);

    const job: GenerationJobRecord = {
      jobId: input.requestId,
      jobToken: input.requestId,
      sessionId: input.sessionId,
      templateId: template.id,
      occasion: template.occasion,
      provider: template.provider,
      model: "magic-hour-face-swap-photo",
      brotherAssetId: input.brotherAssetId,
      sisterAssetId: input.sisterAssetId,
      status: "initializing",
      createdAt: startedAt,
      updatedAt: startedAt,
      expiresAt: startedAt + GENERATION_RETENTION_MS,
    };
    const created = await this.storage.createGenerationJob(job);
    if (!created) {
      const existing = await this.storage.getGenerationJob(job.jobId);
      const sameRequest =
        existing?.sessionId === input.sessionId &&
        existing.templateId === template.id &&
        existing.brotherAssetId === input.brotherAssetId &&
        existing.sisterAssetId === input.sisterAssetId;
      if (!sameRequest)
        throw new GenerationServiceError(
          "FORBIDDEN",
          "This generation request could not be verified.",
          403,
        );
      if (existing!.status !== "failed") return toPublicJob(existing!);

      const restarted = await this.storage.restartFailedGenerationJob(job);
      if (!restarted) {
        const latest = await this.storage.getGenerationJob(job.jobId);
        if (
          latest?.sessionId === input.sessionId &&
          latest.templateId === template.id &&
          latest.brotherAssetId === input.brotherAssetId &&
          latest.sisterAssetId === input.sisterAssetId
        )
          return toPublicJob(latest);
        throw new GenerationServiceError(
          "FORBIDDEN",
          "This generation request could not be verified.",
          403,
        );
      }
    }

    try {
      await this.ensureTemplateAssets(template);
      let { mapping, cacheHit } = await this.ensureFaceMapping(template);
      const targetFilePath = await this.requirePrivateUrl(template.s3Key);
      const [brotherUrl, sisterUrl] = await Promise.all([
        this.storage.createAssetProviderUrl(brother!, PROVIDER_URL_LIFETIME_SECONDS),
        this.storage.createAssetProviderUrl(sister!, PROVIDER_URL_LIFETIME_SECONDS),
      ]);
      let swap;
      try {
        swap = await this.createFaceSwap(
          job,
          targetFilePath,
          mapping,
          brotherUrl,
          sisterUrl,
        );
      } catch (error) {
        if (!cacheHit || !isRecoverableMappingError(error)) throw error;
        await this.storage.deletePrivateObject(template.faceMappingS3Key);
        ({ mapping, cacheHit } = await this.ensureFaceMapping(template));
        swap = await this.createFaceSwap(
          job,
          targetFilePath,
          mapping,
          brotherUrl,
          sisterUrl,
        );
      }
      const queued: GenerationJobRecord = {
        ...job,
        status: "queued",
        magicHourProjectId: swap.id,
        creditsCharged: swap.creditsCharged,
        updatedAt: this.now(),
      };
      await this.storage.saveGenerationJob(queued);
      safeLog("face_swap_created", {
        generationJobId: job.jobId,
        templateId: template.id,
        magicHourProjectId: swap.id,
        creditsCharged: swap.creditsCharged,
        processingDurationMs: this.now() - startedAt,
      });
      return toPublicJob(queued);
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
      throw failure;
    }
  }

  async refresh(jobToken: string, sessionId: string): Promise<PublicGenerationJob> {
    const job = await this.requireOwnedJob(jobToken, sessionId);
    if (job.status === "complete" || job.status === "failed") return toPublicJob(job);
    if (!job.magicHourProjectId) return toPublicJob(job);
    if (this.now() - job.createdAt > GENERATION_TIMEOUT_MS) {
      const failed = await this.failJob(
        job,
        "Portrait generation timed out. Please retry.",
      );
      return toPublicJob(failed);
    }
    try {
      const project = await this.magicHour.getImageProject(job.magicHourProjectId);
      safeLog("image_project_status", {
        generationJobId: job.jobId,
        templateId: job.templateId,
        magicHourProjectId: job.magicHourProjectId,
        magicHourStatus: project.status,
        creditsCharged: project.credits_charged,
      });
      if (project.status === "queued" || project.status === "rendering") {
        const updated = {
          ...job,
          status: project.status,
          creditsCharged: project.credits_charged,
          updatedAt: this.now(),
        } satisfies GenerationJobRecord;
        await this.storage.saveGenerationJob(updated);
        return toPublicJob(updated);
      }
      if (project.status === "error" || project.status === "canceled") {
        const failed = await this.failJob(
          job,
          project.status === "canceled"
            ? "Portrait generation was canceled. Please retry."
            : "Portrait generation failed. Please try again.",
        );
        return toPublicJob(failed);
      }
      if (project.status !== "complete") return toPublicJob(job);
      const download = project.downloads[0];
      if (!download)
        throw new GenerationServiceError(
          "PROVIDER_FAILED",
          "The generated portrait was unavailable. Please retry.",
          502,
        );
      const output = await this.downloadOutput(download.url);
      const outputS3Key = `outputs/${job.jobId}/final.${output.extension}`;
      await this.storage.putPrivateObject(outputS3Key, output.bytes, output.contentType);
      const complete: GenerationJobRecord = {
        ...job,
        status: "complete",
        creditsCharged: project.credits_charged,
        outputS3Key,
        outputContentType: output.contentType,
        updatedAt: this.now(),
      };
      await this.storage.saveGenerationJob(complete);
      safeLog("output_stored", {
        generationJobId: job.jobId,
        templateId: job.templateId,
        magicHourProjectId: job.magicHourProjectId,
        outputS3Key,
        processingDurationMs: this.now() - job.createdAt,
      });
      return toPublicJob(complete);
    } catch (error) {
      const failure = providerFailure(error);
      await this.failJob(job, failure.message).catch(() => undefined);
      throw failure;
    }
  }

  async getOwnedJob(jobToken: string, sessionId: string) {
    return this.requireOwnedJob(jobToken, sessionId);
  }

  private validateAsset(
    asset: AssetRecord | null,
    sessionId: string,
    role: "first" | "second",
    template: PortraitTemplateConfiguration,
  ): asserts asset is AssetRecord {
    if (
      !asset ||
      asset.sessionId !== sessionId ||
      asset.role !== role ||
      asset.relationship !== template.relationshipId
    )
      throw new GenerationServiceError(
        "INVALID_PHOTOS",
        "Both Brother and Sister photos must be uploaded successfully first.",
        400,
      );
  }

  private async ensureTemplateAssets(template: MagicHourPortraitTemplateConfiguration) {
    await Promise.all([
      this.ensurePrivateAsset(
        template.masterFilePath,
        template.s3Key,
        template.contentType,
      ),
      this.ensurePrivateAsset(
        template.referenceFaces.brother.masterFilePath,
        template.referenceFaces.brother.s3Key,
        template.referenceFaces.brother.contentType,
      ),
      this.ensurePrivateAsset(
        template.referenceFaces.sister.masterFilePath,
        template.referenceFaces.sister.s3Key,
        template.referenceFaces.sister.contentType,
      ),
    ]);
  }

  private async ensurePrivateAsset(
    masterFilePath: string,
    s3Key: string,
    contentType: string,
  ) {
    if (await this.storage.privateObjectExists(s3Key)) return;
    const bytes = await this.readTemplate(masterFilePath).catch(() => {
      throw new GenerationServiceError(
        "STORAGE_UNAVAILABLE",
        "A portrait template asset could not be loaded.",
        503,
      );
    });
    const uploaded = await this.storage.putPrivateObject(s3Key, bytes, contentType, {
      ifAbsent: true,
    });
    safeLog("template_asset_initialized", {
      templateS3Key: s3Key,
      uploaded,
    });
  }

  private async ensureFaceMapping(
    template: MagicHourPortraitTemplateConfiguration,
  ): Promise<{
    mapping: TemplateFaceMapping;
    cacheHit: boolean;
  }> {
    const cachedBytes = await this.storage.readPrivateObject(template.faceMappingS3Key);
    if (cachedBytes) {
      let cached: ReturnType<typeof templateFaceMappingSchema.safeParse> | null = null;
      try {
        cached = templateFaceMappingSchema.safeParse(
          JSON.parse(new TextDecoder().decode(cachedBytes)),
        );
      } catch {
        // Invalid cache data is removed and regenerated below.
      }
      if (
        cached?.success &&
        cached.data.referenceS3Keys.brother === template.referenceFaces.brother.s3Key &&
        cached.data.referenceS3Keys.sister === template.referenceFaces.sister.s3Key
      ) {
        safeLog("face_mapping_loaded", {
          templateId: template.id,
          mappingCacheHit: true,
          brotherFaceDetectionId: cached.data.detectionIds.brother,
          sisterFaceDetectionId: cached.data.detectionIds.sister,
          brotherFacePath: cached.data.faces.brother.path,
          sisterFacePath: cached.data.faces.sister.path,
        });
        return { mapping: cached.data, cacheHit: true };
      }
      await this.storage.deletePrivateObject(template.faceMappingS3Key);
    }
    const [brotherReferenceUrl, sisterReferenceUrl] = await Promise.all([
      this.requirePrivateUrl(template.referenceFaces.brother.s3Key),
      this.requirePrivateUrl(template.referenceFaces.sister.s3Key),
    ]);
    const [brotherDetectionTask, sisterDetectionTask] = await Promise.all([
      this.magicHour.detectFaces(brotherReferenceUrl),
      this.magicHour.detectFaces(sisterReferenceUrl),
    ]);
    const [brotherDetection, sisterDetection] = await Promise.all([
      this.pollFaceDetection(brotherDetectionTask.id),
      this.pollFaceDetection(sisterDetectionTask.id),
    ]);
    if (brotherDetection.faces.length !== 1 || sisterDetection.faces.length !== 1)
      throw new GenerationServiceError(
        "PROVIDER_FAILED",
        "Each prepared template reference must contain exactly one detectable face.",
        422,
      );
    const brother = brotherDetection.faces[0]!;
    const sister = sisterDetection.faces[0]!;
    const mapping: TemplateFaceMapping = {
      mappingVersion: 2,
      templateId: template.id,
      detectedAt: new Date(this.now()).toISOString(),
      detectionIds: {
        brother: brotherDetection.id,
        sister: sisterDetection.id,
      },
      referenceS3Keys: {
        brother: template.referenceFaces.brother.s3Key,
        sister: template.referenceFaces.sister.s3Key,
      },
      faces: {
        brother: { path: brother.path },
        sister: { path: sister.path },
      },
    };
    await this.storage.putPrivateObject(
      template.faceMappingS3Key,
      new TextEncoder().encode(JSON.stringify(mapping, null, 2)),
      "application/json",
    );
    safeLog("face_mapping_created", {
      templateId: template.id,
      mappingCacheHit: false,
      brotherFaceDetectionId: brotherDetection.id,
      sisterFaceDetectionId: sisterDetection.id,
      brotherFacePath: brother.path,
      sisterFacePath: sister.path,
    });
    return { mapping, cacheHit: false };
  }

  private async pollFaceDetection(id: string): Promise<FaceDetection> {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (attempt > 0) await this.sleep(Math.min(1_000 + attempt * 250, 3_000));
      const detection = await this.magicHour.getFaceDetection(id);
      if (detection.status === "complete") return detection;
      if (detection.status === "error")
        throw new GenerationServiceError(
          "PROVIDER_FAILED",
          "Magic Hour could not detect the template faces.",
          502,
        );
    }
    throw new GenerationServiceError(
      "PROVIDER_FAILED",
      "Magic Hour face detection timed out.",
      504,
    );
  }

  private createFaceSwap(
    job: GenerationJobRecord,
    targetFilePath: string,
    mapping: TemplateFaceMapping,
    brotherUrl: string,
    sisterUrl: string,
  ) {
    return this.magicHour.createFaceSwap({
      name: `${job.templateId}-${job.jobId}`,
      targetFilePath,
      faceMappings: [
        { originalFace: mapping.faces.brother.path, newFace: brotherUrl },
        { originalFace: mapping.faces.sister.path, newFace: sisterUrl },
      ],
    });
  }

  private async requirePrivateUrl(key: string) {
    const url = await this.storage.createPrivateObjectUrl(
      key,
      PROVIDER_URL_LIFETIME_SECONDS,
    );
    if (!url)
      throw new GenerationServiceError(
        "STORAGE_UNAVAILABLE",
        "Magic Hour generation requires configured AWS storage.",
        503,
      );
    const parsed = new URL(url);
    if (parsed.protocol !== "https:")
      throw new GenerationServiceError(
        "STORAGE_UNAVAILABLE",
        "The private template URL must use HTTPS.",
        503,
      );
    return url;
  }

  private async requireOwnedJob(jobToken: string, sessionId: string) {
    const job = await this.storage.getGenerationJob(jobToken);
    if (!job || job.sessionId !== sessionId)
      throw new GenerationServiceError(
        "NOT_FOUND",
        "This portrait generation was not found.",
        404,
      );
    return job;
  }

  private async failJob(job: GenerationJobRecord, errorMessage: string) {
    const failed: GenerationJobRecord = {
      ...job,
      status: "failed",
      errorMessage,
      updatedAt: this.now(),
    };
    await this.storage.saveGenerationJob(failed);
    return failed;
  }

  private async downloadOutput(url: string) {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "https:")
      throw new GenerationServiceError(
        "PROVIDER_FAILED",
        "Magic Hour returned an invalid output URL.",
        502,
      );
    const response = await this.fetcher(url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok)
      throw new GenerationServiceError(
        "PROVIDER_FAILED",
        "The generated portrait could not be downloaded.",
        502,
      );
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_OUTPUT_BYTES)
      throw new GenerationServiceError(
        "PROVIDER_FAILED",
        "The generated portrait exceeded the safe size limit.",
        502,
      );
    const normalizedType =
      (response.headers.get("content-type") ?? "image/png")
        .split(";")[0]
        ?.trim()
        .toLowerCase() ?? "";
    const formats: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
    };
    const extension = formats[normalizedType];
    if (!extension)
      throw new GenerationServiceError(
        "PROVIDER_FAILED",
        "Magic Hour returned an unsupported image format.",
        502,
      );
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_OUTPUT_BYTES)
      throw new GenerationServiceError(
        "PROVIDER_FAILED",
        "The generated portrait file was invalid.",
        502,
      );
    return { bytes, contentType: normalizedType, extension };
  }
}

import { z } from "zod";
import { resolveProviderApiKey } from "@/server/secrets/provider-api-keys";

const createTaskSchema = z.object({
  id: z.string().min(1),
  credits_charged: z.number().int().nonnegative(),
});

const faceDetectionSchema = z.object({
  id: z.string().min(1),
  credits_charged: z.number().int().nonnegative(),
  status: z.enum(["queued", "rendering", "complete", "error"]),
  faces: z.array(
    z.object({
      path: z.string().min(1),
      url: z.string().url().optional(),
    }),
  ),
});

const imageProjectSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["draft", "queued", "rendering", "complete", "error", "canceled"]),
  credits_charged: z.number().int().nonnegative(),
  downloads: z.array(
    z.object({
      url: z.string().url(),
      expires_at: z.string(),
    }),
  ),
  error: z.unknown().nullable().optional(),
});

export type FaceDetection = z.infer<typeof faceDetectionSchema>;
export type ImageProject = z.infer<typeof imageProjectSchema>;

export interface FaceMappingInput {
  originalFace: string;
  newFace: string;
}

export class MagicHourError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "MagicHourError";
  }
}

export interface MagicHourApi {
  detectFaces(targetFilePath: string): Promise<{ id: string; creditsCharged: number }>;
  getFaceDetection(id: string): Promise<FaceDetection>;
  createFaceSwap(input: {
    name: string;
    targetFilePath: string;
    faceMappings: readonly [FaceMappingInput, FaceMappingInput];
  }): Promise<{ id: string; creditsCharged: number }>;
  getImageProject(id: string): Promise<ImageProject>;
}

interface MagicHourClientOptions {
  apiKey?: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
}

export class MagicHourClient implements MagicHourApi {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(options: MagicHourClientOptions = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = (
      options.baseUrl ??
      process.env.MAGIC_HOUR_BASE_URL ??
      "https://api.magichour.ai"
    ).replace(/\/$/, "");
    this.fetcher = options.fetcher ?? fetch;
  }

  private async request(path: string, init?: RequestInit): Promise<unknown> {
    const apiKey = await resolveProviderApiKey("MAGIC_HOUR_API_KEY", this.apiKey);
    if (!apiKey) throw new MagicHourError("Magic Hour API key is not configured.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
          ...init?.headers,
        },
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const safeMessage =
          response.status === 401
            ? "Magic Hour authentication failed."
            : response.status === 402
              ? "Magic Hour credits or billing are insufficient."
              : "Magic Hour could not process the request.";
        throw new MagicHourError(safeMessage, response.status);
      }
      return body;
    } catch (error) {
      if (error instanceof MagicHourError) throw error;
      if ((error as Error).name === "AbortError")
        throw new MagicHourError("Magic Hour request timed out.");
      throw new MagicHourError("Magic Hour is temporarily unavailable.");
    } finally {
      clearTimeout(timeout);
    }
  }

  async detectFaces(targetFilePath: string) {
    const result = createTaskSchema.parse(
      await this.request("/v1/face-detection", {
        method: "POST",
        body: JSON.stringify({
          confidence_score: 0.5,
          assets: { target_file_path: targetFilePath },
        }),
      }),
    );
    return { id: result.id, creditsCharged: result.credits_charged };
  }

  async getFaceDetection(id: string) {
    return faceDetectionSchema.parse(
      await this.request(`/v1/face-detection/${encodeURIComponent(id)}`),
    );
  }

  async createFaceSwap(input: {
    name: string;
    targetFilePath: string;
    faceMappings: readonly [FaceMappingInput, FaceMappingInput];
  }) {
    const result = createTaskSchema.parse(
      await this.request("/v1/face-swap-photo", {
        method: "POST",
        body: JSON.stringify({
          name: input.name,
          assets: {
            face_swap_mode: "individual-faces",
            target_file_path: input.targetFilePath,
            face_mappings: input.faceMappings.map((mapping) => ({
              original_face: mapping.originalFace,
              new_face: mapping.newFace,
            })),
          },
        }),
      }),
    );
    return { id: result.id, creditsCharged: result.credits_charged };
  }

  async getImageProject(id: string) {
    return imageProjectSchema.parse(
      await this.request(`/v1/image-projects/${encodeURIComponent(id)}`),
    );
  }
}

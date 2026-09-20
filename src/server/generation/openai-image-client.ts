import { z } from "zod";
import { resolveProviderApiKey } from "@/server/secrets/provider-api-keys";

const openAiImageResponseSchema = z.object({
  data: z
    .array(
      z.object({
        b64_json: z.string().min(1),
      }),
    )
    .min(1),
});

const openAiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string().max(100).nullable().optional(),
    type: z.string().max(100).optional(),
  }),
});

export interface OpenAiImageInput {
  bytes: Uint8Array;
  filename: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
}

export interface OpenAiImageEditInput {
  prompt: string;
  template?: OpenAiImageInput;
  identityImages: readonly OpenAiImageInput[];
  size: "1024x1536";
  quality: "medium" | "high";
}

export interface OpenAiImageResult {
  bytes: Uint8Array;
  contentType: "image/png";
  model: string;
  requestId?: string;
}

export interface OpenAiImageApi {
  readonly model: string;
  generateKrishnaImage(input: OpenAiImageEditInput): Promise<OpenAiImageResult>;
}

export class OpenAiImageError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly category:
      | "not-configured"
      | "authentication"
      | "rate-limit"
      | "provider"
      | "invalid-response" = "provider",
    readonly providerCode?: string,
    readonly providerType?: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "OpenAiImageError";
  }
}

interface OpenAiImageClientOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
}

const MAX_GENERATED_IMAGE_BYTES = 25 * 1_024 * 1_024;

function imageBlob(input: OpenAiImageInput) {
  return new Blob([input.bytes.slice().buffer], { type: input.contentType });
}

export class OpenAiImageClient implements OpenAiImageApi {
  readonly model: string;
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(options: OpenAiImageClientOptions = {}) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2";
    this.baseUrl = (options.baseUrl ?? "https://api.openai.com").replace(/\/$/, "");
    this.fetcher = options.fetcher ?? fetch;
  }

  async generateKrishnaImage(input: OpenAiImageEditInput): Promise<OpenAiImageResult> {
    const apiKey = await resolveProviderApiKey("OPENAI_API_KEY", this.apiKey);
    if (!apiKey)
      throw new OpenAiImageError(
        "OpenAI API key is not configured.",
        undefined,
        "not-configured",
      );

    const body = new FormData();
    body.append("model", this.model);
    body.append("prompt", input.prompt);
    if (input.template)
      body.append("image[]", imageBlob(input.template), input.template.filename);
    for (const identityImage of input.identityImages)
      body.append("image[]", imageBlob(identityImage), identityImage.filename);
    body.append("n", "1");
    body.append("size", input.size);
    body.append("quality", input.quality);
    body.append("output_format", "png");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);
    try {
      const response = await this.fetcher(`${this.baseUrl}/v1/images/edits`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body,
        signal: controller.signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const providerError = openAiErrorResponseSchema.safeParse(payload);
        const providerCode = providerError.success
          ? (providerError.data.error.code ?? undefined)
          : undefined;
        const providerType = providerError.success
          ? providerError.data.error.type
          : undefined;
        const requestId = response.headers.get("x-request-id") ?? undefined;
        if (response.status === 401)
          throw new OpenAiImageError(
            "OpenAI authentication failed.",
            response.status,
            "authentication",
            providerCode,
            providerType,
            requestId,
          );
        if (response.status === 429)
          throw new OpenAiImageError(
            "OpenAI image generation is temporarily rate limited.",
            response.status,
            "rate-limit",
            providerCode,
            providerType,
            requestId,
          );
        throw new OpenAiImageError(
          "OpenAI could not generate this portrait.",
          response.status,
          "provider",
          providerCode,
          providerType,
          requestId,
        );
      }

      const parsed = openAiImageResponseSchema.safeParse(payload);
      if (!parsed.success)
        throw new OpenAiImageError(
          "OpenAI returned an invalid image response.",
          response.status,
          "invalid-response",
        );
      const bytes = new Uint8Array(Buffer.from(parsed.data.data[0]!.b64_json, "base64"));
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_GENERATED_IMAGE_BYTES)
        throw new OpenAiImageError(
          "OpenAI returned an invalid image response.",
          response.status,
          "invalid-response",
        );
      return {
        bytes,
        contentType: "image/png",
        model: this.model,
        requestId: response.headers.get("x-request-id") ?? undefined,
      };
    } catch (error) {
      if (error instanceof OpenAiImageError) throw error;
      if ((error as Error).name === "AbortError")
        throw new OpenAiImageError(
          "OpenAI image generation timed out.",
          undefined,
          "provider",
        );
      throw new OpenAiImageError(
        "OpenAI image generation is temporarily unavailable.",
        undefined,
        "provider",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

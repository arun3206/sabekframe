import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSelectablePortraitTemplates,
  janmashtamiLittleKrishnaTemplate,
  janmashtamiKrishnaMakhanTemplate,
  janmashtamiMotherDaughterRadhaTemplate,
  janmashtamiRadhaKrishnaCoupleTemplate,
  janmashtamiWishFluteTemplate,
  janmashtamiWishPortraitTemplate,
} from "@/config/portrait-templates";
import {
  OpenAiGenerationService,
  OpenAiGenerationServiceError,
} from "@/server/generation/openai-generation-service";
import {
  OpenAiImageClient,
  OpenAiImageError,
  type OpenAiImageApi,
} from "@/server/generation/openai-image-client";
import type { AssetRecord } from "@/server/uploads/storage";
import { InMemoryStorage } from "@/server/uploads/storage";

class TestOpenAi implements OpenAiImageApi {
  readonly model = "gpt-image-2";
  generateKrishnaImage = vi.fn<OpenAiImageApi["generateKrishnaImage"]>(async () => ({
    bytes: new Uint8Array([8, 6, 7, 5, 3, 0, 9]),
    contentType: "image/png",
    model: this.model,
    requestId: "req_test_krishna",
  }));
}

const sessionId = "a6ef41b0-ac1e-48ca-a048-c09af0526ef1";

function childAsset(): AssetRecord {
  const assetId = crypto.randomUUID();
  return {
    assetId,
    sourceUploadId: assetId,
    sessionId,
    relationship: "janmashtami-child",
    role: "first",
    sanitizedPath: `uploads/${sessionId}/${assetId}.jpg`,
    validationStatus: "pass",
    width: 1000,
    height: 1400,
    expiresAt: Date.now() + 60_000,
  };
}

function coupleAsset(role: "first" | "second"): AssetRecord {
  const assetId = crypto.randomUUID();
  return {
    assetId,
    sourceUploadId: assetId,
    sessionId,
    relationship: "radha-krishna-couple",
    role,
    sanitizedPath: `uploads/${sessionId}/${assetId}.jpg`,
    validationStatus: "pass",
    width: 1000,
    height: 1400,
    expiresAt: Date.now() + 60_000,
  };
}

function motherDaughterAsset(): AssetRecord {
  const assetId = crypto.randomUUID();
  return {
    assetId,
    sourceUploadId: assetId,
    sessionId,
    relationship: "mother-child",
    role: "first",
    sanitizedPath: `uploads/${sessionId}/${assetId}.jpg`,
    validationStatus: "pass",
    width: 1000,
    height: 1400,
    expiresAt: Date.now() + 60_000,
  };
}

describe("OpenAI Janmashtami Krishna generation", () => {
  let storage: InMemoryStorage;
  let openAi: TestOpenAi;
  let child: AssetRecord;
  let woman: AssetRecord;
  let man: AssetRecord;
  let motherDaughter: AssetRecord;
  let service: OpenAiGenerationService;

  beforeEach(async () => {
    storage = new InMemoryStorage();
    await storage.deletePrivateObject(janmashtamiKrishnaMakhanTemplate.s3Key);
    openAi = new TestOpenAi();
    child = childAsset();
    woman = coupleAsset("first");
    man = coupleAsset("second");
    motherDaughter = motherDaughterAsset();
    await storage.saveSanitized(child, new Uint8Array([1, 2, 3, 4]));
    await storage.saveSanitized(woman, new Uint8Array([5, 6, 7, 8]));
    await storage.saveSanitized(man, new Uint8Array([9, 10, 11, 12]));
    await storage.saveSanitized(motherDaughter, new Uint8Array([13, 14, 15, 16]));
    service = new OpenAiGenerationService({
      storage,
      openAi,
      readTemplate: async () => new Uint8Array([9, 9, 9]),
    });
  });

  function start(
    overrides: Partial<{
      templateId: string;
      childAssetId: string;
      womanAssetId: string;
      manAssetId: string;
      motherDaughterAssetId: string;
    }> = {},
  ) {
    const templateId = overrides.templateId ?? janmashtamiKrishnaMakhanTemplate.id;
    const base = { requestId: crypto.randomUUID(), sessionId, templateId };
    return templateId === janmashtamiRadhaKrishnaCoupleTemplate.id
      ? service.start({
          ...base,
          womanAssetId: overrides.womanAssetId ?? woman.assetId,
          manAssetId: overrides.manAssetId ?? man.assetId,
        })
      : templateId === janmashtamiMotherDaughterRadhaTemplate.id
        ? service.start({
            ...base,
            motherDaughterAssetId:
              overrides.motherDaughterAssetId ?? motherDaughter.assetId,
          })
        : service.start({
            ...base,
            childAssetId: overrides.childAssetId ?? child.assetId,
          });
  }

  it("returns the active Krishna template for the Janmashtami experience", () => {
    expect(
      getSelectablePortraitTemplates()
        .filter((template) => template.category !== "RETRO")
        .map((template) => template.id),
    ).toEqual([
      "janmashtami-little-krishna-001",
      "janmashtami-radha-krishna-couple-001",
      "janmashtami-wish-flute-001",
      "janmashtami-wish-portrait-001",
      "janmashtami-mother-daughter-radha-001",
    ]);
  });

  it.each([
    janmashtamiRadhaKrishnaCoupleTemplate,
    janmashtamiLittleKrishnaTemplate,
    janmashtamiWishFluteTemplate,
    janmashtamiWishPortraitTemplate,
  ])(
    "keeps $name preview separate from its private generation reference",
    async (template) => {
      const readTemplate = vi.fn(async () => new Uint8Array([9, 9, 9]));
      service = new OpenAiGenerationService({ storage, openAi, readTemplate });
      await start({ templateId: template.id });

      expect(template.previewImage).toMatch(/^\/templates\/.+-v1\.webp$/);
      expect(template.masterFilePath).not.toBe(template.previewImage);
      expect(readTemplate).toHaveBeenCalledWith(template.masterFilePath);
      expect(openAi.generateKrishnaImage.mock.calls[0]?.[0].template).toMatchObject({
        bytes: new Uint8Array([9, 9, 9]),
        filename: "template.webp",
        contentType: "image/webp",
      });
      expect(await storage.readPrivateObject(template.s3Key)).toEqual(
        new Uint8Array([9, 9, 9]),
      );
    },
  );

  it("rejects an unknown template", async () => {
    await expect(start({ templateId: "unknown-template" })).rejects.toMatchObject({
      code: "INVALID_TEMPLATE",
      message: "Unknown or inactive templateId.",
    });
    expect(openAi.generateKrishnaImage).not.toHaveBeenCalled();
  });

  it("rejects a missing child image", async () => {
    await expect(start({ childAssetId: crypto.randomUUID() })).rejects.toMatchObject({
      code: "INVALID_PHOTOS",
      message: "Please upload one valid child photo first.",
    });
    expect(openAi.generateKrishnaImage).not.toHaveBeenCalled();
  });

  it("calls OpenAI with the template first and child identity second", async () => {
    await start();
    expect(openAi.generateKrishnaImage).toHaveBeenCalledOnce();
    expect(openAi.generateKrishnaImage.mock.calls[0]?.[0]).toMatchObject({
      template: {
        bytes: new Uint8Array([9, 9, 9]),
        filename: "template.png",
        contentType: "image/png",
      },
      identityImages: [
        {
          bytes: new Uint8Array([1, 2, 3, 4]),
          contentType: "image/jpeg",
        },
      ],
      size: "1024x1536",
      quality: "medium",
    });
  });

  it("initializes a missing template without requiring an S3 existence check", async () => {
    const exists = vi.spyOn(storage, "privateObjectExists").mockRejectedValue(
      Object.assign(new Error("S3 request failed with status 403"), {
        $metadata: { httpStatusCode: 403 },
      }),
    );

    await start();

    expect(exists).not.toHaveBeenCalled();
    expect(
      await storage.readPrivateObject(janmashtamiKrishnaMakhanTemplate.s3Key),
    ).toEqual(new Uint8Array([9, 9, 9]));
  });

  it("uses an existing private S3 template without reading the Worker filesystem", async () => {
    const privateTemplate = new Uint8Array([7, 7, 7]);
    await storage.putPrivateObject(
      janmashtamiKrishnaMakhanTemplate.s3Key,
      privateTemplate,
      "image/png",
    );
    const readTemplate = vi.fn(async () => {
      throw new Error("Worker filesystem is unavailable");
    });
    service = new OpenAiGenerationService({ storage, openAi, readTemplate });

    await start();

    expect(readTemplate).not.toHaveBeenCalled();
    expect(openAi.generateKrishnaImage.mock.calls[0]?.[0].template?.bytes).toEqual(
      privateTemplate,
    );
  });

  it.each([
    janmashtamiLittleKrishnaTemplate,
    janmashtamiWishFluteTemplate,
    janmashtamiWishPortraitTemplate,
  ])("builds an identity-preserving, one-child prompt for $name", async (template) => {
    await start({ templateId: template.id });
    const prompt = openAi.generateKrishnaImage.mock.calls[0]?.[0].prompt ?? "";
    expect(prompt).toContain("Image A is the Krishna template");
    expect(prompt).toContain("Image B is the child identity reference");
    expect(prompt).toContain("Preserve the child's recognizable facial identity");
    expect(prompt).toContain("Keep the child's face naturally integrated");
  });

  it("maps woman and man photos separately for the Radha Krishna couple", async () => {
    const job = await start({ templateId: janmashtamiRadhaKrishnaCoupleTemplate.id });
    const input = openAi.generateKrishnaImage.mock.calls[0]?.[0];

    expect(input?.identityImages).toEqual([
      expect.objectContaining({
        bytes: new Uint8Array([5, 6, 7, 8]),
        filename: "woman-identity.jpg",
      }),
      expect.objectContaining({
        bytes: new Uint8Array([9, 10, 11, 12]),
        filename: "man-identity.jpg",
      }),
    ]);
    expect(input?.quality).toBe("medium");
    expect(input?.prompt).toContain("Image B (filename woman-identity.jpg)");
    expect(input?.prompt).toContain("Image C (filename man-identity.jpg)");
    expect(input?.prompt).toContain(
      "The two faces in Image A are disposable placeholders",
    );
    expect(input?.prompt).toContain("Identity accuracy is more important");
    expect(input?.prompt).toContain("Do not beautify, idealize, genericize");
    expect(await storage.getGenerationJob(job.jobToken)).toMatchObject({
      womanAssetId: woman.assetId,
      manAssetId: man.assetId,
    });
  });

  it("uses one combined photo while preserving mother and daughter independently", async () => {
    const readTemplate = vi.fn(async () => new Uint8Array([9, 9, 9]));
    service = new OpenAiGenerationService({ storage, openAi, readTemplate });
    const job = await start({
      templateId: janmashtamiMotherDaughterRadhaTemplate.id,
    });
    const input = openAi.generateKrishnaImage.mock.calls[0]?.[0];

    expect(readTemplate).not.toHaveBeenCalled();
    expect(input?.template).toBeUndefined();
    expect(input?.identityImages).toEqual([
      expect.objectContaining({
        bytes: new Uint8Array([13, 14, 15, 16]),
        filename: "mother-daughter-identity.jpg",
      }),
    ]);
    expect(input?.prompt).toContain("Use the single input photograph");
    expect(input?.prompt).toContain(
      "traditional Radha-inspired mother-and-daughter portrait",
    );
    expect(input?.prompt).toContain(
      "Preserve both supplied faces as separate, recognizable identities",
    );
    expect(input?.prompt).toContain("Do not blend, swap, average");
    expect(input?.prompt).toContain("Show exactly two people only");
    expect(input?.prompt).not.toContain("Image A");
    expect(input?.prompt).not.toContain("Image B");
    expect(await storage.getGenerationJob(job.jobToken)).toMatchObject({
      motherDaughterAssetId: motherDaughter.assetId,
    });
  });

  it("rejects using the same uploaded asset for both people in the couple", async () => {
    await expect(
      start({
        templateId: janmashtamiRadhaKrishnaCoupleTemplate.id,
        womanAssetId: woman.assetId,
        manAssetId: woman.assetId,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_PHOTOS",
      message: "Please upload valid woman and man photos first.",
    });
    expect(openAi.generateKrishnaImage).not.toHaveBeenCalled();
  });

  it("uploads the successful provider result to private output storage", async () => {
    const job = await start();
    expect(await storage.readPrivateObject(`outputs/${job.jobToken}/final.png`)).toEqual(
      new Uint8Array([8, 6, 7, 5, 3, 0, 9]),
    );
  });

  it("marks the job complete after storing the output", async () => {
    const job = await start();
    expect(job.status).toBe("complete");
    expect(await storage.getGenerationJob(job.jobToken)).toMatchObject({
      provider: "OPENAI",
      model: "gpt-image-2",
      occasion: "JANMASHTAMI",
      status: "complete",
      outputS3Key: `outputs/${job.jobToken}/final.png`,
    });
  });

  it("marks the job failed when OpenAI fails", async () => {
    openAi.generateKrishnaImage.mockRejectedValueOnce(
      new OpenAiImageError("Provider failed", 500, "provider"),
    );
    const requestId = crypto.randomUUID();
    await expect(
      service.start({
        requestId,
        sessionId,
        templateId: janmashtamiKrishnaMakhanTemplate.id,
        childAssetId: child.assetId,
      }),
    ).rejects.toBeInstanceOf(OpenAiGenerationServiceError);
    expect(await storage.getGenerationJob(requestId)).toMatchObject({
      status: "failed",
      errorMessage: "We couldn’t generate this portrait right now. Please try again.",
    });
  });

  it("retries a failed generation with the same paid request", async () => {
    openAi.generateKrishnaImage.mockRejectedValueOnce(
      new OpenAiImageError("Provider failed", 500, "provider"),
    );
    const requestId = crypto.randomUUID();
    const input = {
      requestId,
      sessionId,
      templateId: janmashtamiKrishnaMakhanTemplate.id,
      childAssetId: child.assetId,
    };

    await expect(service.start(input)).rejects.toBeInstanceOf(
      OpenAiGenerationServiceError,
    );
    await expect(service.start(input)).resolves.toMatchObject({
      jobToken: requestId,
      status: "complete",
    });

    expect(openAi.generateKrishnaImage).toHaveBeenCalledTimes(2);
    expect(await storage.getGenerationJob(requestId)).toMatchObject({
      status: "complete",
      outputS3Key: `outputs/${requestId}/final.png`,
    });
  });

  it("keeps safe OpenAI error metadata for server diagnostics", async () => {
    const client = new OpenAiImageClient({
      apiKey: "test-key",
      fetcher: vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: { code: "image_generation_failed", type: "invalid_request_error" },
            }),
            {
              status: 400,
              headers: {
                "content-type": "application/json",
                "x-request-id": "req_failed_image",
              },
            },
          ),
      ),
    });

    await expect(
      client.generateKrishnaImage({
        prompt: "Create a portrait",
        identityImages: [
          {
            bytes: new Uint8Array([1, 2, 3]),
            filename: "identity.jpg",
            contentType: "image/jpeg",
          },
        ],
        size: "1024x1536",
        quality: "medium",
      }),
    ).rejects.toMatchObject({
      status: 400,
      category: "provider",
      providerCode: "image_generation_failed",
      providerType: "invalid_request_error",
      requestId: "req_failed_image",
    });
  });

  it("returns a controlled configuration error when the API key is missing", async () => {
    service = new OpenAiGenerationService({
      storage,
      openAi: new OpenAiImageClient({ apiKey: "" }),
      readTemplate: async () => new Uint8Array([9, 9, 9]),
    });
    await expect(start()).rejects.toMatchObject({
      code: "PROVIDER_NOT_CONFIGURED",
      message: "OpenAI API key is not configured.",
    });
  });
});

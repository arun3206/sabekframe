import { beforeEach, describe, expect, it, vi } from "vitest";
import { rakhiBrotherSisterTemplate } from "@/config/portrait-templates";
import {
  GenerationService,
  GenerationServiceError,
} from "@/server/generation/generation-service";
import type {
  FaceDetection,
  ImageProject,
  MagicHourApi,
} from "@/server/generation/magic-hour-client";
import type { AssetRecord } from "@/server/uploads/storage";
import { InMemoryStorage } from "@/server/uploads/storage";

class TestStorage extends InMemoryStorage {
  override async createPrivateObjectUrl(key: string, _expiresIn: number) {
    void _expiresIn;
    return `https://private.example/${key}`;
  }

  override async createAssetProviderUrl(record: AssetRecord, _expiresIn: number) {
    void _expiresIn;
    return `https://private.example/${record.sanitizedPath}`;
  }
}

class TestMagicHour implements MagicHourApi {
  detectFaces = vi.fn<MagicHourApi["detectFaces"]>(async (targetFilePath) => ({
    id: targetFilePath.includes("brother.png") ? "detection-brother" : "detection-sister",
    creditsCharged: 0,
  }));
  getFaceDetection = vi.fn<MagicHourApi["getFaceDetection"]>(
    async (id): Promise<FaceDetection> => ({
      id,
      credits_charged: 0,
      status: "complete",
      faces: [{ path: `api-assets/${id}/0-0.png` }],
    }),
  );
  createFaceSwap = vi.fn<MagicHourApi["createFaceSwap"]>(async () => ({
    id: "project-1",
    creditsCharged: 10,
  }));
  getImageProject = vi.fn<MagicHourApi["getImageProject"]>(
    async (): Promise<ImageProject> => ({
      id: "project-1",
      status: "queued",
      credits_charged: 10,
      downloads: [],
      error: null,
    }),
  );
}

const sessionId = "17de847e-8e05-4f44-a78b-b1d19dc0b220";

function asset(assetId: string, role: "first" | "second"): AssetRecord {
  return {
    assetId,
    sourceUploadId: assetId,
    sessionId,
    relationship: "brother-sister",
    role,
    sanitizedPath: `uploads/${sessionId}/${assetId}.jpg`,
    validationStatus: "pass",
    width: 900,
    height: 1200,
    expiresAt: Date.now() + 60_000,
  };
}

describe("Magic Hour Rakhi generation", () => {
  let storage: TestStorage;
  let magicHour: TestMagicHour;
  let service: GenerationService;
  let brother: AssetRecord;
  let sister: AssetRecord;

  beforeEach(async () => {
    storage = new TestStorage();
    await storage.deletePrivateObject(rakhiBrotherSisterTemplate.s3Key);
    await storage.deletePrivateObject(rakhiBrotherSisterTemplate.faceMappingS3Key);
    await storage.deletePrivateObject(
      rakhiBrotherSisterTemplate.referenceFaces.brother.s3Key,
    );
    await storage.deletePrivateObject(
      rakhiBrotherSisterTemplate.referenceFaces.sister.s3Key,
    );
    magicHour = new TestMagicHour();
    brother = asset(crypto.randomUUID(), "first");
    sister = asset(crypto.randomUUID(), "second");
    await storage.saveSanitized(brother, new Uint8Array([1]));
    await storage.saveSanitized(sister, new Uint8Array([2]));
    service = new GenerationService({
      storage,
      magicHour,
      readTemplate: async () => new Uint8Array([9, 8, 7]),
      sleep: async () => undefined,
    });
  });

  function start() {
    return service.start({
      requestId: crypto.randomUUID(),
      sessionId,
      templateId: rakhiBrotherSisterTemplate.id,
      brotherAssetId: brother.assetId,
      sisterAssetId: sister.assetId,
    });
  }

  async function saveMapping() {
    await storage.putPrivateObject(
      rakhiBrotherSisterTemplate.faceMappingS3Key,
      new TextEncoder().encode(
        JSON.stringify({
          mappingVersion: 2,
          templateId: rakhiBrotherSisterTemplate.id,
          detectedAt: new Date().toISOString(),
          detectionIds: {
            brother: "cached-brother-detection",
            sister: "cached-sister-detection",
          },
          referenceS3Keys: {
            brother: rakhiBrotherSisterTemplate.referenceFaces.brother.s3Key,
            sister: rakhiBrotherSisterTemplate.referenceFaces.sister.s3Key,
          },
          faces: {
            brother: { path: "api-assets/cached/0-0.png" },
            sister: { path: "api-assets/cached/0-1.png" },
          },
        }),
      ),
      "application/json",
    );
  }

  it("uploads the template if it is missing", async () => {
    const put = vi.spyOn(storage, "putPrivateObject");
    await start();
    expect(put).toHaveBeenCalledWith(
      rakhiBrotherSisterTemplate.s3Key,
      new Uint8Array([9, 8, 7]),
      "image/png",
      { ifAbsent: true },
    );
  });

  it("uploads both prepared face references if they are missing", async () => {
    const put = vi.spyOn(storage, "putPrivateObject");
    await start();
    expect(put).toHaveBeenCalledWith(
      rakhiBrotherSisterTemplate.referenceFaces.brother.s3Key,
      new Uint8Array([9, 8, 7]),
      "image/png",
      { ifAbsent: true },
    );
    expect(put).toHaveBeenCalledWith(
      rakhiBrotherSisterTemplate.referenceFaces.sister.s3Key,
      new Uint8Array([9, 8, 7]),
      "image/png",
      { ifAbsent: true },
    );
  });

  it("does not upload an existing template again", async () => {
    await storage.putPrivateObject(
      rakhiBrotherSisterTemplate.s3Key,
      new Uint8Array([1]),
      "image/png",
    );
    const put = vi.spyOn(storage, "putPrivateObject");
    await start();
    expect(put).not.toHaveBeenCalledWith(
      rakhiBrotherSisterTemplate.s3Key,
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it("runs face detection when the mapping is missing", async () => {
    await start();
    expect(magicHour.detectFaces).toHaveBeenCalledTimes(2);
    expect(magicHour.detectFaces).toHaveBeenCalledWith(
      `https://private.example/${rakhiBrotherSisterTemplate.referenceFaces.brother.s3Key}`,
    );
    expect(magicHour.detectFaces).toHaveBeenCalledWith(
      `https://private.example/${rakhiBrotherSisterTemplate.referenceFaces.sister.s3Key}`,
    );
  });

  it("skips face detection when a stored mapping exists", async () => {
    await saveMapping();
    await start();
    expect(magicHour.detectFaces).not.toHaveBeenCalled();
  });

  it("stores mappings after exactly one face is detected in each reference", async () => {
    await start();
    const bytes = await storage.readPrivateObject(
      rakhiBrotherSisterTemplate.faceMappingS3Key,
    );
    expect(JSON.parse(new TextDecoder().decode(bytes!))).toMatchObject({
      mappingVersion: 2,
      detectionIds: {
        brother: "detection-brother",
        sister: "detection-sister",
      },
      faces: {
        brother: { path: "api-assets/detection-brother/0-0.png" },
        sister: { path: "api-assets/detection-sister/0-0.png" },
      },
    });
  });

  it("fails safely when a reference does not return exactly one face", async () => {
    magicHour.getFaceDetection.mockResolvedValueOnce({
      id: "detection-brother",
      credits_charged: 0,
      status: "complete",
      faces: [
        { path: "api-assets/detection-brother/0-0.png" },
        { path: "api-assets/detection-brother/0-1.png" },
      ],
    });
    await expect(start()).rejects.toThrow(GenerationServiceError);
    expect(magicHour.createFaceSwap).not.toHaveBeenCalled();
  });

  it("sends exactly two face mappings", async () => {
    await start();
    expect(magicHour.createFaceSwap.mock.calls[0]?.[0].faceMappings).toHaveLength(2);
  });

  it("maps the brother upload to the configured brother face", async () => {
    await saveMapping();
    await start();
    expect(magicHour.createFaceSwap.mock.calls[0]?.[0].faceMappings[0]).toEqual({
      originalFace: "api-assets/cached/0-0.png",
      newFace: `https://private.example/${brother.sanitizedPath}`,
    });
  });

  it("maps the sister upload to the configured sister face", async () => {
    await saveMapping();
    await start();
    expect(magicHour.createFaceSwap.mock.calls[0]?.[0].faceMappings[1]).toEqual({
      originalFace: "api-assets/cached/0-1.png",
      newFace: `https://private.example/${sister.sanitizedPath}`,
    });
  });

  it("copies completed Magic Hour output into private storage", async () => {
    const started = await start();
    magicHour.getImageProject.mockResolvedValueOnce({
      id: "project-1",
      status: "complete",
      credits_charged: 10,
      downloads: [
        {
          url: "https://videos.magichour.ai/project-1/output.png",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
      ],
      error: null,
    });
    service = new GenerationService({
      storage,
      magicHour,
      fetcher: vi.fn(
        async () =>
          new Response(new Uint8Array([5, 4, 3]), {
            headers: { "Content-Type": "image/png" },
          }),
      ),
      sleep: async () => undefined,
    });
    const complete = await service.refresh(started.jobToken, sessionId);
    expect(complete.status).toBe("complete");
    expect(
      await storage.readPrivateObject(`outputs/${started.jobToken}/final.png`),
    ).toEqual(new Uint8Array([5, 4, 3]));
  });
});

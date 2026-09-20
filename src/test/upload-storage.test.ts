import { InMemoryStorage, type AssetRecord } from "@/server/uploads/storage";

describe("upload storage lifecycle", () => {
  it("keeps an idempotent finalized result while deleting raw bytes", async () => {
    const storage = new InMemoryStorage();
    const now = Date.now();
    const upload = {
      uploadId: crypto.randomUUID(),
      sessionId: crypto.randomUUID(),
      relationship: "mother-daughter",
      role: "first" as const,
      rawPath: "session/upload.jpg",
      createdAt: now,
      expiresAt: now + 60_000,
    };
    const prepared = await storage.prepare(upload, "http://localhost:3000/create/upload");
    const token = new URL(prepared.uploadUrl).searchParams.get("token");
    expect(token).toBeTruthy();
    await storage.putDevelopmentRaw(upload.uploadId, token!, new Uint8Array([1, 2, 3]));

    const asset: AssetRecord = {
      assetId: upload.uploadId,
      sourceUploadId: upload.uploadId,
      sessionId: upload.sessionId,
      relationship: upload.relationship,
      role: upload.role,
      sanitizedPath: "session/upload.jpg",
      width: 1024,
      height: 1024,
      validationStatus: "pass",
      expiresAt: now + 86_400_000,
    };
    await storage.saveSanitized(asset, new Uint8Array([4, 5, 6]));
    await storage.deleteRaw(upload);

    expect((await storage.getUpload(upload.uploadId))?.finalizedAsset).toEqual({
      assetId: upload.uploadId,
      role: "first",
      validationStatus: "pass",
      width: 1024,
      height: 1024,
    });
    await expect(storage.readRaw(upload)).rejects.toThrow("Raw upload missing");
    expect(await storage.getAsset(asset.assetId)).toMatchObject(asset);

    await storage.deleteAsset(asset);
    expect(await storage.getAsset(asset.assetId)).toBeNull();
    expect(await storage.getUpload(upload.uploadId)).toBeNull();
  });
});

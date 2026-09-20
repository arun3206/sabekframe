import { photoUploadRestrictions } from "@/config/photo-upload";
import type { PhotoRole } from "@/features/photo-upload/types";
import { AwsStorage } from "@/server/uploads/aws-storage";
import type { GenerationJobRecord } from "@/server/generation/types";
import type { PaymentRecord } from "@/server/payments/types";

export interface FinalizedAssetSummary {
  assetId: string;
  role: PhotoRole;
  validationStatus: "pass" | "warning-accepted";
  width: number;
  height: number;
}

export interface UploadRecord {
  uploadId: string;
  sessionId: string;
  relationship: string;
  role: PhotoRole;
  rawPath: string;
  createdAt: number;
  expiresAt: number;
  finalizedAsset?: FinalizedAssetSummary;
}

export interface AssetRecord extends FinalizedAssetSummary {
  sourceUploadId: string;
  sessionId: string;
  relationship: string;
  sanitizedPath: string;
  expiresAt: number;
}

export interface PreparedStorageUpload {
  uploadId: string;
  uploadUrl: string;
  uploadKind: "binary";
  uploadHeaders: Record<string, string>;
}

export interface PrivateImageStorageProvider {
  prepare(record: UploadRecord, requestUrl: string): Promise<PreparedStorageUpload>;
  putDevelopmentRaw(uploadId: string, token: string, bytes: Uint8Array): Promise<void>;
  getUpload(uploadId: string): Promise<UploadRecord | null>;
  readRaw(record: UploadRecord): Promise<Uint8Array>;
  saveSanitized(record: AssetRecord, bytes: Uint8Array): Promise<void>;
  deleteRaw(record: UploadRecord): Promise<void>;
  getAsset(assetId: string): Promise<AssetRecord | null>;
  readSanitizedAsset(record: AssetRecord): Promise<Uint8Array>;
  deleteAsset(record: AssetRecord): Promise<void>;
  createPreview(record: AssetRecord): Promise<{ url: string; expiresIn: number }>;
  privateObjectExists(key: string): Promise<boolean>;
  readPrivateObject(key: string): Promise<Uint8Array | null>;
  putPrivateObject(
    key: string,
    bytes: Uint8Array,
    contentType: string,
    options?: { ifAbsent?: boolean },
  ): Promise<boolean>;
  deletePrivateObject(key: string): Promise<void>;
  createPrivateObjectUrl(key: string, expiresIn: number): Promise<string | null>;
  createAssetProviderUrl(record: AssetRecord, expiresIn: number): Promise<string>;
  createGenerationJob(record: GenerationJobRecord): Promise<boolean>;
  restartFailedGenerationJob(record: GenerationJobRecord): Promise<boolean>;
  saveGenerationJob(record: GenerationJobRecord): Promise<void>;
  getGenerationJob(jobId: string): Promise<GenerationJobRecord | null>;
  createPayment(record: PaymentRecord): Promise<boolean>;
  savePayment(record: PaymentRecord): Promise<void>;
  getPayment(paymentId: string): Promise<PaymentRecord | null>;
  cleanup(now: number): Promise<number>;
}

interface MemoryState {
  uploads: Map<string, UploadRecord & { token: string; bytes?: Uint8Array }>;
  assets: Map<string, AssetRecord & { bytes: Uint8Array }>;
  privateObjects: Map<string, { bytes: Uint8Array; contentType: string }>;
  generationJobs: Map<string, GenerationJobRecord>;
  payments: Map<string, PaymentRecord>;
}

const globalMemory = globalThis as typeof globalThis & { __yaadonStorage?: MemoryState };
const memory = (globalMemory.__yaadonStorage ??= {
  uploads: new Map(),
  assets: new Map(),
  privateObjects: new Map(),
  generationJobs: new Map(),
  payments: new Map(),
});

export class InMemoryStorage implements PrivateImageStorageProvider {
  async prepare(record: UploadRecord, requestUrl: string) {
    const token = crypto.randomUUID();
    memory.uploads.set(record.uploadId, { ...record, token });
    return {
      uploadId: record.uploadId,
      uploadUrl: new URL(
        `/api/uploads/raw/${record.uploadId}?token=${token}`,
        requestUrl,
      ).toString(),
      uploadKind: "binary" as const,
      uploadHeaders: { "Content-Type": "image/jpeg" },
    };
  }

  async putDevelopmentRaw(uploadId: string, token: string, bytes: Uint8Array) {
    const record = memory.uploads.get(uploadId);
    if (!record || record.token !== token) throw new Error("Invalid upload token");
    memory.uploads.set(uploadId, { ...record, bytes });
  }

  async getUpload(uploadId: string) {
    const record = memory.uploads.get(uploadId);
    return record && record.expiresAt > Date.now() ? record : null;
  }

  async readRaw(record: UploadRecord) {
    const bytes = memory.uploads.get(record.uploadId)?.bytes;
    if (!bytes) throw new Error("Raw upload missing");
    return bytes;
  }

  async saveSanitized(record: AssetRecord, bytes: Uint8Array) {
    memory.assets.set(record.assetId, { ...record, bytes });
    const upload = memory.uploads.get(record.sourceUploadId);
    if (upload)
      memory.uploads.set(record.sourceUploadId, {
        ...upload,
        finalizedAsset: {
          assetId: record.assetId,
          role: record.role,
          validationStatus: record.validationStatus,
          width: record.width,
          height: record.height,
        },
      });
  }

  async deleteRaw(record: UploadRecord) {
    const upload = memory.uploads.get(record.uploadId);
    if (upload) memory.uploads.set(record.uploadId, { ...upload, bytes: undefined });
  }

  async getAsset(assetId: string) {
    const record = memory.assets.get(assetId);
    return record && record.expiresAt > Date.now() ? record : null;
  }

  async readSanitizedAsset(record: AssetRecord) {
    const bytes = memory.assets.get(record.assetId)?.bytes;
    if (!bytes) throw new Error("Sanitized upload missing");
    return bytes;
  }

  async deleteAsset(record: AssetRecord) {
    memory.assets.delete(record.assetId);
    memory.uploads.delete(record.sourceUploadId);
  }

  async createPreview(record: AssetRecord) {
    return {
      url: `/api/uploads/${record.assetId}/preview?content=1`,
      expiresIn: photoUploadRestrictions.signedPreviewLifetimeSeconds,
    };
  }

  async privateObjectExists(key: string) {
    return memory.privateObjects.has(key);
  }

  async readPrivateObject(key: string) {
    return memory.privateObjects.get(key)?.bytes ?? null;
  }

  async putPrivateObject(
    key: string,
    bytes: Uint8Array,
    contentType: string,
    options?: { ifAbsent?: boolean },
  ) {
    if (options?.ifAbsent && memory.privateObjects.has(key)) return false;
    memory.privateObjects.set(key, { bytes, contentType });
    return true;
  }

  async deletePrivateObject(key: string) {
    memory.privateObjects.delete(key);
  }

  async createPrivateObjectUrl(_key: string, _expiresIn: number): Promise<string | null> {
    void _key;
    void _expiresIn;
    return null;
  }

  async createAssetProviderUrl(
    _record: AssetRecord,
    _expiresIn: number,
  ): Promise<string> {
    void _record;
    void _expiresIn;
    throw new Error(
      "Magic Hour generation requires AWS upload storage with externally accessible signed URLs.",
    );
  }

  async createGenerationJob(record: GenerationJobRecord) {
    if (memory.generationJobs.has(record.jobId)) return false;
    memory.generationJobs.set(record.jobId, { ...record });
    return true;
  }

  async restartFailedGenerationJob(record: GenerationJobRecord) {
    const existing = memory.generationJobs.get(record.jobId);
    if (
      !existing ||
      existing.status !== "failed" ||
      existing.sessionId !== record.sessionId ||
      existing.templateId !== record.templateId
    )
      return false;
    memory.generationJobs.set(record.jobId, { ...record });
    return true;
  }

  async saveGenerationJob(record: GenerationJobRecord) {
    memory.generationJobs.set(record.jobId, { ...record });
  }

  async getGenerationJob(jobId: string) {
    const record = memory.generationJobs.get(jobId);
    return record && record.expiresAt > Date.now() ? { ...record } : null;
  }

  async createPayment(record: PaymentRecord) {
    if (memory.payments.has(record.id)) return false;
    memory.payments.set(record.id, { ...record });
    return true;
  }

  async savePayment(record: PaymentRecord) {
    const existing = memory.payments.get(record.id);
    if (!existing || existing.sessionId !== record.sessionId)
      throw new Error("Payment ownership mismatch");
    memory.payments.set(record.id, { ...record });
  }

  async getPayment(paymentId: string) {
    const record = memory.payments.get(paymentId);
    return record && record.expiresAt > Date.now() ? { ...record } : null;
  }

  async cleanup(now: number) {
    let deleted = 0;
    for (const [id, record] of memory.uploads) {
      if (record.expiresAt <= now) {
        memory.uploads.delete(id);
        deleted += 1;
      }
    }
    for (const [id, record] of memory.assets) {
      if (record.expiresAt <= now) {
        memory.assets.delete(id);
        deleted += 1;
      }
    }
    return deleted;
  }

  getBytes(assetId: string) {
    return memory.assets.get(assetId)?.bytes;
  }
}

let provider: PrivateImageStorageProvider | undefined;

export function getPrivateImageStorage(): PrivateImageStorageProvider {
  if (provider) return provider;
  if (process.env.UPLOAD_STORAGE_PROVIDER === "aws") return (provider = new AwsStorage());
  if (process.env.NODE_ENV === "production")
    throw new Error(
      "AWS upload storage is required in production. Configure UPLOAD_STORAGE_PROVIDER=aws.",
    );
  return (provider = new InMemoryStorage());
}

export function getDevelopmentAssetBytes(assetId: string): Uint8Array | undefined {
  return provider instanceof InMemoryStorage ? provider.getBytes(assetId) : undefined;
}

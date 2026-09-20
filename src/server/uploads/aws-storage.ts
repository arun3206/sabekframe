import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  DynamoDBClient,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  getSignedUrl,
} from "@/server/aws/aws-sdk-lite";
import { photoUploadRestrictions } from "@/config/photo-upload";
import { pricing } from "@/config/pricing";
import type { GenerationJobRecord } from "@/server/generation/types";
import type { PaymentRecord } from "@/server/payments/types";
import type {
  AssetRecord,
  PreparedStorageUpload,
  PrivateImageStorageProvider,
  UploadRecord,
} from "@/server/uploads/storage";

const EXPIRY_INDEX = "expiry-index";

interface AwsUploadConfiguration {
  region: string;
  rawBucket: string;
  sanitizedBucket: string;
  tableName: string;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required AWS upload configuration: ${name}`);
  return value;
}

export function readAwsUploadConfiguration(): AwsUploadConfiguration {
  return {
    region: requiredEnvironment("AWS_REGION"),
    rawBucket: requiredEnvironment("AWS_RAW_UPLOADS_BUCKET"),
    sanitizedBucket: requiredEnvironment("AWS_SANITIZED_UPLOADS_BUCKET"),
    tableName: requiredEnvironment("AWS_UPLOADS_TABLE"),
  };
}

function uploadKey(uploadId: string) {
  return { pk: `UPLOAD#${uploadId}`, sk: "METADATA" };
}

function assetKey(assetId: string) {
  return { pk: `ASSET#${assetId}`, sk: "METADATA" };
}

function generationKey(jobId: string) {
  return { pk: `GENERATION#${jobId}`, sk: "METADATA" };
}

function paymentKey(paymentId: string) {
  return { pk: `PAYMENT#${paymentId}`, sk: "METADATA" };
}

function ttlSeconds(expiresAt: number) {
  return Math.ceil(expiresAt / 1_000);
}

function isPhotoRole(value: unknown): value is UploadRecord["role"] {
  return value === "first" || value === "second";
}

function isFinalizedAssetSummary(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.assetId === "string" &&
    isPhotoRole(item.role) &&
    (item.validationStatus === "pass" || item.validationStatus === "warning-accepted") &&
    typeof item.width === "number" &&
    typeof item.height === "number"
  );
}

function isUploadRecord(value: unknown): value is UploadRecord {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.uploadId === "string" &&
    typeof item.sessionId === "string" &&
    typeof item.relationship === "string" &&
    isPhotoRole(item.role) &&
    typeof item.rawPath === "string" &&
    typeof item.createdAt === "number" &&
    typeof item.expiresAt === "number" &&
    (item.finalizedAsset === undefined || isFinalizedAssetSummary(item.finalizedAsset))
  );
}

function isAssetRecord(value: unknown): value is AssetRecord {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.assetId === "string" &&
    typeof item.sourceUploadId === "string" &&
    typeof item.sessionId === "string" &&
    typeof item.relationship === "string" &&
    isPhotoRole(item.role) &&
    typeof item.sanitizedPath === "string" &&
    typeof item.width === "number" &&
    typeof item.height === "number" &&
    (item.validationStatus === "pass" || item.validationStatus === "warning-accepted") &&
    typeof item.expiresAt === "number"
  );
}

function isGenerationJobRecord(value: unknown): value is GenerationJobRecord {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.jobId === "string" &&
    typeof item.jobToken === "string" &&
    typeof item.sessionId === "string" &&
    typeof item.templateId === "string" &&
    (typeof item.childAssetId === "string" ||
      typeof item.motherDaughterAssetId === "string" ||
      typeof item.subjectAssetId === "string" ||
      (typeof item.maleAssetId === "string" && typeof item.femaleAssetId === "string") ||
      (typeof item.womanAssetId === "string" && typeof item.manAssetId === "string") ||
      (typeof item.brotherAssetId === "string" &&
        typeof item.sisterAssetId === "string")) &&
    (item.provider === undefined ||
      item.provider === "OPENAI" ||
      item.provider === "MAGIC_HOUR") &&
    (item.model === undefined || typeof item.model === "string") &&
    (item.occasion === undefined ||
      item.occasion === "JANMASHTAMI" ||
      item.occasion === "RAKSHA_BANDHAN" ||
      item.occasion === "RETRO") &&
    ["initializing", "queued", "rendering", "complete", "failed"].includes(
      String(item.status),
    ) &&
    typeof item.createdAt === "number" &&
    typeof item.updatedAt === "number" &&
    typeof item.expiresAt === "number"
  );
}

function isPaymentRecord(value: unknown): value is PaymentRecord {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.generationJobId === "string" &&
    typeof item.templateId === "string" &&
    typeof item.sessionId === "string" &&
    item.amount === pricing.offer.amountMinor &&
    item.currency === "INR" &&
    ["CREATED", "PAID", "FAILED", "VERIFICATION_FAILED"].includes(String(item.status)) &&
    typeof item.createdAt === "number" &&
    typeof item.expiresAt === "number"
  );
}

export class AwsStorage implements PrivateImageStorageProvider {
  private readonly s3: S3Client;
  private readonly dynamodb: DynamoDBDocumentClient;

  constructor(private readonly config = readAwsUploadConfiguration()) {
    this.s3 = new S3Client({ region: config.region });
    this.dynamodb = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: config.region }),
      { marshallOptions: { removeUndefinedValues: true } },
    );
  }

  async prepare(record: UploadRecord): Promise<PreparedStorageUpload> {
    await this.dynamodb.send(
      new PutCommand({
        TableName: this.config.tableName,
        Item: {
          ...uploadKey(record.uploadId),
          ...record,
          entityType: "UPLOAD",
          objectKey: record.rawPath,
          ttl: ttlSeconds(record.expiresAt),
        },
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );
    const command = new PutObjectCommand({
      Bucket: this.config.rawBucket,
      Key: record.rawPath,
      ContentType: "image/jpeg",
      CacheControl: "private, no-store",
    });
    return {
      uploadId: record.uploadId,
      uploadUrl: await getSignedUrl(this.s3, command, {
        expiresIn: photoUploadRestrictions.signedUploadLifetimeSeconds,
        signableHeaders: new Set(["content-type"]),
      }),
      uploadKind: "binary",
      uploadHeaders: { "Content-Type": "image/jpeg" },
    };
  }

  async putDevelopmentRaw() {
    throw new Error("The local raw-upload route is unavailable with AWS storage");
  }

  async getUpload(uploadId: string) {
    const result = await this.dynamodb.send(
      new GetCommand({
        TableName: this.config.tableName,
        Key: uploadKey(uploadId),
        ConsistentRead: true,
      }),
    );
    if (!isUploadRecord(result.Item) || result.Item.expiresAt <= Date.now()) return null;
    return result.Item;
  }

  async readRaw(record: UploadRecord) {
    const head = await this.s3.send(
      new HeadObjectCommand({ Bucket: this.config.rawBucket, Key: record.rawPath }),
    );
    if (
      typeof head.ContentLength !== "number" ||
      head.ContentLength > photoUploadRestrictions.maxSourceFileSizeBytes
    )
      throw new Error("Raw upload exceeds the configured size limit");
    const result = await this.s3.send(
      new GetObjectCommand({ Bucket: this.config.rawBucket, Key: record.rawPath }),
    );
    if (!result.Body) throw new Error("Raw upload body is missing");
    const bytes = await result.Body.transformToByteArray();
    if (bytes.byteLength > photoUploadRestrictions.maxSourceFileSizeBytes)
      throw new Error("Raw upload exceeds the configured size limit");
    return bytes;
  }

  async saveSanitized(record: AssetRecord, bytes: Uint8Array) {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.config.sanitizedBucket,
        Key: record.sanitizedPath,
        Body: bytes,
        ContentType: "image/jpeg",
        CacheControl: "private, no-store",
      }),
    );
    await this.dynamodb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: this.config.tableName,
              Item: {
                ...assetKey(record.assetId),
                ...record,
                entityType: "ASSET",
                objectKey: record.sanitizedPath,
                ttl: ttlSeconds(record.expiresAt),
              },
            },
          },
          {
            Update: {
              TableName: this.config.tableName,
              Key: uploadKey(record.sourceUploadId),
              UpdateExpression:
                "SET finalizedAsset = if_not_exists(finalizedAsset, :finalizedAsset)",
              ConditionExpression: "sessionId = :sessionId",
              ExpressionAttributeValues: {
                ":finalizedAsset": {
                  assetId: record.assetId,
                  role: record.role,
                  validationStatus: record.validationStatus,
                  width: record.width,
                  height: record.height,
                },
                ":sessionId": record.sessionId,
              },
            },
          },
        ],
      }),
    );
  }

  async deleteRaw(record: UploadRecord) {
    await this.s3.send(
      new DeleteObjectCommand({ Bucket: this.config.rawBucket, Key: record.rawPath }),
    );
  }

  async getAsset(assetId: string) {
    const result = await this.dynamodb.send(
      new GetCommand({
        TableName: this.config.tableName,
        Key: assetKey(assetId),
        ConsistentRead: true,
      }),
    );
    if (!isAssetRecord(result.Item) || result.Item.expiresAt <= Date.now()) return null;
    return result.Item;
  }

  async readSanitizedAsset(record: AssetRecord) {
    const result = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.config.sanitizedBucket,
        Key: record.sanitizedPath,
      }),
    );
    if (!result.Body) throw new Error("Sanitized upload body is missing");
    const bytes = await result.Body.transformToByteArray();
    if (bytes.byteLength > photoUploadRestrictions.maxSourceFileSizeBytes)
      throw new Error("Sanitized upload exceeds the configured size limit");
    return bytes;
  }

  async deleteAsset(record: AssetRecord) {
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.config.sanitizedBucket,
        Key: record.sanitizedPath,
      }),
    );
    await this.dynamodb.send(
      new DeleteCommand({
        TableName: this.config.tableName,
        Key: assetKey(record.assetId),
      }),
    );
    await this.dynamodb.send(
      new DeleteCommand({
        TableName: this.config.tableName,
        Key: uploadKey(record.sourceUploadId),
      }),
    );
  }

  async createPreview(record: AssetRecord) {
    const expiresIn = photoUploadRestrictions.signedPreviewLifetimeSeconds;
    const url = await getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.config.sanitizedBucket,
        Key: record.sanitizedPath,
        ResponseContentType: "image/jpeg",
        ResponseCacheControl: "private, no-store",
      }),
      { expiresIn },
    );
    return { url, expiresIn };
  }

  async privateObjectExists(key: string) {
    try {
      await this.s3.send(
        new HeadObjectCommand({ Bucket: this.config.sanitizedBucket, Key: key }),
      );
      return true;
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode;
      if (status === 404) return false;
      throw error;
    }
  }

  async readPrivateObject(key: string) {
    try {
      const result = await this.s3.send(
        new GetObjectCommand({ Bucket: this.config.sanitizedBucket, Key: key }),
      );
      return result.Body ? await result.Body.transformToByteArray() : null;
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode;
      if (status === 404) return null;
      throw error;
    }
  }

  async putPrivateObject(
    key: string,
    bytes: Uint8Array,
    contentType: string,
    options?: { ifAbsent?: boolean },
  ) {
    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.config.sanitizedBucket,
          Key: key,
          Body: bytes,
          ContentType: contentType,
          CacheControl: "private, no-store",
          IfNoneMatch: options?.ifAbsent ? "*" : undefined,
        }),
      );
      return true;
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode;
      if (options?.ifAbsent && status === 412) return false;
      throw error;
    }
  }

  async deletePrivateObject(key: string) {
    await this.s3.send(
      new DeleteObjectCommand({ Bucket: this.config.sanitizedBucket, Key: key }),
    );
  }

  async createPrivateObjectUrl(key: string, expiresIn: number) {
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: this.config.sanitizedBucket, Key: key }),
      { expiresIn },
    );
  }

  async createAssetProviderUrl(record: AssetRecord, expiresIn: number) {
    return this.createPrivateObjectUrl(record.sanitizedPath, expiresIn);
  }

  async createGenerationJob(record: GenerationJobRecord) {
    try {
      await this.dynamodb.send(
        new PutCommand({
          TableName: this.config.tableName,
          Item: {
            ...generationKey(record.jobId),
            ...record,
            entityType: "GENERATION",
            ttl: ttlSeconds(record.expiresAt),
          },
          ConditionExpression: "attribute_not_exists(pk)",
        }),
      );
      return true;
    } catch (error) {
      if ((error as { name?: string }).name === "ConditionalCheckFailedException")
        return false;
      throw error;
    }
  }

  async restartFailedGenerationJob(record: GenerationJobRecord) {
    try {
      await this.dynamodb.send(
        new PutCommand({
          TableName: this.config.tableName,
          Item: {
            ...generationKey(record.jobId),
            ...record,
            entityType: "GENERATION",
            ttl: ttlSeconds(record.expiresAt),
          },
          ConditionExpression:
            "#status = :failed AND sessionId = :sessionId AND templateId = :templateId",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: {
            ":failed": "failed",
            ":sessionId": record.sessionId,
            ":templateId": record.templateId,
          },
        }),
      );
      return true;
    } catch (error) {
      if ((error as { name?: string }).name === "ConditionalCheckFailedException")
        return false;
      throw error;
    }
  }

  async saveGenerationJob(record: GenerationJobRecord) {
    await this.dynamodb.send(
      new PutCommand({
        TableName: this.config.tableName,
        Item: {
          ...generationKey(record.jobId),
          ...record,
          entityType: "GENERATION",
          ttl: ttlSeconds(record.expiresAt),
        },
        ConditionExpression: "sessionId = :sessionId",
        ExpressionAttributeValues: { ":sessionId": record.sessionId },
      }),
    );
  }

  async getGenerationJob(jobId: string) {
    const result = await this.dynamodb.send(
      new GetCommand({
        TableName: this.config.tableName,
        Key: generationKey(jobId),
        ConsistentRead: true,
      }),
    );
    if (!isGenerationJobRecord(result.Item) || result.Item.expiresAt <= Date.now())
      return null;
    return result.Item;
  }

  async createPayment(record: PaymentRecord) {
    try {
      await this.dynamodb.send(
        new PutCommand({
          TableName: this.config.tableName,
          Item: {
            ...paymentKey(record.id),
            ...record,
            entityType: "PAYMENT",
            ttl: ttlSeconds(record.expiresAt),
          },
          ConditionExpression: "attribute_not_exists(pk)",
        }),
      );
      return true;
    } catch (error) {
      if ((error as { name?: string }).name === "ConditionalCheckFailedException")
        return false;
      throw error;
    }
  }

  async savePayment(record: PaymentRecord) {
    await this.dynamodb.send(
      new PutCommand({
        TableName: this.config.tableName,
        Item: {
          ...paymentKey(record.id),
          ...record,
          entityType: "PAYMENT",
          ttl: ttlSeconds(record.expiresAt),
        },
        ConditionExpression: "sessionId = :sessionId",
        ExpressionAttributeValues: { ":sessionId": record.sessionId },
      }),
    );
  }

  async getPayment(paymentId: string) {
    const result = await this.dynamodb.send(
      new GetCommand({
        TableName: this.config.tableName,
        Key: paymentKey(paymentId),
        ConsistentRead: true,
      }),
    );
    if (!isPaymentRecord(result.Item) || result.Item.expiresAt <= Date.now()) return null;
    return result.Item;
  }

  async cleanup(now: number) {
    let deleted = 0;
    for (const entityType of ["UPLOAD", "ASSET"] as const) {
      let exclusiveStartKey: Record<string, unknown> | undefined;
      do {
        const page = await this.dynamodb.send(
          new QueryCommand({
            TableName: this.config.tableName,
            IndexName: EXPIRY_INDEX,
            KeyConditionExpression: "entityType = :entityType AND expiresAt <= :now",
            ExpressionAttributeValues: { ":entityType": entityType, ":now": now },
            ExclusiveStartKey: exclusiveStartKey,
          }),
        );
        for (const item of page.Items ?? []) {
          if (entityType === "UPLOAD" && isUploadRecord(item)) {
            await this.deleteRaw(item);
            await this.dynamodb.send(
              new DeleteCommand({
                TableName: this.config.tableName,
                Key: uploadKey(item.uploadId),
              }),
            );
            deleted += 1;
          } else if (entityType === "ASSET" && isAssetRecord(item)) {
            await this.deleteAsset(item);
            deleted += 1;
          }
        }
        exclusiveStartKey = page.LastEvaluatedKey;
      } while (exclusiveStartKey);
    }
    return deleted;
  }
}

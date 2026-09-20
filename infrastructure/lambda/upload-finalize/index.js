"use strict";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import sharp from "sharp";

const s3 = new S3Client({});
const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const tableName = process.env.UPLOADS_TABLE_NAME;
const rawBucket = process.env.RAW_UPLOADS_BUCKET;
const sanitizedBucket = process.env.SANITIZED_UPLOADS_BUCKET;

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const MAX_SIDE = 2048;
const MIN_SIDE = 512;
const ASSET_RETENTION_MS = 24 * 60 * 60 * 1000;

function failure(code, message, status) {
  return { ok: false, error: { code, message, status } };
}

function validBox(box) {
  if (!box || typeof box !== "object") return false;
  const { x, y, width, height } = box;
  return (
    [x, y, width, height].every(Number.isFinite) &&
    x >= 0 &&
    y >= 0 &&
    width > 0 &&
    height > 0 &&
    width * height >= 0.01 &&
    x + width <= 1 &&
    y + height <= 1
  );
}

function validInput(input) {
  return (
    input &&
    typeof input === "object" &&
    typeof input.uploadId === "string" &&
    /^[0-9a-f-]{36}$/i.test(input.uploadId) &&
    typeof input.sessionId === "string" &&
    /^[0-9a-f-]{36}$/i.test(input.sessionId) &&
    typeof input.relationship === "string" &&
    (input.role === "first" || input.role === "second") &&
    (input.clientQualityStatus === "pass" ||
      input.clientQualityStatus === "warning-accepted") &&
    (input.faceBoundingBox === null || validBox(input.faceBoundingBox))
  );
}

function laplacianVariance(pixels, width, height) {
  if (width < 3 || height < 3) return 0;
  let sum = 0;
  let sumSquares = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const value =
        4 * pixels[index] -
        pixels[index - 1] -
        pixels[index + 1] -
        pixels[index - width] -
        pixels[index + width];
      sum += value;
      sumSquares += value * value;
      count += 1;
    }
  }
  const mean = sum / count;
  return sumSquares / count - mean * mean;
}

async function sanitize(source, suppliedBox) {
  if (source.byteLength > MAX_BYTES) throw new Error("FILE_TOO_LARGE");
  const input = sharp(source, {
    animated: true,
    limitInputPixels: MAX_PIXELS,
    failOn: "error",
  });
  const metadata = await input.metadata();
  if (
    !metadata.width ||
    !metadata.height ||
    !["jpeg", "png", "webp"].includes(metadata.format || "") ||
    (metadata.pages || 1) !== 1
  )
    throw new Error("INVALID_IMAGE");

  const bytes = await input
    .rotate()
    .resize({
      width: MAX_SIDE,
      height: MAX_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .toColourspace("srgb")
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
  const safeMetadata = await sharp(bytes).metadata();
  const width = safeMetadata.width || 0;
  const height = safeMetadata.height || 0;
  if (Math.min(width, height) < MIN_SIDE) throw new Error("IMAGE_TOO_SMALL");

  const box = suppliedBox || { x: 0, y: 0, width: 1, height: 1 };
  const left = Math.max(0, Math.floor(box.x * width));
  const top = Math.max(0, Math.floor(box.y * height));
  const cropWidth = Math.max(1, Math.min(width - left, Math.ceil(box.width * width)));
  const cropHeight = Math.max(1, Math.min(height - top, Math.ceil(box.height * height)));
  const crop = await sharp(bytes)
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = new Uint8Array(crop.data);
  const sharpness = laplacianVariance(pixels, crop.info.width, crop.info.height);
  const brightness = pixels.reduce((total, value) => total + value, 0) / pixels.length;
  const warning = sharpness < 80 || brightness < 45 || brightness > 220;
  return { bytes, width, height, warning };
}

export const handler = async (input) => {
  if (!validInput(input))
    return failure("INVALID_IMAGE", "The photo validation details were invalid.", 422);

  const uploadKey = { pk: `UPLOAD#${input.uploadId}`, sk: "METADATA" };
  const result = await dynamodb.send(
    new GetCommand({ TableName: tableName, Key: uploadKey, ConsistentRead: true }),
  );
  const upload = result.Item;
  if (
    !upload ||
    upload.expiresAt <= Date.now() ||
    upload.sessionId !== input.sessionId ||
    upload.relationship !== input.relationship ||
    upload.role !== input.role
  )
    return failure(
      "NOT_FOUND",
      "This upload expired. Please choose the photo again.",
      404,
    );
  if (upload.finalizedAsset) return { ok: true, data: upload.finalizedAsset };

  try {
    const head = await s3.send(
      new HeadObjectCommand({ Bucket: rawBucket, Key: upload.rawPath }),
    );
    if (!head.ContentLength || head.ContentLength > MAX_BYTES)
      throw new Error("FILE_TOO_LARGE");
    const object = await s3.send(
      new GetObjectCommand({ Bucket: rawBucket, Key: upload.rawPath }),
    );
    if (!object.Body) throw new Error("INVALID_IMAGE");
    const source = await object.Body.transformToByteArray();
    const validated = await sanitize(source, input.faceBoundingBox);
    const expiresAt = Date.now() + ASSET_RETENTION_MS;
    const sanitizedPath = `uploads/${input.sessionId}/${input.uploadId}.jpg`;
    const summary = {
      assetId: input.uploadId,
      role: input.role,
      validationStatus: validated.warning
        ? "warning-accepted"
        : input.clientQualityStatus,
      width: validated.width,
      height: validated.height,
    };
    await s3.send(
      new PutObjectCommand({
        Bucket: sanitizedBucket,
        Key: sanitizedPath,
        Body: validated.bytes,
        ContentType: "image/jpeg",
        CacheControl: "private, no-store",
      }),
    );
    await dynamodb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: tableName,
              Item: {
                pk: `ASSET#${input.uploadId}`,
                sk: "METADATA",
                ...summary,
                sourceUploadId: input.uploadId,
                sessionId: input.sessionId,
                relationship: input.relationship,
                sanitizedPath,
                expiresAt,
                entityType: "ASSET",
                objectKey: sanitizedPath,
                ttl: Math.ceil(expiresAt / 1000),
              },
            },
          },
          {
            Update: {
              TableName: tableName,
              Key: uploadKey,
              UpdateExpression:
                "SET finalizedAsset = if_not_exists(finalizedAsset, :asset)",
              ConditionExpression: "sessionId = :sessionId",
              ExpressionAttributeValues: {
                ":asset": summary,
                ":sessionId": input.sessionId,
              },
            },
          },
        ],
      }),
    );
    return { ok: true, data: summary };
  } catch {
    return failure(
      "INVALID_IMAGE",
      "The server could not safely validate this photo. Please choose another.",
      422,
    );
  } finally {
    await s3
      .send(new DeleteObjectCommand({ Bucket: rawBucket, Key: upload.rawPath }))
      .catch(() => undefined);
  }
};

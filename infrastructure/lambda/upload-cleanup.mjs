import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

const requiredEnvironment = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const tableName = requiredEnvironment("UPLOADS_TABLE_NAME");
const rawBucket = requiredEnvironment("RAW_UPLOADS_BUCKET");
const sanitizedBucket = requiredEnvironment("SANITIZED_UPLOADS_BUCKET");
const s3 = new S3Client({});
const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const isExpiredRecord = (item) =>
  item &&
  typeof item.pk === "string" &&
  typeof item.sk === "string" &&
  (item.entityType === "UPLOAD" || item.entityType === "ASSET") &&
  typeof item.objectKey === "string" &&
  typeof item.expiresAt === "number";

const listExpired = async (entityType, now) => {
  const records = [];
  let exclusiveStartKey;
  do {
    const page = await dynamodb.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: "expiry-index",
        KeyConditionExpression: "entityType = :entityType AND expiresAt <= :now",
        ExpressionAttributeValues: { ":entityType": entityType, ":now": now },
        ExclusiveStartKey: exclusiveStartKey,
        Limit: 100,
      }),
    );
    records.push(...(page.Items ?? []).filter(isExpiredRecord));
    exclusiveStartKey = page.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return records;
};

const deleteExpired = async (record, now) => {
  const bucket = record.entityType === "UPLOAD" ? rawBucket : sanitizedBucket;
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: record.objectKey }));
  await dynamodb.send(
    new DeleteCommand({
      TableName: tableName,
      Key: { pk: record.pk, sk: record.sk },
      ConditionExpression: "expiresAt <= :now",
      ExpressionAttributeValues: { ":now": now },
    }),
  );
};

export const handler = async () => {
  const now = Date.now();
  const records = [
    ...(await listExpired("UPLOAD", now)),
    ...(await listExpired("ASSET", now)),
  ];
  const results = await Promise.allSettled(
    records.map((record) => deleteExpired(record, now)),
  );
  const failed = results.filter(({ status }) => status === "rejected").length;
  console.info("Upload cleanup completed", { found: records.length, failed });
  if (failed > 0) throw new Error(`Failed to clean ${failed} expired upload records`);
  return { deleted: records.length };
};

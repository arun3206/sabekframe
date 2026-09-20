import {
  DynamoDBClient,
  DynamoDBDocumentClient,
  UpdateCommand,
} from "@/server/aws/aws-sdk-lite";
import { uploadRateLimits } from "@/config/photo-upload";

type RateLimitAction = keyof typeof uploadRateLimits;

interface RateLimiter {
  take(key: string, action: RateLimitAction): Promise<boolean>;
}

const buckets = new Map<string, number[]>();
const inMemoryRateLimiter: RateLimiter = {
  async take(key, action) {
    const { limit, windowMs } = uploadRateLimits[action];
    const now = Date.now();
    const bucketKey = `${action}:${key}`;
    const current = (buckets.get(bucketKey) ?? []).filter(
      (timestamp) => timestamp > now - windowMs,
    );
    if (current.length >= limit) return false;
    current.push(now);
    buckets.set(bucketKey, current);
    return true;
  },
};

class DynamoDbRateLimiter implements RateLimiter {
  private readonly client: DynamoDBDocumentClient;

  constructor(
    private readonly tableName: string,
    region: string,
  ) {
    this.client = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  }

  async take(key: string, action: RateLimitAction) {
    const { limit, windowMs } = uploadRateLimits[action];
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    try {
      await this.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: {
            pk: `RATE#${action}#${key}`,
            sk: `WINDOW#${windowStart}`,
          },
          UpdateExpression:
            "SET requestCount = if_not_exists(requestCount, :zero) + :one, #ttl = :ttl",
          ConditionExpression:
            "attribute_not_exists(requestCount) OR requestCount < :limit",
          ExpressionAttributeNames: { "#ttl": "ttl" },
          ExpressionAttributeValues: {
            ":zero": 0,
            ":one": 1,
            ":limit": limit,
            ":ttl": Math.ceil((windowStart + windowMs) / 1_000) + 60,
          },
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof Error && error.name === "ConditionalCheckFailedException")
        return false;
      throw error;
    }
  }
}

let durableRateLimiter: RateLimiter | undefined;

export function getRateLimiter(): RateLimiter {
  if (process.env.RATE_LIMIT_PROVIDER === "dynamodb") {
    const tableName = process.env.AWS_UPLOADS_TABLE;
    const region = process.env.AWS_REGION;
    if (!tableName || !region)
      throw new Error(
        "DynamoDB rate limiting requires AWS_UPLOADS_TABLE and AWS_REGION.",
      );
    return (durableRateLimiter ??= new DynamoDbRateLimiter(tableName, region));
  }
  if (process.env.NODE_ENV === "production")
    throw new Error(
      "DynamoDB rate limiting is required in production. Configure RATE_LIMIT_PROVIDER=dynamodb.",
    );
  return inMemoryRateLimiter;
}

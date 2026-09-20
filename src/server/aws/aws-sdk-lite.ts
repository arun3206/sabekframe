import { AwsClient } from "aws4fetch";

type Item = Record<string, unknown>;
type AttributeValue =
  | { S: string }
  | { N: string }
  | { BOOL: boolean }
  | { NULL: true }
  | { L: AttributeValue[] }
  | { M: Record<string, AttributeValue> };

interface AwsCommand<TOutput> {
  readonly service: "s3" | "dynamodb";
  readonly action: string;
  readonly input: object;
  readonly __output?: TOutput;
}

interface S3ObjectBody {
  transformToByteArray(): Promise<Uint8Array>;
}

interface S3Response {
  Body?: S3ObjectBody;
  ContentLength?: number;
}

interface DynamoResponse {
  Item?: Item;
  Items?: Item[];
  LastEvaluatedKey?: Item;
}

interface S3ObjectInput {
  Bucket: string;
  Key: string;
}

interface PutObjectInput extends S3ObjectInput {
  Body?: Uint8Array;
  ContentType?: string;
  CacheControl?: string;
  IfNoneMatch?: string;
  ResponseContentType?: string;
  ResponseCacheControl?: string;
}

interface PutItemInput {
  TableName: string;
  Item: Item;
  ConditionExpression?: string;
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues?: Item;
}

interface GetItemInput {
  TableName: string;
  Key: Item;
  ConsistentRead?: boolean;
}

interface DeleteItemInput {
  TableName: string;
  Key: Item;
}

interface UpdateItemInput extends DeleteItemInput {
  UpdateExpression: string;
  ConditionExpression?: string;
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues?: Item;
}

interface QueryInput {
  TableName: string;
  IndexName?: string;
  KeyConditionExpression: string;
  ExpressionAttributeValues: Item;
  ExclusiveStartKey?: Item;
}

interface TransactWriteInput {
  TransactItems: Array<{
    Put?: PutItemInput;
    Update?: UpdateItemInput;
  }>;
}

function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required AWS credential: ${name}`);
  return value;
}

function client(
  region: string,
  service: "s3" | "dynamodb" | "lambda" | "secretsmanager",
) {
  return new AwsClient({
    accessKeyId: requiredEnvironment("AWS_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnvironment("AWS_SECRET_ACCESS_KEY"),
    sessionToken: process.env.AWS_SESSION_TOKEN,
    region,
    service,
    retries: 2,
  });
}

function marshal(value: unknown): AttributeValue {
  if (value === null) return { NULL: true };
  if (typeof value === "string") return { S: value };
  if (typeof value === "number") return { N: String(value) };
  if (typeof value === "boolean") return { BOOL: value };
  if (Array.isArray(value)) return { L: value.map(marshal) };
  if (typeof value === "object") return { M: marshalItem(value as Item) };
  throw new Error("Unsupported DynamoDB value");
}

function marshalItem(item: Item) {
  return Object.fromEntries(
    Object.entries(item)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, marshal(value)]),
  );
}

function unmarshal(value: AttributeValue): unknown {
  if ("S" in value) return value.S;
  if ("N" in value) return Number(value.N);
  if ("BOOL" in value) return value.BOOL;
  if ("NULL" in value) return null;
  if ("L" in value) return value.L.map(unmarshal);
  return Object.fromEntries(
    Object.entries(value.M).map(([key, child]) => [key, unmarshal(child)]),
  );
}

function unmarshalItem(item: Record<string, AttributeValue>): Item {
  return Object.fromEntries(
    Object.entries(item).map(([key, value]) => [key, unmarshal(value)]),
  );
}

async function awsError(
  response: Response,
): Promise<Error & { $metadata?: { httpStatusCode: number } }> {
  const payload: unknown = await response.json().catch(() => null);
  const type =
    payload && typeof payload === "object" && "__type" in payload
      ? String((payload as { __type: unknown }).__type)
          .split("#")
          .pop()
      : undefined;
  const error = new Error(
    `AWS request failed with status ${response.status}`,
  ) as Error & {
    $metadata?: { httpStatusCode: number };
  };
  error.name = type ?? "AwsRequestError";
  error.$metadata = { httpStatusCode: response.status };
  return error;
}

export async function awsJsonRequest(
  service: "lambda" | "secretsmanager",
  region: string,
  url: string,
  init: RequestInit,
) {
  const response = await client(region, service).fetch(url, init);
  if (!response.ok) throw await awsError(response);
  return response;
}

function objectUrl(region: string, bucket: string, key: string) {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
}

export class PutObjectCommand implements AwsCommand<S3Response> {
  declare readonly __output?: S3Response;
  readonly service = "s3";
  readonly action = "PutObject";
  constructor(readonly input: PutObjectInput) {}
}

export class GetObjectCommand implements AwsCommand<S3Response> {
  declare readonly __output?: S3Response;
  readonly service = "s3";
  readonly action = "GetObject";
  constructor(readonly input: PutObjectInput) {}
}

export class HeadObjectCommand implements AwsCommand<S3Response> {
  declare readonly __output?: S3Response;
  readonly service = "s3";
  readonly action = "HeadObject";
  constructor(readonly input: S3ObjectInput) {}
}

export class DeleteObjectCommand implements AwsCommand<S3Response> {
  declare readonly __output?: S3Response;
  readonly service = "s3";
  readonly action = "DeleteObject";
  constructor(readonly input: S3ObjectInput) {}
}

export class S3Client {
  constructor(readonly config: { region: string }) {}

  async send<TOutput>(command: AwsCommand<TOutput>): Promise<TOutput> {
    const input = command.input as PutObjectInput;
    const url = objectUrl(this.config.region, input.Bucket, input.Key);
    const method =
      command.action === "PutObject"
        ? "PUT"
        : command.action === "DeleteObject"
          ? "DELETE"
          : command.action === "HeadObject"
            ? "HEAD"
            : "GET";
    const headers = new Headers();
    if (input.ContentType) headers.set("Content-Type", input.ContentType);
    if (input.CacheControl) headers.set("Cache-Control", input.CacheControl);
    if (input.IfNoneMatch) headers.set("If-None-Match", input.IfNoneMatch);
    const response = await client(this.config.region, "s3").fetch(url, {
      method,
      headers,
      body: input.Body?.slice().buffer,
    });
    if (!response.ok) throw await awsError(response);
    const output: S3Response = {
      ContentLength: Number(response.headers.get("content-length")) || undefined,
    };
    if (method === "GET") {
      const bytes = new Uint8Array(await response.arrayBuffer());
      output.Body = {
        async transformToByteArray() {
          return bytes;
        },
      };
    }
    return output as TOutput;
  }
}

export async function getSignedUrl(
  s3: S3Client,
  command: PutObjectCommand | GetObjectCommand,
  options: { expiresIn: number; signableHeaders?: Set<string> },
) {
  const input = command.input;
  const url = new URL(objectUrl(s3.config.region, input.Bucket, input.Key));
  url.searchParams.set("X-Amz-Expires", String(options.expiresIn));
  if (input.ResponseContentType)
    url.searchParams.set("response-content-type", input.ResponseContentType);
  if (input.ResponseCacheControl)
    url.searchParams.set("response-cache-control", input.ResponseCacheControl);
  const headers = new Headers();
  if (input.ContentType) headers.set("Content-Type", input.ContentType);
  const request = await client(s3.config.region, "s3").sign(url, {
    method: command instanceof PutObjectCommand ? "PUT" : "GET",
    headers,
    aws: { signQuery: true, allHeaders: Boolean(options.signableHeaders?.size) },
  });
  return request.url;
}

export class PutCommand implements AwsCommand<DynamoResponse> {
  declare readonly __output?: DynamoResponse;
  readonly service = "dynamodb";
  readonly action = "PutItem";
  constructor(readonly input: PutItemInput) {}
}

export class GetCommand implements AwsCommand<DynamoResponse> {
  declare readonly __output?: DynamoResponse;
  readonly service = "dynamodb";
  readonly action = "GetItem";
  constructor(readonly input: GetItemInput) {}
}

export class DeleteCommand implements AwsCommand<DynamoResponse> {
  declare readonly __output?: DynamoResponse;
  readonly service = "dynamodb";
  readonly action = "DeleteItem";
  constructor(readonly input: DeleteItemInput) {}
}

export class UpdateCommand implements AwsCommand<DynamoResponse> {
  declare readonly __output?: DynamoResponse;
  readonly service = "dynamodb";
  readonly action = "UpdateItem";
  constructor(readonly input: UpdateItemInput) {}
}

export class QueryCommand implements AwsCommand<DynamoResponse> {
  declare readonly __output?: DynamoResponse;
  readonly service = "dynamodb";
  readonly action = "Query";
  constructor(readonly input: QueryInput) {}
}

export class TransactWriteCommand implements AwsCommand<DynamoResponse> {
  declare readonly __output?: DynamoResponse;
  readonly service = "dynamodb";
  readonly action = "TransactWriteItems";
  constructor(readonly input: TransactWriteInput) {}
}

export class DynamoDBClient {
  constructor(readonly config: { region: string }) {}
}

function dynamoInput(command: AwsCommand<DynamoResponse>) {
  if (command instanceof TransactWriteCommand) {
    return {
      TransactItems: command.input.TransactItems.map((entry) => ({
        Put: entry.Put
          ? {
              ...entry.Put,
              Item: marshalItem(entry.Put.Item),
              ExpressionAttributeValues: entry.Put.ExpressionAttributeValues
                ? marshalItem(entry.Put.ExpressionAttributeValues)
                : undefined,
            }
          : undefined,
        Update: entry.Update
          ? {
              ...entry.Update,
              Key: marshalItem(entry.Update.Key),
              ExpressionAttributeValues: entry.Update.ExpressionAttributeValues
                ? marshalItem(entry.Update.ExpressionAttributeValues)
                : undefined,
            }
          : undefined,
      })),
    };
  }
  if (command instanceof PutCommand)
    return {
      ...command.input,
      Item: marshalItem(command.input.Item),
      ExpressionAttributeValues: command.input.ExpressionAttributeValues
        ? marshalItem(command.input.ExpressionAttributeValues)
        : undefined,
    };
  if (command instanceof GetCommand || command instanceof DeleteCommand)
    return { ...command.input, Key: marshalItem(command.input.Key) };
  if (command instanceof UpdateCommand)
    return {
      ...command.input,
      Key: marshalItem(command.input.Key),
      ExpressionAttributeValues: command.input.ExpressionAttributeValues
        ? marshalItem(command.input.ExpressionAttributeValues)
        : undefined,
    };
  if (command instanceof QueryCommand)
    return {
      ...command.input,
      ExpressionAttributeValues: marshalItem(command.input.ExpressionAttributeValues),
      ExclusiveStartKey: command.input.ExclusiveStartKey
        ? marshalItem(command.input.ExclusiveStartKey)
        : undefined,
    };
  throw new Error("Unsupported DynamoDB command");
}

export class DynamoDBDocumentClient {
  private constructor(private readonly region: string) {}

  static from(client: DynamoDBClient, _options?: object) {
    void _options;
    return new DynamoDBDocumentClient(client.config.region);
  }

  async send<TOutput>(command: AwsCommand<TOutput>): Promise<TOutput> {
    const response = await client(this.region, "dynamodb").fetch(
      `https://dynamodb.${this.region}.amazonaws.com/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-amz-json-1.0",
          "X-Amz-Target": `DynamoDB_20120810.${command.action}`,
        },
        body: JSON.stringify(dynamoInput(command as AwsCommand<DynamoResponse>)),
      },
    );
    if (!response.ok) throw await awsError(response);
    const payload = (await response.json()) as {
      Item?: Record<string, AttributeValue>;
      Items?: Array<Record<string, AttributeValue>>;
      LastEvaluatedKey?: Record<string, AttributeValue>;
    };
    return {
      Item: payload.Item ? unmarshalItem(payload.Item) : undefined,
      Items: payload.Items?.map(unmarshalItem),
      LastEvaluatedKey: payload.LastEvaluatedKey
        ? unmarshalItem(payload.LastEvaluatedKey)
        : undefined,
    } as TOutput;
  }
}

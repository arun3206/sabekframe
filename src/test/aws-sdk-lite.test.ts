import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DynamoDBClient,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  PutObjectCommand,
  S3Client,
  getSignedUrl,
} from "@/server/aws/aws-sdk-lite";

function configureCredentials() {
  vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIDEXAMPLE");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("lightweight AWS request adapter", () => {
  it("marshals DynamoDB document values into the AWS JSON protocol", async () => {
    configureCredentials();
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const client = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: "ap-south-1" }),
    );

    await client.send(
      new PutCommand({
        TableName: "uploads",
        Item: { pk: "UPLOAD#1", count: 2, active: true, nested: { role: "first" } },
      }),
    );

    const request = fetcher.mock.calls[0]![0] as Request;
    const body = (await request.json()) as {
      Item: Record<string, unknown>;
    };
    expect(body.Item).toEqual({
      pk: { S: "UPLOAD#1" },
      count: { N: "2" },
      active: { BOOL: true },
      nested: { M: { role: { S: "first" } } },
    });
    expect(request.headers.get("x-amz-target")).toBe("DynamoDB_20120810.PutItem");
  });

  it("unmarshals DynamoDB responses", async () => {
    configureCredentials();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          Item: {
            pk: { S: "ASSET#1" },
            width: { N: "1024" },
            ready: { BOOL: true },
          },
        }),
      ),
    );
    const client = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: "ap-south-1" }),
    );

    const result = await client.send(
      new GetCommand({ TableName: "uploads", Key: { pk: "ASSET#1", sk: "METADATA" } }),
    );

    expect(result.Item).toEqual({ pk: "ASSET#1", width: 1024, ready: true });
  });

  it("creates a short-lived signed S3 upload URL", async () => {
    configureCredentials();
    const url = await getSignedUrl(
      new S3Client({ region: "ap-south-1" }),
      new PutObjectCommand({
        Bucket: "private-uploads",
        Key: "session/upload.jpg",
        ContentType: "image/jpeg",
      }),
      { expiresIn: 120, signableHeaders: new Set(["content-type"]) },
    );

    const parsed = new URL(url);
    expect(parsed.hostname).toBe("private-uploads.s3.ap-south-1.amazonaws.com");
    expect(parsed.searchParams.get("X-Amz-Expires")).toBe("120");
    expect(parsed.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
  });
});

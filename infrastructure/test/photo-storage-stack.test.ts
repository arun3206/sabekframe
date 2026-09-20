import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { PhotoStorageStack } from "../lib/photo-storage-stack.js";

describe("PhotoStorageStack", () => {
  const app = new App();
  const stack = new PhotoStorageStack(app, "TestPhotoStorage", {
    environmentName: "production",
    allowedOrigins: ["https://example.com", "https://www.example.com"],
  });
  const template = Template.fromStack(stack);

  it("creates exactly two private encrypted buckets", () => {
    template.resourceCountIs("AWS::S3::Bucket", 2);
    template.allResourcesProperties("AWS::S3::Bucket", {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          {
            ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" },
          },
        ],
      },
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      OwnershipControls: {
        Rules: [{ ObjectOwnership: "BucketOwnerEnforced" }],
      },
    });
  });

  it("allows browser access from every configured application origin", () => {
    template.allResourcesProperties("AWS::S3::Bucket", {
      CorsConfiguration: {
        CorsRules: Match.arrayWith([
          Match.objectLike({
            AllowedOrigins: ["https://example.com", "https://www.example.com"],
          }),
        ]),
      },
    });
  });

  it("retains production buckets and applies deletion lifecycles", () => {
    const buckets = template.findResources("AWS::S3::Bucket", {
      Properties: {
        LifecycleConfiguration: Match.objectLike({
          Rules: Match.arrayWith([
            Match.objectLike({ ExpirationInDays: 1, Status: "Enabled" }),
          ]),
        }),
      },
    });
    expect(Object.keys(buckets)).toHaveLength(2);
    for (const bucket of Object.values(buckets)) {
      expect(bucket.DeletionPolicy).toBe("Retain");
    }
  });

  it("creates retained on-demand upload state with TTL and an expiry index", () => {
    template.resourceCountIs("AWS::DynamoDB::Table", 1);
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      BillingMode: "PAY_PER_REQUEST",
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ],
      TimeToLiveSpecification: { AttributeName: "ttl", Enabled: true },
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({ IndexName: "expiry-index" }),
      ]),
    });
    const tables = template.findResources("AWS::DynamoDB::Table");
    expect(Object.values(tables)[0]?.DeletionPolicy).toBe("Retain");
  });

  it("runs a least-privilege upload cleanup Lambda every hour", () => {
    template.resourceCountIs("AWS::Lambda::Function", 2);
    template.hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "nodejs24.x",
      Timeout: 60,
      Environment: {
        Variables: Match.objectLike({
          UPLOADS_TABLE_NAME: Match.anyValue(),
          RAW_UPLOADS_BUCKET: Match.anyValue(),
          SANITIZED_UPLOADS_BUCKET: Match.anyValue(),
        }),
      },
    });
    template.hasResourceProperties("AWS::Events::Rule", {
      ScheduleExpression: "rate(1 hour)",
      State: "ENABLED",
    });
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Action: "dynamodb:Query", Effect: "Allow" }),
          Match.objectLike({ Action: "dynamodb:DeleteItem", Effect: "Allow" }),
        ]),
      },
    });
  });

  it("keeps provider keys in Secrets Manager and scopes the Cloudflare workload", () => {
    template.resourceCountIs("AWS::SecretsManager::Secret", 3);
    template.hasResourceProperties("AWS::SecretsManager::Secret", {
      Name: "yaadon/production/provider-api-keys",
    });
    template.hasResourceProperties("AWS::SecretsManager::Secret", {
      Name: "ai-photo-generator/razorpay/test",
    });
    template.hasResourceProperties("AWS::SecretsManager::Secret", {
      Name: "ai-photo-generator/razorpay/live",
    });
    template.resourceCountIs("AWS::IAM::User", 1);
    template.hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "nodejs24.x",
      MemorySize: 1536,
      Timeout: 60,
    });
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Action: "lambda:InvokeFunction", Effect: "Allow" }),
          Match.objectLike({
            Action: Match.arrayWith(["secretsmanager:GetSecretValue"]),
            Effect: "Allow",
          }),
        ]),
      },
    });
  });
});

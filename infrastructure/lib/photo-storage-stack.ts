import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  SecretValue,
  Stack,
  Tags,
  type StackProps,
} from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";
import path from "node:path";

export interface PhotoStorageStackProps extends StackProps {
  environmentName: string;
  allowedOrigins: string[];
}

export class PhotoStorageStack extends Stack {
  constructor(scope: Construct, id: string, props: PhotoStorageStackProps) {
    super(scope, id, props);

    const commonBucketProps = {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      versioned: false,
      // Photo buckets are retained even if the stack is removed. This avoids an
      // accidental `cdk destroy` deleting customer media. Empty/delete them only
      // through an explicit, reviewed retention operation.
      removalPolicy: RemovalPolicy.RETAIN,
    } satisfies Partial<s3.BucketProps>;

    const rawUploads = new s3.Bucket(this, "RawUploads", {
      ...commonBucketProps,
      cors: [
        {
          allowedOrigins: props.allowedOrigins,
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.HEAD],
          allowedHeaders: ["content-type", "x-amz-*"],
          exposedHeaders: ["ETag"],
          maxAge: 300,
        },
      ],
      lifecycleRules: [
        {
          id: "DeleteAbandonedRawUploads",
          enabled: true,
          expiration: Duration.days(1),
          abortIncompleteMultipartUploadAfter: Duration.days(1),
        },
      ],
    });

    const sanitizedUploads = new s3.Bucket(this, "SanitizedUploads", {
      ...commonBucketProps,
      cors: [
        {
          allowedOrigins: props.allowedOrigins,
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedHeaders: ["*"],
          exposedHeaders: ["ETag"],
          maxAge: 300,
        },
      ],
      lifecycleRules: [
        {
          id: "DeleteExpiredSanitizedUploads",
          enabled: true,
          prefix: "uploads/",
          expiration: Duration.days(1),
        },
        {
          id: "DeleteExpiredGeneratedOutputs",
          enabled: true,
          prefix: "outputs/",
          expiration: Duration.days(7),
        },
      ],
    });

    const uploadState = new dynamodb.Table(this, "UploadState", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      timeToLiveAttribute: "ttl",
      deletionProtection: props.environmentName === "production",
      removalPolicy: RemovalPolicy.RETAIN,
    });
    uploadState.addGlobalSecondaryIndex({
      indexName: "expiry-index",
      partitionKey: { name: "entityType", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "expiresAt", type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const cleanupLogs = new logs.LogGroup(this, "UploadCleanupLogs", {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const cleanupFunction = new lambda.Function(this, "UploadCleanup", {
      code: lambda.Code.fromAsset(path.join(__dirname, "../lambda")),
      handler: "upload-cleanup.handler",
      runtime: lambda.Runtime.NODEJS_24_X,
      memorySize: 256,
      timeout: Duration.minutes(1),
      logGroup: cleanupLogs,
      environment: {
        UPLOADS_TABLE_NAME: uploadState.tableName,
        RAW_UPLOADS_BUCKET: rawUploads.bucketName,
        SANITIZED_UPLOADS_BUCKET: sanitizedUploads.bucketName,
      },
    });
    cleanupFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:Query"],
        resources: [`${uploadState.tableArn}/index/expiry-index`],
      }),
    );
    cleanupFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:DeleteItem"],
        resources: [uploadState.tableArn],
      }),
    );
    rawUploads.grantDelete(cleanupFunction);
    sanitizedUploads.grantDelete(cleanupFunction);

    new events.Rule(this, "HourlyUploadCleanup", {
      description: "Remove expired Yaadon upload objects and metadata every hour",
      schedule: events.Schedule.rate(Duration.hours(1)),
      targets: [new targets.LambdaFunction(cleanupFunction)],
    });

    const providerApiKeys = new secretsmanager.Secret(this, "ProviderApiKeys", {
      secretName: `yaadon/${props.environmentName}/provider-api-keys`,
      description: "Server-only OpenAI and Magic Hour API keys for Yaadon",
      secretStringValue: SecretValue.unsafePlainText(
        JSON.stringify({ configured: false }),
      ),
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const razorpayTestCredentials = new secretsmanager.Secret(
      this,
      "RazorpayTestCredentials",
      {
        secretName: "ai-photo-generator/razorpay/test",
        description: "Server-only Razorpay Test Mode credentials for Yaadon",
        secretStringValue: SecretValue.unsafePlainText(
          JSON.stringify({ configured: false }),
        ),
        removalPolicy: RemovalPolicy.RETAIN,
      },
    );
    const razorpayLiveCredentials =
      props.environmentName === "production"
        ? new secretsmanager.Secret(this, "RazorpayLiveCredentials", {
            secretName: "ai-photo-generator/razorpay/live",
            description:
              "Server-only Razorpay Live Mode credentials and webhook secret for Yaadon",
            secretStringValue: SecretValue.unsafePlainText(
              JSON.stringify({ configured: false }),
            ),
            removalPolicy: RemovalPolicy.RETAIN,
          })
        : null;

    const finalizeLogs = new logs.LogGroup(this, "UploadFinalizeLogs", {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const finalizeFunction = new lambda.Function(this, "UploadFinalize", {
      code: lambda.Code.fromAsset(path.join(__dirname, "../lambda/upload-finalize")),
      handler: "index.handler",
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.X86_64,
      memorySize: 1536,
      timeout: Duration.minutes(1),
      logGroup: finalizeLogs,
      environment: {
        UPLOADS_TABLE_NAME: uploadState.tableName,
        RAW_UPLOADS_BUCKET: rawUploads.bucketName,
        SANITIZED_UPLOADS_BUCKET: sanitizedUploads.bucketName,
      },
    });
    finalizeFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject", "s3:DeleteObject"],
        resources: [`${rawUploads.bucketArn}/*`],
      }),
    );
    finalizeFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObject"],
        resources: [`${sanitizedUploads.bucketArn}/uploads/*`],
      }),
    );
    finalizeFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:TransactWriteItems",
        ],
        resources: [uploadState.tableArn],
      }),
    );

    const cloudflareWorker = new iam.User(this, "CloudflareWorker", {
      userName: `yaadon-${props.environmentName}-cloudflare-worker`,
    });
    cloudflareWorker.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObject"],
        resources: [`${rawUploads.bucketArn}/*`],
      }),
    );
    cloudflareWorker.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
        resources: [`${sanitizedUploads.bucketArn}/*`],
      }),
    );
    cloudflareWorker.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:TransactWriteItems",
        ],
        resources: [uploadState.tableArn, `${uploadState.tableArn}/index/*`],
      }),
    );
    finalizeFunction.grantInvoke(cloudflareWorker);
    providerApiKeys.grantRead(cloudflareWorker);
    razorpayTestCredentials.grantRead(cloudflareWorker);
    razorpayLiveCredentials?.grantRead(cloudflareWorker);

    Tags.of(this).add("Project", "Yaadon");
    Tags.of(this).add("Environment", props.environmentName);
    Tags.of(this).add("DataClassification", "Sensitive");
    Tags.of(this).add("ManagedBy", "AWS-CDK");

    new CfnOutput(this, "RawUploadsBucketName", {
      value: rawUploads.bucketName,
      description: "Private bucket for short-lived normalized uploads",
    });
    new CfnOutput(this, "SanitizedUploadsBucketName", {
      value: sanitizedUploads.bucketName,
      description: "Private bucket for server-validated photographs",
    });
    new CfnOutput(this, "UploadStateTableName", {
      value: uploadState.tableName,
      description: "DynamoDB table for upload ownership, expiry, and rate limits",
    });
    new CfnOutput(this, "UploadFinalizeFunctionName", {
      value: finalizeFunction.functionName,
      description: "Lambda used for native image validation and sanitization",
    });
    new CfnOutput(this, "ProviderApiKeysSecretId", {
      value: providerApiKeys.secretName,
      description: "Secrets Manager ID containing server-only provider API keys",
    });
    new CfnOutput(this, "RazorpayTestSecretId", {
      value: razorpayTestCredentials.secretName,
      description: "Secrets Manager ID containing Razorpay Test Mode credentials",
    });
    if (razorpayLiveCredentials)
      new CfnOutput(this, "RazorpayLiveSecretId", {
        value: razorpayLiveCredentials.secretName,
        description:
          "Secrets Manager ID containing Razorpay Live Mode credentials and webhook secret",
      });
    new CfnOutput(this, "CloudflareWorkerUserName", {
      value: cloudflareWorker.userName,
      description: "Least-privilege IAM workload identity for the Cloudflare Worker",
    });
  }
}

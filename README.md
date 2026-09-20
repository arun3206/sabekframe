# Yaadon

Yaadon is a mobile-first website that turns one or two individual photos into an AI-created festival or family portrait. It is designed for Indian families using mobile and in-app browsers, with no login or prompt writing.

## Status

Relationship/experience selection, secure uploads, configurable Razorpay Test/Live payment-before-generation, the Janmashtami OpenAI image-edit flow, and the Raksha Bandhan Magic Hour experiment are implemented.

## Cloudflare deployment

Yaadon is a full-stack Next.js application with route handlers and dynamic result pages,
so it deploys to Cloudflare Workers through the OpenNext adapter rather than as a static
Cloudflare Pages export.

In a Cloudflare Workers Builds project connected to this repository, use:

```text
Production branch: main
Root directory: /
Build command: pnpm build:cloudflare
Deploy command: pnpm deploy
Node version: 24
```

The default `npx wrangler deploy` command also works after the OpenNext build command has
created the `.open-next` deployment output. Production AWS resource names are non-secret
Wrangler variables in `wrangler.jsonc`. Configure only `AWS_ACCESS_KEY_ID` and
`AWS_SECRET_ACCESS_KEY` as encrypted Worker secrets in Cloudflare; never add provider API
keys or AWS credentials to Git, plaintext variables, or browser-visible variables.

OpenAI and Magic Hour keys live in AWS Secrets Manager at
`yaadon/production/provider-api-keys`. The Worker's scoped AWS identity may read that one
secret and the configured Razorpay secret, use the production upload resources, and invoke the native image-finalization
Lambda. It has no console password and no account-wide permissions.

## Prerequisites

- Node.js 24 (`.nvmrc`)
- pnpm 10 or newer

## Install and run

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

No environment variables are required for offline upload development; a process-local memory provider is used. The AWS development provider uses private S3 buckets, DynamoDB, and short-lived credentials exported from the local AWS CLI session. Never commit access keys or place AWS credentials in browser-visible variables.

Magic Hour generation requires AWS storage because the provider must fetch the private template and both sanitized uploads through temporary HTTPS URLs. Set `MAGIC_HOUR_API_KEY` only in `.env.local` or a deployed server secret. Offline memory mode continues to support upload development but intentionally cannot make real Magic Hour calls.

Janmashtami generation uses the OpenAI Images Edits API with `gpt-image-2`. It sends the private Makhan Chor template as Image A and the sanitized child upload as Image B, then copies the returned PNG into private output storage. Set `OPENAI_API_KEY` only in `.env.local` or a deployed server secret. The model defaults to `gpt-image-2` and can be stated explicitly with `OPENAI_IMAGE_MODEL=gpt-image-2`.

## First Janmashtami end-to-end test

1. Configure the existing AWS development values and OpenAI variables in `.env.local`:

   ```text
   UPLOAD_STORAGE_PROVIDER=aws
   RATE_LIMIT_PROVIDER=dynamodb
   AWS_REGION=ap-south-1
   AWS_RAW_UPLOADS_BUCKET=<RawUploadsBucketName>
   AWS_SANITIZED_UPLOADS_BUCKET=<SanitizedUploadsBucketName>
   AWS_UPLOADS_TABLE=<UploadStateTableName>
   OPENAI_API_KEY=<your-key>
   OPENAI_IMAGE_MODEL=gpt-image-2
   ```

2. Sign in with `aws sso login --profile arun-admin`, export that profile's temporary credentials into the current PowerShell process, then run `pnpm dev` from the same window:

   ```powershell
   $awsSession = aws configure export-credentials --profile arun-admin | ConvertFrom-Json
   $env:AWS_ACCESS_KEY_ID = $awsSession.AccessKeyId
   $env:AWS_SECRET_ACCESS_KEY = $awsSession.SecretAccessKey
   $env:AWS_SESSION_TOKEN = $awsSession.SessionToken
   pnpm dev
   ```

3. Add `rzp_test_...` credentials plus `RAZORPAY_CURRENCY=INR` and `RAZORPAY_PORTRAIT_PRICE=2900` locally, or populate `ai-photo-generator/razorpay/test` in AWS Secrets Manager.
4. Open `http://localhost:3000/create`, choose **Little Krishna**, upload one clear child photo, select **Makhan Chor Krishna**, confirm permission, and choose **Generate Portrait — ₹29**.
5. Complete Razorpay Test Checkout. The backend verifies the HMAC-SHA256 signature before generation starts; no real money is deducted.
6. The result is stored under `outputs/<jobId>/final.png` in the private sanitized bucket and displayed through the existing `/result/<jobToken>` route.

For live launch, deploy the AWS infrastructure update, populate `ai-photo-generator/razorpay/live` with `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and a separate `RAZORPAY_WEBHOOK_SECRET`, then set `RAZORPAY_MODE=LIVE` and `AWS_RAZORPAY_SECRET_ID=ai-photo-generator/razorpay/live`. Enable automatic capture and configure the signed `/api/payments/webhook` endpoint for `payment.captured`, `order.paid`, and `payment.failed`. The server confirms captured status, order, amount, and currency with Razorpay before generation is authorized.

## First Magic Hour end-to-end test

1. Add your Magic Hour key and the existing AWS CDK outputs to `.env.local`:

   ```text
   UPLOAD_STORAGE_PROVIDER=aws
   RATE_LIMIT_PROVIDER=dynamodb
   AWS_REGION=ap-south-1
   AWS_RAW_UPLOADS_BUCKET=<RawUploadsBucketName>
   AWS_SANITIZED_UPLOADS_BUCKET=<SanitizedUploadsBucketName>
   AWS_UPLOADS_TABLE=<UploadStateTableName>
   MAGIC_HOUR_API_KEY=<your-key>
   MAGIC_HOUR_BASE_URL=https://api.magichour.ai
   ```

2. Sign in and deploy the lifecycle-prefix update once:

   ```powershell
   aws sso login --profile arun-admin
   $awsSession = aws configure export-credentials --profile arun-admin | ConvertFrom-Json
   $env:AWS_ACCESS_KEY_ID = $awsSession.AccessKeyId
   $env:AWS_SECRET_ACCESS_KEY = $awsSession.SecretAccessKey
   $env:AWS_SESSION_TOKEN = $awsSession.SessionToken
   pnpm infra:diff
   pnpm infra:deploy:dev
   ```

3. Start the app from the same PowerShell window with `pnpm dev`, open `http://localhost:3000/create`, choose **Brother & Sister**, upload the brother photo first and sister photo second, select **Traditional Rakhi Celebration**, confirm permission, and choose **Generate**.

The first run uploads the permanent master template and creates `face-mapping.json` in the sanitized S3 bucket before starting the swap. Later runs reuse that mapping. Generated output is stored under `outputs/<jobId>/` and the result page uses the private application delivery route.

If a Rakhi result places identities on the wrong bodies, verify the prepared brother and sister reference files configured in `src/config/portrait-templates.ts`; the provider input order follows those explicit roles.

## Secure photo upload

The browser checks signatures, normalises orientation/size/colour into a metadata-free JPEG, and runs the locally hosted MediaPipe face model plus face-region blur checks in a worker. HEIC conversion is lazy-loaded through `heic-to` (LGPL-3.0). MediaPipe Tasks and the bundled BlazeFace model are Apache-2.0; the model came from Google’s versioned MediaPipe model repository.

The server creates an anonymous HttpOnly session, authorises a short-lived raw upload, downloads it from the private `raw-uploads` bucket, validates it independently with Sharp, and writes a newly encoded JPEG to the private `sanitized-uploads` bucket. Raw objects are removed after finalisation. Browser storage contains only opaque asset IDs, roles, status, and dimensions.

The AWS provider stores anonymous ownership and expiry metadata in DynamoDB, creates short-lived S3 presigned operations, and uses durable DynamoDB rate-limit counters. Raw objects are deleted after finalisation; an hourly Lambda/EventBridge rule removes abandoned raw uploads and expired sanitized assets. S3 lifecycle rules and DynamoDB TTL provide backstops.

## AWS development storage

The CDK source stays in this repository. `cdk deploy` synthesizes CloudFormation and submits it to AWS through temporary IAM Identity Center credentials; there is no manual CDK upload step.

See [the infrastructure guide](infrastructure/README.md) for AWS CLI sign-in, local synthesis, one-time bootstrapping, review, and development deployment commands.

To calibrate brightness and edge measurements, place only consenting test photos in the gitignored `quality-samples/` directory and run `pnpm quality:calibrate`. Tune documented thresholds only in `src/config/photo-upload.ts`.

## Quality commands

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm test:e2e
pnpm build
```

Playwright browser binaries are intentionally not downloaded as part of the initial scaffold, so `pnpm test:e2e` is configured for future feature tests rather than required now.

## Project structure

```text
src/
  app/                         Next.js routes and layouts
  components/{layout,ui}/      Foundational reusable components
  config/                      Product data, pricing, upload limits
  features/portrait-flow/      Flow components, types, validation
  lib/                         Shared application utilities/constants
  providers/image-generation/ Provider-neutral AI contract
  server/                       Upload security, storage and validation
  styles/                      Global design tokens and shell styles
  test/                        Unit/component test setup
docs/                          Requirements, architecture, stack, roadmap
infrastructure/                AWS CDK storage foundation and deployment guide
Design/                        Existing Yaadon design references (preserved)
```

## Internal documentation

- [Primary project reference](PROJECT.md)
- [Requirements](docs/REQUIREMENTS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Technology stack](docs/TECH_STACK.md)
- [Implementation roadmap](docs/ROADMAP.md)
- [Instructions for coding agents](AGENTS.md)

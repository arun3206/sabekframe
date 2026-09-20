# Technical Stack

## Selected technologies

| Technology                     | Selection rationale                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Node.js 24                     | Requested production baseline and active LTS-compatible runtime target.                                |
| Next.js 16.x, App Router       | One TypeScript application for mobile pages, server rendering, Route Handlers, and metadata.           |
| React                          | Component model and ecosystem used by Next.js.                                                         |
| TypeScript 6 (strict)          | Latest compiler line supported by the selected Next.js ESLint toolchain; provides compile-time safety. |
| Tailwind CSS                   | Mobile-first styling utilities while retaining CSS design tokens.                                      |
| pnpm                           | Fast, deterministic installs with a strict dependency layout.                                          |
| ESLint + Prettier              | Static quality rules and consistent formatting.                                                        |
| Zod                            | Runtime validation at browser/server and external-service boundaries.                                  |
| React Hook Form                | Planned accessible form state with minimal rerenders; installed for upcoming form features.            |
| Lucide React                   | Consistent thin-stroke icons; installed but not needed by placeholders.                                |
| Vitest + React Testing Library | Fast domain and component tests in a browser-like environment.                                         |
| Playwright                     | Future mobile/desktop journey and browser regression tests.                                            |
| AWS CDK                        | Repeatable infrastructure with reviewed CloudFormation changes.                                        |
| Amazon S3 + DynamoDB           | Private photo bytes plus on-demand, short-lived upload state and rate limits.                          |
| Lambda + EventBridge           | Hourly privacy-retention cleanup without a continuously running server.                                |

## Versions

`package.json` defines the supported ranges and `pnpm-lock.yaml` records the exact installed versions. Run `pnpm list --depth 0` for the authoritative local list. This document should be updated after intentional upgrades. The project pins Node 24 through `.nvmrc` and `engines`; scaffold verification may also occur on a newer local Node runtime when Node 24 is unavailable.

## Planned external services

- Additional DynamoDB entities for jobs, attempts, purchases, and lifecycle metadata.
- Additional private S3 storage for generated previews and purchased HD files.
- Razorpay for UPI checkout, order management, and verified webhooks.
- An undecided AI image provider plus a local mock adapter.
- A transactional email provider for optional delivery.
- Privacy-safe product analytics/error monitoring.

No authentication, Razorpay, or AI SDK is installed yet. Worker-side AWS requests use the compact `aws4fetch` SigV4 client; Lambda uses the runtime-provided AWS SDK v3.

## Decisions intentionally postponed

The AI provider, email provider, analytics stack, generation-job mechanism, moderation service, and final generated-media retention periods remain postponed until their feature work and evaluation criteria are defined.

## Local development

- Node.js 24 and pnpm 10 or newer (the lockfile records the actual pnpm version).
- Copy `.env.example` to `.env.local` only when a future integration requires it. The initial scaffold needs no secrets.
- Use `pnpm install`, then `pnpm dev`; the local URL defaults to `http://localhost:3000`.

## Deployment assumptions

The exact Next.js AWS hosting topology remains open. It must provide immutable HTTPS deployments, server-only environment variables, an IAM execution role with least-privilege access to private S3 and DynamoDB, and observable serverless processing in the Mumbai region unless data-processing requirements dictate otherwise.

## Testing strategy

- Unit tests for schemas, pricing/configuration, state transitions, token-independent domain logic, and adapters.
- Component tests for accessibility and user-visible interaction states.
- Integration tests for Route Handlers, persistence, signed URL authorization, webhook verification, and idempotency using test doubles.
- Playwright tests for the critical mobile journey, refresh/back recovery, upload errors, delayed payment, and secure download; also a representative desktop smoke test.
- Contract tests for each image-provider implementation and scheduled cleanup.

## Security considerations

All browser input and external callbacks are untrusted. Secrets stay server-only; media is private; URLs are signed and short-lived; result tokens are high entropy; mutation endpoints are rate-limited and idempotent; webhooks are verified using raw bodies; file content is decoded and validated; logs are redacted; dependencies are kept minimal and reviewed; and retention cleanup is observable and retryable.

# Photo processing additions

- `@mediapipe/tasks-vision` 1.0.0 with a locally stored, versioned BlazeFace short-range model for browser-only face detection (Apache-2.0).
- `heic-to` 1.5.2 for lazy browser HEIC/HEIF conversion (LGPL-3.0).
- `sharp` for server signature-aware decoding, pixel/frame limits, metadata-free JPEG re-encoding, and face-crop quality verification.
- `aws4fetch` with small typed S3/DynamoDB adapters for Worker-side server operations and presigned URLs.

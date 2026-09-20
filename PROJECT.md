# Yaadon — Project Reference

## Product vision

Yaadon helps families create believable, emotionally meaningful festive and family portraits from one or two individual photographs. The experience should feel as simple as ordering a photo print: no prompt writing, model selection, or technical knowledge.

**Tagline:** “Turn two separate photos into one beautiful family memory.”

## Audience, problem, and value

The initial audience is Indian mothers and families arriving from Instagram or WhatsApp, often in an in-app mobile browser. Families may not have a good photograph of two loved ones together because of distance, loss, timing, or poor source photos. Yaadon provides a guided, culturally relevant way to combine two individual photos into a shareable portrait.

## MVP scope

The current MVP validation is a mobile-first, no-login web journey supporting one-child Janmashtami portraits, a two-adult Radha Krishna couple portrait, a Mother & Little Radha portrait generated from one combined mother-daughter photograph, and Retro portraits for individuals, couples, and a father-mother-toddler family. Retro couples and families use one combined source photograph. The creator combines template selection, the configured number of photo uploads, and consent on one scrollable screen. Generate navigates immediately to the special-moment screen, which owns the ₹29 Razorpay payment and paid generation experience. A verified, captured payment authorizes exactly one portrait generation. Progress is restored in the same browser and originals are automatically deleted under a documented retention policy.

Initial relationships, occasions, and templates live in central files under `src/config`; pages must not duplicate that data.

## Complete user flow

1. Arrive on `/` from a social or direct link and redirect directly to `/create`.
2. On `/create`, select a template and continue to its upload section. Child templates require one child photo, the Radha Krishna couple requires separate woman and man photos, Mother & Little Radha requires one combined mother-daughter photo, and Retro couple/family templates require one combined photo containing everyone. Confirm permission to use every photograph.
3. Select Generate Portrait and navigate immediately to `/create/generating`.
4. Complete the ₹29 Razorpay checkout; the same special-moment screen verifies the captured payment and automatically starts generation.
5. Open the non-guessable result URL at `/result/[jobToken]`.

The former relationship, upload, style, and review URLs redirect to `/create` for compatibility. There is no separate occasion selector in the approved unified MVP screen; templates can carry occasion or seasonal context until a separate occasion requirement is approved.

## Business model and pricing assumptions

The MVP uses a one-time ₹29 purchase for one AI portrait generation rather than subscriptions. The backend owns the 2,900-paise INR price and generation entitlement; the browser cannot submit or override the amount. Razorpay Test and Live modes are supported through explicit server configuration, with Test mode remaining the safe default. Production pricing, tax, refund, and Razorpay account approval remain launch decisions.

## Privacy principles

- Collect the minimum information needed to create and deliver a portrait.
- Never store image bytes in browser web storage.
- Keep source and generated media private and serve it through short-lived signed URLs.
- Explain retention before upload and automatically delete originals after the configured period.
- Use random session/job identifiers and high-entropy result tokens.
- Do not use customer photos for model training without explicit, separate consent.
- Do not expose secrets, storage keys, or payment verification to client code.

## MVP success metrics

- Relationship-selection-to-valid-upload completion rate.
- Valid-upload-to-generation completion rate and generation success rate.
- Preview-to-payment conversion rate.
- Median time from landing to previews and generation latency percentiles.
- Payment verification and HD download success rates.
- Recovery-link restoration success rate.
- Refund, support, upload-rejection, and privacy-deletion failure rates.
- Mobile Core Web Vitals and unhandled client/server error rates.

Exact launch targets require baseline usability testing and provider benchmarks.

## Out of scope for MVP

Accounts, login/signup, saved galleries, unstructured groups larger than the configured three-person Retro family, free-form prompts, user-selected AI models, subscriptions, physical printing, native apps, advanced editing, social feeds, public galleries, and training on customer images are out of scope.

## Current implementation status

The foundation, secure one- or two-photo upload flow, unified creator screen, and configurable Razorpay Test/Live payment gate are implemented. Browser face-count and photo-quality checks are advisory and never prevent a structurally safe image from being uploaded; when no single face is detected, the sanitized full photograph is sent as the identity reference. The active Janmashtami path offers the configured Krishna template collection and uses the backend-only OpenAI Images Edits API with `gpt-image-2`. Versioned WebP previews are served as local static frontend assets, while every template ID maps separately to its private generation master and S3 key. The private template is Image A (composition/style). Child templates use Image B for the child's identity; the Radha Krishna couple uses Image B for the woman and Image C for the man; Mother & Little Radha uses one combined mother-daughter photograph as Image B. Both multi-person modes include explicit independent face-preservation instructions. The generated PNG is copied into private S3 and delivered through the existing owned result route with a unique download filename. Payment and generation records reuse the existing DynamoDB table. Generation is rejected unless the backend finds a verified, captured ₹29 payment bound to that anonymous session, template, and generation job. Signed Razorpay webhooks reconcile captured, paid, and failed events idempotently. This Janmashtami flow does not call Magic Hour, face swap, or Gemini.

The earlier `rakhi-brother-sister-traditional-001` Magic Hour path and Makhan Chor configuration remain available only for backend compatibility; neither appears in the active template selector. Live payment activation still requires Razorpay account approval, live AWS secrets, automatic capture, webhook configuration, and an end-to-end production transaction.

## Relationship and seasonal configuration

Relationship content, order, enabled state, featured state, upload labels, imagery, badges, and suggested occasions are maintained in `src/config/relationships.ts`. The same file exports `seasonalCampaign`, which controls whether seasonal copy appears and which relationship receives the campaign badge and featured position. Campaign activation is manual; no date-based behavior exists yet.

After Janmashtami:

1. Set `seasonalCampaign.enabled` to `false`, or replace its message, badge, featured relationship, and suggested occasion for the next approved campaign.
2. Update the `featured` fields in `relationships` so exactly one enabled relationship is `true` for the non-campaign default.
3. Adjust `displayOrder` if the default ordering should change. Page components require no relationship-specific edits.

The safe browser draft uses the versioned key `yaadon:portrait-flow:v1` and stores the selected relationship, selected template, and opaque server upload metadata used to restore the flow. It never stores photograph bytes, filenames, previews, face coordinates, or private object keys; S3 and DynamoDB remain authoritative.

## Important open decisions

- OpenAI `gpt-image-2` identity preservation, child-safety behavior, moderation outcomes, latency, and per-generation cost for the Janmashtami template.
- Exact AWS deployment shape for the Next.js application and asynchronous generation workers.
- Exact generated-media retention period; original-photo default is currently assumed as 24 hours.
- Whether optional delivery email is deleted immediately after delivery or retained for support.
- Production pricing, taxes, refunds, dispute handling, and Razorpay live-mode approval.
- Operational payment alerts and a documented reconciliation/refund process before accepting real payments at scale.
- Watermark design, preview resolution, moderation policy, and content-safety thresholds.
- Rate limits and operational targets based on expected launch traffic.

## Production platform decision: AWS serverless

Yaadon will use AWS serverless services for production. Supabase is not an approved production dependency and must not be selected for storage, database, rate limiting, or scheduled cleanup in future product work.

The intended AWS direction is:

- Private Amazon S3 storage for raw uploads, sanitized uploads, generated previews, and purchased output, using short-lived presigned operations and no public buckets.
- AWS Lambda for privileged upload finalization, image validation, cleanup, and asynchronous processing where appropriate.
- Amazon API Gateway or the selected Next.js AWS deployment adapter for authenticated server boundaries; the exact web-hosting topology remains an implementation decision.
- Amazon DynamoDB for anonymous ownership records, job metadata, idempotency, retention deadlines, and durable rate-limit state unless a later architecture decision documents a better AWS-native fit.
- Amazon EventBridge Scheduler for retention cleanup and other scheduled maintenance.
- AWS KMS and Secrets Manager or Systems Manager Parameter Store for encryption and server-only secrets.
- Amazon CloudWatch for operational logs, metrics, alarms, and deletion-job visibility, without logging photograph bytes or sensitive image metadata.

The AWS account, primary region, budget controls, environments, and infrastructure-as-code approach must be established before replacing the transitional upload provider. Development and automated tests may continue using the in-memory provider. Production must fail clearly if the AWS provider or durable supporting services are not configured.

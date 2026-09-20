# Requirements

Labels: **MVP** is required for initial launch, **Later** is intentionally deferred, and **Out of scope** is not planned for the MVP.

## Functional requirements

### Guided portrait journey

- **MVP:** Provide the planned routes and a linear journey with safe back navigation.
- **MVP:** Allow exactly one relationship, one occasion, and one template from central predefined lists.
- **MVP:** Support exactly two people and one individual source photograph per person.
- **MVP:** Show upload labels that match the selected relationship.
- **MVP:** Review all selections before job submission; no prompt or model chooser is exposed.
- **Later:** Add new curated relationships, occasions, and templates through configuration.
- **Out of scope:** Free-form prompting and portraits containing more than two people.

### Preview and result

- **MVP:** Create three portrait previews and show progress without promising an exact completion time.
- **MVP:** Watermark every unpaid preview; paid HD files must not contain the preview watermark.
- **MVP:** Let a user buy one selected HD portrait or all three.
- **MVP:** Provide a non-guessable recovery/result URL and optional email delivery without an account.
- **Later:** Regeneration credits, detailed editing, and physical products.

### Configuration and content

- **MVP:** Keep pricing, relationships, occasions, templates, and upload restrictions outside UI components.
- **MVP:** Show clear privacy, consent, price, failure, and recovery messages.
- **Later:** Manage product configuration through a protected operations interface.

## Non-functional requirements

- **MVP:** Use strict TypeScript and validate untrusted input at every server boundary with shared schemas where useful.
- **MVP:** Be deployable on the selected AWS serverless Next.js topology using supported App Router features and Route Handlers.
- **MVP:** No client-side error may silently lose a valid server-side generation job.
- **MVP:** Production logs must exclude image bytes, signed URLs, secrets, and unnecessary personal data.

## Mobile and browser requirements

- **MVP:** Design mobile-first around a 375 px viewport and remain usable from 320 px upward.
- **MVP:** Work in current iOS Safari, Android Chrome, and Instagram's in-app browser; avoid reliance on pop-ups, downloads that require a new window, or unsupported browser APIs.
- **MVP:** Respect safe-area insets; primary controls remain reachable above mobile browser chrome and virtual keyboards.
- **MVP:** Interactive targets are at least 44 by 44 CSS pixels; desktop content uses a bounded responsive container.
- **Later:** Native mobile applications.

## Accessibility

- **MVP:** Target WCAG 2.2 AA for contrast, keyboard operation, visible focus, semantics, labels, errors, and status announcements.
- **MVP:** Provide text alternatives for meaningful imagery, reduced-motion behavior, and instructions not based on color alone.
- **MVP:** Upload, generation, payment, and download states must be understandable with a screen reader.

## Performance

- **MVP:** Target Core Web Vitals “good” thresholds at the 75th percentile on mobile: LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.1, excluding third-party checkout limitations.
- **MVP:** Keep the initial journey lightweight; resize/compress only safe client previews while validating originals on the server.
- **MVP:** Use direct-to-private-storage uploads with short-lived authorization when implemented, avoiding image payloads through browser storage.
- **Later:** Provider-region optimization based on production traffic.

## Upload requirements

- **MVP:** Accept exactly two JPEG, PNG, or WebP files, currently capped at 10 MiB each by configuration.
- **MVP:** Validate declared MIME type, decoded file signature/type, byte size, dimensions, corruption, and basic image safety on the server.
- **MVP:** Reject unsupported or invalid content with a recoverable, person-specific message.
- **MVP:** Strip unnecessary metadata before downstream use where feasible and never trust a filename or extension.
- **Later:** HEIC support after compatibility and conversion evaluation.

## Anonymous session requirements

- **MVP:** Create a cryptographically random anonymous session ID, generation job ID, and separate high-entropy result token.
- **MVP:** Restore non-sensitive flow state in the same browser after refresh/back navigation; reconcile it with authoritative server state.
- **MVP:** Never store image blobs, secrets, signed URLs, or payment proof in localStorage/sessionStorage.
- **MVP:** Issue a recovery URL for each submitted generation and expire/revoke access according to retention policy.
- **MVP:** Rotate or hash bearer-style tokens at rest where practical and rate-limit token lookups.
- **Out of scope:** Authentication libraries, user accounts, and cross-device account sync.

## Payment requirements

- **MVP:** Present configurable INR pricing and Razorpay UPI checkout only after previews exist.
- **MVP:** Treat the browser callback as untrusted; verify order, amount, currency, signature, and payment status server-side.
- **MVP:** Verify webhook signatures against the raw body, process events idempotently, and grant HD access once only.
- **MVP:** Handle pending, failed, cancelled, duplicate, delayed-webhook, and already-paid states without double charging.
- **Later:** Additional payment methods, subscriptions, coupons, and regional currencies.

## AI generation requirements

- **MVP:** Hide provider-specific behavior behind `ImageGenerationProvider` and support a deterministic local mock.
- **MVP:** Keep the real provider undecided until quality, identity preservation, latency, safety, privacy, cost, and commercial terms are evaluated.
- **MVP:** Track attempts separately from the logical job, use idempotency, bound retries, and watermark previews in a trusted server pipeline.
- **MVP:** Ensure provider credentials and original storage locations never reach the browser.
- **Later:** Multiple-provider routing and advanced editing.

## Privacy and security

- **MVP:** Use HTTPS, secure cookies where cookies are used, CSRF-aware mutation design, rate limiting, abuse detection, and least-privilege service credentials.
- **MVP:** Keep object storage private; authorize each object and return short-lived signed URLs.
- **MVP:** Automatically delete originals after the configured retention period and cascade deletion when a user invokes future deletion controls.
- **MVP:** Record deletion outcomes without retaining the deleted content; alert on cleanup failures.
- **MVP:** Obtain confirmation that the uploader has permission to use both photos and publish a clear privacy notice.
- **Later:** Formal compliance certifications.

## Error and recovery

- **MVP:** Preserve completed steps after refresh/back navigation and resume active jobs from server state.
- **MVP:** Make upload retries resumable or safely repeatable and generation/payment mutations idempotent.
- **MVP:** Give actionable errors with retry, replace-photo, return-to-step, or support paths as appropriate.
- **MVP:** Expired or invalid result links reveal no job existence or personal information.

## Overall MVP acceptance criteria

The MVP is accepted when a new anonymous mobile user can complete the entire flow with two valid individual photos, recover after refresh, receive three watermarked previews, complete a correctly priced verified UPI payment, and securely download the purchased HD result. Invalid uploads and all defined error states are recoverable; unauthorized users cannot access private media or guess result links; scheduled cleanup demonstrably removes originals; accessibility, supported-browser, performance, security, unit/integration, and representative end-to-end checks pass; and no account, prompt, model selector, or forbidden SDK has been introduced.

# Implemented MVP photo upload requirements

The second flow step requires exactly two individual, relationship-labelled photographs. JPEG, PNG, static WebP, HEIC and HEIF inputs are normalized locally; unsupported, mismatched, animated, oversized, over-pixel and undersized files are rejected. MediaPipe checks face count and framing locally. Face-region sharpness and brightness produce pass, overrideable warning, or severe failure outcomes. Both server-validated assets plus explicit permission consent are required to continue.

Uploads are owned by a random HttpOnly anonymous session and pass through private raw and sanitized storage. The server distrusts filenames, MIME, browser measurements and client quality outcomes. No image bytes, face data, original names or signed URLs may enter web storage.

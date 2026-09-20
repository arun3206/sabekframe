# Coding instructions

- Read `PROJECT.md` before making product decisions.
- Implement only the requested feature; preserve unrelated work.
- Do not introduce login or signup in the MVP.
- Keep the experience mobile-first and reliable in Instagram's in-app browser.
- Do not hardcode prices, relationship, occasion, template, or upload data inside components; use `src/config`.
- Keep secrets, privileged service clients, verification, and private object keys out of client components.
- Use semantic, keyboard-accessible components with visible focus and 44 px minimum touch targets.
- Keep domain types and logic independent from React when practical; add tests for new domain logic.
- Validate untrusted input at server boundaries and make external mutations idempotent.
- Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` before finishing.
- Do not silently change requirements. Document and raise a conflict or open decision instead.
- Do not add external SDKs until the feature that needs them is explicitly requested.

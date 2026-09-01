# 08 — README documentation and deployment flow alignment

**What to build:** Updated `README.md` reflecting the exact codebase reality: non-fragile test coverage description, unmodified YAML pass-through explanation, complete zero-to-one deployment guide for `workers.dev` without requiring custom domains, and accurate endpoint documentation for `/clash`, `/status`, and `/healthz`.

**Blocked by:** 06 — HTTP method contracts for /status and /clash

**Status:** resolved

- [x] Removed fixed test count phrases (e.g. `100+ tests`) and replaced with descriptive summary of coverage areas
- [x] Removed all `Byte-for-Byte Fidelity` / `byte-identical` / `binary-identical` wording; replaced with `Unmodified YAML Pass-through` explaining string pass-through without parsing or injection
- [x] Deployment flow covers `npm install`, `.dev.vars` setup, `npm run dev`, `npm test`, `npm run typecheck`, `npx wrangler secret put ...`, `npm run deploy`, and final `workers.dev` endpoint URL
- [x] Documented `/clash` (GET, HEAD, response headers, degradation mode), `/status` (GET, counter metrics), and `/healthz` (GET, no auth, no upstream) contracts accurately

## Answer

Aligned `README.md` with the exact implementation and SPEC specifications:
- Replaced "100+ tests" with "Comprehensive automated test coverage" and detailed breakdown of tested domains (auth, routing/method contracts, bandwidth parsing, normalization, GET/HEAD semantics, upstream failures, degradation, headers, security).
- Removed "Byte-for-Byte Fidelity" / "byte-for-byte" claims and updated to "Unmodified YAML Pass-through" explaining that the upstream YAML text content is returned unchanged without parsing or injection.
- Formatted complete zero-to-one deployment flow for `workers.dev` without requiring custom domains.
- Documented full API endpoint contracts for `/clash` (GET & HEAD, headers, degradation mode, 405s), `/status` (GET only, counter status metrics, 405s), and `/healthz` (unauthenticated, zero upstream access).

## Comments

Source: `.scratch/jms-flclash-bridge/spec.md`. Sections 3, 4, 5, 6.

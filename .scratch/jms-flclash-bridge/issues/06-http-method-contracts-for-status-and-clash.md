# 06 — HTTP method contracts for /status and /clash

**What to build:** Strict HTTP method validation and 405 Method Not Allowed handling on `/status` (only GET allowed; POST/HEAD/PUT/etc. rejected with `Allow: GET` and `{"error":"method_not_allowed"}` without triggering upstream fetch) and `/clash` (only GET and HEAD allowed; POST/PUT/DELETE/etc. rejected with `Allow: GET, HEAD` and `{"error":"method_not_allowed"}` without triggering upstream fetch).

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] `GET /status` with valid token continues to work normally and returns bandwidth metrics
- [x] `POST /status`, `HEAD /status`, `PUT /status`, `PATCH /status`, `DELETE /status` return HTTP 405 with `Allow: GET`, `Content-Type: application/json`, and body `{"error":"method_not_allowed"}`
- [x] Unsupported `/status` methods do NOT invoke upstream JMS fetch
- [x] `GET /clash` and `HEAD /clash` continue to work normally (GET returns YAML body + headers, HEAD returns empty body + headers)
- [x] `POST /clash`, `PUT /clash`, `PATCH /clash`, `DELETE /clash` return HTTP 405 with `Allow: GET, HEAD`, `Content-Type: application/json`, and body `{"error":"method_not_allowed"}`
- [x] Unsupported `/clash` methods do NOT invoke upstream JMS fetch
- [x] Automated tests cover all allowed and disallowed methods for `/status` and `/clash`

## Answer

Implemented strict 405 Method Not Allowed handling with accurate `Allow` header lists in `src/index.ts`.
- `/status` only accepts `GET`. Any other method (`POST`, `HEAD`, `PUT`, `PATCH`, `DELETE`) immediately returns `405 Method Not Allowed` with `Allow: GET` and `{"error":"method_not_allowed"}` without invoking upstream fetch.
- `/clash` only accepts `GET` and `HEAD`. Any other method (`POST`, `PUT`, `PATCH`, `DELETE`) immediately returns `405 Method Not Allowed` with `Allow: GET, HEAD` and `{"error":"method_not_allowed"}` without invoking upstream fetch.
- Added comprehensive unit and integration tests in `test/worker.test.ts` verifying all allowed and disallowed verbs, correct status codes, headers, bodies, and confirming that upstream fetch is never called for unsupported methods.

## Comments

Source: `.scratch/jms-flclash-bridge/spec.md`. Sections 1, 2, 11.

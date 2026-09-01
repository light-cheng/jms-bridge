# 04 — Clash subscription bridge (GET & HEAD) with graceful degradation

**What to build:** The core subscription bridge endpoint `/clash` supporting GET and HEAD requests with parallel upstream fetching, byte-for-byte YAML preservation, `subscription-userinfo` header injection, and graceful degradation on bandwidth API failure.

**Blocked by:** 02 — Authentication and security guard, 03 — Bandwidth parsing, normalization, and status endpoint

**Status:** resolved

- [x] Parallel fetch (`Promise.all` with 15s timeout) retrieves `JMS_SUB_URL` and `JMS_BW_URL`
- [x] `GET /clash?token=<ACCESS_TOKEN>` returns unmodified JMS Mihomo YAML body with `subscription-userinfo`, `Content-Type: text/yaml; charset=utf-8`, `profile-title: Just My Socks`, `profile-update-interval: 6`, `Cache-Control: no-store`, and `X-JMS-Bandwidth-Status: ok`
- [x] Graceful degradation: if Bandwidth API fails or returns invalid JSON, returns HTTP 200 with raw YAML, `X-JMS-Bandwidth-Status: unavailable`, and no `subscription-userinfo`
- [x] If subscription upstream fails, returns HTTP 502 Bad Gateway
- [x] `HEAD /clash?token=<ACCESS_TOKEN>` returns identical HTTP headers with an empty body
- [x] Automated tests verify YAML body fidelity, header presence, timeout handling, upstream failure, and HEAD semantics

## Answer

Implemented `/clash` endpoint handler in `src/clash.ts` and integrated with `src/index.ts`.
- Parallel upstream fetching with 15s AbortController timeout (`fetchSubscriptionYaml` and `fetchBandwidthData`).
- Preserves raw JMS Mihomo YAML body byte-for-byte without rewriting or injecting extra configuration.
- Calculates normalized download and total bytes (`normalizeJmsBytesForClash`) and formats `subscription-userinfo` header with `expire=0`.
- Implements graceful degradation when Bandwidth API fails, returning raw YAML with `X-JMS-Bandwidth-Status: unavailable` and omitting `subscription-userinfo`.
- Returns HTTP 502 `{"error":"subscription_upstream_failed"}` when subscription fetch fails.
- Supports `HEAD /clash` with identical response headers and null/empty body.
- Full test coverage in `test/clash.test.ts` and `test/worker.test.ts` (103 passing tests across the test suite).

## Comments

Source: `# SPEC: JMS FlClash Subscription Bridge`. Sections 3, 8, 9, 10, 12, 14.


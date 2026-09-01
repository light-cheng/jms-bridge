# 07 — Security audit, bandwidth parsing, GB normalization, and test suite matrix

**What to build:** Comprehensive verification and hardening of Bandwidth Counter validation rules (finite, >= 0, reset day 1-31 integer), decimal GB display normalization formula (`Math.round(jmsBytes * 1.073741824)`), graceful degradation matrix, error/log masking (no secret URLs or tokens in outputs), and clean test suite coverage matching all required SPEC scenarios.

**Blocked by:** 06 — HTTP method contracts for /status and /clash

**Status:** resolved

- [x] Bandwidth parser strictly validates `monthly_bw_limit_b`, `bw_counter_b` (finite, >= 0), and `bw_reset_day_of_month` (integer 1-31)
- [x] Decimal GB display normalization formula correctly calculates `500000000000 -> 536870912000` and `125000000000 -> 134217728000` preserving 25% ratio and `expire=0`
- [x] Graceful degradation behaves correctly: Subscription OK + Bandwidth FAIL returns 200 OK + YAML with `X-JMS-Bandwidth-Status: unavailable` and no `subscription-userinfo`; Subscription FAIL returns 502 Bad Gateway
- [x] Error responses and logs never leak `JMS_SUB_URL`, `JMS_BW_URL`, service IDs, UUIDs, or ACCESS_TOKEN
- [x] Repository tracked files confirmed free of real secrets; `.dev.vars` is in `.gitignore`; `.dev.vars.example` contains only placeholders
- [x] Automated test suite cleanly covers all required scenarios from SPEC Section 11 without duplicates or external network calls

## Answer

Audited and verified all core security boundaries, parsing logic, and test coverage:
1. Bandwidth parser strictly enforces `monthly_bw_limit_b` and `bw_counter_b` to be non-negative finite numbers, and `bw_reset_day_of_month` (when present) to be an integer between 1 and 31.
2. Decimal GB normalization formula `Math.round(jmsBytes * 1.073741824)` accurately computes 500GB -> 536870912000 and 125GB -> 134217728000 (maintaining 25% usage ratio), and `formatSubscriptionUserinfo` ensures `expire=0`.
3. Graceful degradation correctly returns 200 OK with raw YAML and `X-JMS-Bandwidth-Status: unavailable` (without `subscription-userinfo`) when bandwidth counter fails, and returns 502 when subscription upstream fails.
4. Error responses and loggers contain sanitized error codes (`subscription_upstream_failed`, `bandwidth_upstream_failed`, `unauthorized`, `method_not_allowed`) without secret URLs, service IDs, UUIDs, or access tokens.
5. All tracked files were scanned with ripgrep to confirm no real secrets are tracked. `.dev.vars` is verified gitignored, and `.dev.vars.example` contains only placeholder values.
6. Full test suite (111 tests) cleanly verifies all matrix requirements using mocked `fetch()`.

## Comments

Source: `.scratch/jms-flclash-bridge/spec.md`. Sections 7, 8, 9, 10, 11, 17.

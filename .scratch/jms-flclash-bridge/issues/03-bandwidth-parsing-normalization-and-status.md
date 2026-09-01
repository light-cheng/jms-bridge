# 03 — Bandwidth parsing, normalization, and status endpoint

**What to build:** JMS Bandwidth Counter API response parser with validation, decimal GB display normalization (`normalizeJmsBytesForClash`), `subscription-userinfo` header generator, and authenticated `GET /status` inspection endpoint.

**Blocked by:** 02 — Authentication and security guard

**Status:** resolved

- [x] Parser validates `monthly_bw_limit_b`, `bw_counter_b` (finite, >= 0), and `bw_reset_day_of_month` (1-31)
- [x] Decimal GB display normalization formula (`jmsBytes * 1073741824 / 1000000000` rounded) converts values correctly (e.g. 500GB -> 536870912000, 125GB -> 134217728000)
- [x] `subscription-userinfo` header is formatted as `upload=0; download=<used>; total=<total>; expire=0`
- [x] `GET /status?token=<ACCESS_TOKEN>` returns sanitized JSON metrics (`used_bytes`, `total_bytes`, `remaining_bytes`, `used_percent`, `reset_day`) without leaking secrets
- [x] Unit tests cover normal conversion, zero usage, invalid payload formats, negative numbers, and boundary values

## Answer

Implemented JMS Bandwidth Counter parser, decimal GB normalization (Math.round(jmsBytes * 1.073741824)), subscription-userinfo header formatter, GET /status endpoint, and comprehensive unit tests.

## Comments

Source: `# SPEC: JMS FlClash Subscription Bridge`. Sections 3, 5, 6, 7, 14.

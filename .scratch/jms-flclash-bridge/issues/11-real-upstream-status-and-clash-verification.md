# 11 — Real JMS upstream /status and /clash (GET & HEAD) verification

**What to build:** Live end-to-end smoke verification against real Just My Socks services: testing real `/status` bandwidth parsing, real `GET /clash` YAML fetching with `subscription-userinfo` and `X-JMS-Bandwidth-Status: ok`, YAML pass-through comparison with direct upstream response, traffic normalization ratio consistency, real `HEAD /clash` with empty body, and authentication smoke check (401 on invalid token).

**Blocked by:** 10 — Secret protection audit and local runtime environment

**Status:** resolved

- [x] Real `GET /status?token=<ACCESS_TOKEN>` returns HTTP 200 with valid Bandwidth Counter metrics (`used_bytes`, `total_bytes`, `remaining_bytes`, `used_percent`, `reset_day`) consistent with JMS portal
- [x] Real `GET /clash?token=<ACCESS_TOKEN>` returns HTTP 200, `subscription-userinfo: upload=0; download=...; total=...; expire=0`, and `X-JMS-Bandwidth-Status: ok`
- [x] Real `GET /clash` body is valid JMS Mihomo YAML and matches direct upstream YAML (`diff -u /tmp/jms-upstream.yaml /tmp/jms-bridge.yaml` shows no config rewrite)
- [x] `subscription-userinfo` normalized `download / total` ratio exactly matches `/status` `used_bytes / total_bytes` ratio
- [x] Real `HEAD /clash?token=<ACCESS_TOKEN>` returns HTTP 200, all key headers present, and empty body (0 bytes)
- [x] Invalid tokens on `/status` and `/clash` return HTTP 401 without upstream access

## Answer

Executed full live smoke verification against real Just My Socks endpoints via local Worker:
1. `GET /status`: Returned HTTP 200 with valid counter JSON metrics (`used_bytes`, `total_bytes`, `remaining_bytes`, `used_percent`, `reset_day`), verified all assertions (non-negative, bounds, valid reset day).
2. `GET /clash`: Returned HTTP 200 with valid `subscription-userinfo: upload=0; download=...; total=...; expire=0`, `X-JMS-Bandwidth-Status: ok`, and valid YAML configuration (106 lines).
3. YAML Pass-through: Direct upstream fetch matched the bridge YAML response 100% (diff was empty, 0 differences).
4. Traffic Normalization Ratio: Header usage ratio matched `/status` usage ratio precisely.
5. `HEAD /clash`: Returned HTTP 200 with `subscription-userinfo`, `profile-title`, `profile-update-interval`, `X-JMS-Bandwidth-Status: ok`, and an empty body (0 bytes).
6. Authentication: Invalid tokens returned HTTP 401 on both `/status` and `/clash`.

## Comments

Source: `.scratch/jms-flclash-bridge/spec.md`. Sections 6, 7, 8, 9, 10, 11.

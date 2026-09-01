# 02 — Authentication and security guard

**What to build:** Token authentication middleware guarding protected endpoints via `?token=<ACCESS_TOKEN>` and `Authorization: Bearer <ACCESS_TOKEN>`, short-circuiting with HTTP 401 on failure and protecting secrets from leaking into logs or errors.

**Blocked by:** 01 — Project scaffolding and health check baseline

**Status:** resolved

- [x] Requests to protected endpoints with valid `?token=<ACCESS_TOKEN>` or `Authorization: Bearer <ACCESS_TOKEN>` pass authentication
- [x] Requests with invalid or missing token immediately return HTTP 401 `{"error":"unauthorized"}` without sending any upstream request
- [x] Error messages, responses, and logs never expose `ACCESS_TOKEN`, `JMS_SUB_URL`, `JMS_BW_URL`, service IDs, or UUIDs
- [x] Unit and endpoint tests verify valid, missing, and invalid token scenarios

## Answer

Implemented timing-safe token authentication middleware supporting ?token= query and Bearer header, 401 unauthorized response helper, route guard, and comprehensive unit tests.

## Comments

Source: `# SPEC: JMS FlClash Subscription Bridge`. Sections 2, 4, 11, 14, 17.

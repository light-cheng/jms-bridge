# JMS FlClash Subscription Bridge

A lightweight, stateless Cloudflare Worker subscription bridge for Just My Socks (JMS). It seamlessly fetches official Mihomo / Clash.Meta configuration alongside the Bandwidth Counter API, normalizes traffic metrics, and injects standard `subscription-userinfo` headers so that **FlClash**, **Clash Verge**, **Mihomo Party**, and other Mihomo/Clash clients display your plan quota and usage in their subscription cards.

---

## Overview & Architecture

### The Problem

Just My Socks provides official Mihomo / Clash.Meta subscription URLs and a separate Bandwidth Counter API. However, the subscription endpoint does not return the `subscription-userinfo` HTTP header. As a result, clients like FlClash show an empty or missing data usage bar.

### The Solution

This Cloudflare Worker acts as a lightweight proxy and header bridge:

```text
Just My Socks
     │
     ├── 官方 Mihomo YAML Subscription
     │
     └── Bandwidth Counter API
              │
              ▼
    Cloudflare Worker (Stateless)
              │
              ▼
https://<worker>.workers.dev/clash?token=<ACCESS_TOKEN>
              │
              ▼
   FlClash / Mihomo Clients
   (Displays: XX GB / XXX GB)
```

### Key Highlights

- **Unmodified YAML Pass-through**: The worker does not parse, rewrite, rename, or inject configuration into the upstream JMS Mihomo YAML. The upstream YAML text content is returned unchanged during normal operation.
- **Accurate Traffic Normalization**: Automatically converts JMS decimal gigabytes ($10^9$ bytes) to binary gigabytes ($1024^3$ bytes) so clients display the exact nominal package quota (e.g. 500 GB displays as 500 GB rather than 465 GiB).
- **Graceful Degradation**: If the Bandwidth Counter API is slow or temporarily unavailable, the worker still serves the YAML subscription (`200 OK`) with `X-JMS-Bandwidth-Status: unavailable` so proxy connections never drop.
- **Zero Heavy Infrastructure**: Runs entirely on Cloudflare Workers free tier without KV, D1, R2, Durable Objects, Docker, or external VPS servers. Works directly on `*.workers.dev` domains without requiring custom domains.
- **HEAD Request Support**: Fully supports `HEAD /clash` for clients performing lightweight header-only profile refreshes.

---

## Prerequisites

- **macOS / Linux / Windows** with bash/zsh.
- **Node.js**: v18.0.0 or later (v20+ recommended).
- **npm**: v9.0.0 or later.
- **Cloudflare Account**: [Sign up for free](https://dash.cloudflare.com/sign-up).
- **Cloudflare Wrangler CLI**: Logged in via `npx wrangler login`.

---

## Quick Start / Deployment Flow

Follow these steps from a fresh clone to deploy your worker:

### 1. Installation

Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd "JMS FlClash Subscription Bridge"
npm install
```

### 2. Local Configuration

Create a local environment variables file from the example template:

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` with your actual Just My Socks credentials and a custom access token:

```ini
JMS_SUB_URL="https://jmssub.net/members/getsub.php?service=000000&id=00000000-0000-0000-0000-000000000000"
JMS_BW_URL="https://justmysocks6.net/members/getbwcounter.php?service=000000&id=00000000-0000-0000-0000-000000000000"
ACCESS_TOKEN="your-chosen-secret-token"
```

> **Where to find JMS URLs:**
> - Log in to your **Just My Socks Client Area** → **Services** → **My Services** → select your active service.
> - Find the **Mihomo / Clash.Meta Subscription URL** (for `JMS_SUB_URL`).
> - Navigate to **API – Bandwidth Counter** to find the API URL (for `JMS_BW_URL`).

### 3. Local Run

Start the local development server:

```bash
npm run dev
```

The worker will start locally at `http://localhost:8787`.

### 4. Automated Tests & Type Check

Verify the implementation locally:

```bash
# Run unit & integration test suite (comprehensive automated coverage)
npm test

# Run TypeScript static type checking
npm run typecheck

# Verify Cloudflare Worker bundle compilation
npx wrangler deploy --dry-run
```

### 5. Configure Cloudflare Secrets

Production secrets are securely stored encrypted on Cloudflare and must **never** be checked into version control.

Set your secrets via Wrangler:

```bash
# 1. Set your Just My Socks Mihomo subscription URL
npx wrangler secret put JMS_SUB_URL

# 2. Set your Just My Socks Bandwidth Counter API URL
npx wrangler secret put JMS_BW_URL

# 3. Set your custom Access Token (e.g. generate with `openssl rand -hex 16`)
npx wrangler secret put ACCESS_TOKEN
```

When prompted, paste each corresponding value.

### 6. Deploy to Cloudflare

Deploy your Cloudflare Worker:

```bash
npm run deploy
```

Upon successful deployment, Wrangler outputs your public Worker endpoint:

```text
Uploaded jms-flclash-bridge (X.XX KiB)
Published jms-flclash-bridge (X.XX sec)
  https://jms-flclash-bridge.<your-subdomain>.workers.dev
```

> **No Custom Domain Required:** The worker runs directly on `https://<worker>.<your-subdomain>.workers.dev`.

### 7. FlClash Client Setup

1. Construct your personal subscription URL:

   ```text
   https://<worker-name>.<your-subdomain>.workers.dev/clash?token=<ACCESS_TOKEN>
   ```

2. Configure in your client:
   - **FlClash**: Go to **Profiles** (配置) → Click **+** (Add) → Choose **URL** → Enter Name (`Just My Socks`) and paste the URL → Save & Update.
   - **Clash Verge / Mihomo Party**: Go to **Profiles** (订阅) → Import Remote Subscription → Paste the URL → Save & Update.

3. Verify: The profile card will now display your used quota and total package traffic (e.g., `125 GB / 500 GB`).

---

## API Endpoints Documentation

### 1. `/clash` — Subscription Bridge
- **Methods**: `GET`, `HEAD` (Other methods return `405 Method Not Allowed` with `Allow: GET, HEAD`)
- **Authentication**: Required (`?token=<ACCESS_TOKEN>` or `Authorization: Bearer <ACCESS_TOKEN>`)

**Request**:
```http
GET /clash?token=<ACCESS_TOKEN>
HEAD /clash?token=<ACCESS_TOKEN>
```

**Normal Response (HTTP 200)**:
- **Headers**:
  ```http
  Content-Type: text/yaml; charset=utf-8
  subscription-userinfo: upload=0; download=<used>; total=<total>; expire=0
  profile-title: Just My Socks
  profile-update-interval: 6
  X-JMS-Bandwidth-Status: ok
  Cache-Control: no-store
  ```
- **Body (GET)**: Unmodified upstream JMS Mihomo YAML.
- **Body (HEAD)**: Empty (0 bytes).

**Degraded Response (Bandwidth Counter Unavailable)**:
- If the Bandwidth Counter API is unreachable or returns invalid data while subscription YAML succeeds:
  - Status: `HTTP 200`
  - Body: Unmodified upstream JMS Mihomo YAML returned normally.
  - Header: `X-JMS-Bandwidth-Status: unavailable` (`subscription-userinfo` omitted).

**Subscription Failure**:
- If the upstream JMS subscription fetch fails: `HTTP 502 Bad Gateway` (`{"error":"subscription_upstream_failed"}`).

---

### 2. `/status` — Bandwidth Counter Status
- **Method**: `GET` only (POST, HEAD, PUT, PATCH, DELETE return `405 Method Not Allowed` with `Allow: GET`)
- **Authentication**: Required (`?token=<ACCESS_TOKEN>` or `Authorization: Bearer <ACCESS_TOKEN>`)

**Request**:
```http
GET /status?token=<ACCESS_TOKEN>
```

**Response (HTTP 200)**:
```json
{
  "used_bytes": 125000000000,
  "total_bytes": 500000000000,
  "remaining_bytes": 375000000000,
  "used_percent": 25,
  "reset_day": 16
}
```

*Note: Returns the current JMS Bandwidth Counter status metrics without exposing upstream URLs or tokens.*

---

### 3. `/healthz` — Service Health Check
- **Method**: `GET`
- **Authentication**: Not required.
- **Upstream Access**: Does NOT access any JMS upstream services.

**Request**:
```http
GET /healthz
```

**Response (HTTP 200)**:
```json
{
  "status": "ok"
}
```

---

## Test Suite & Quality Assurance

Comprehensive automated test coverage validates all layers using mocked upstream responses (no real external requests):

- **Authentication**: Query token, Bearer header, missing tokens, invalid tokens, timing-safe equality.
- **Routing & Method Contracts**: Strict HTTP verbs on `/clash` (GET/HEAD), `/status` (GET only), `/healthz`, 405 Method Not Allowed handling with `Allow` headers, and 404 fallbacks.
- **Bandwidth Parsing**: Non-negative finite numbers, integer reset day validation (1-31), malformed payload handling.
- **Traffic Normalization**: Decimal GB to binary GiB conversion formula (`jmsBytes * 1.073741824`), exact ratio preservation, `expire=0`.
- **GET / HEAD Semantics**: Full YAML delivery for GET, empty body with identical headers for HEAD.
- **Upstream Failures & Graceful Degradation**: Bandwidth downtime fallback, subscription 502 Bad Gateway, timeout handling.
- **Security Boundaries**: Zero credential or URL leakage in headers, bodies, logs, or error responses.

---

## Post-Deployment Verification Guide

You can verify all endpoints using `curl`:

### 1. Health Check
```bash
curl -i "https://<worker>.workers.dev/healthz"
```
**Expected**: `HTTP/2 200` with body `{"status":"ok"}`.

### 2. Status Endpoint
```bash
curl -i "https://<worker>.workers.dev/status?token=<ACCESS_TOKEN>"
```
**Expected**: `HTTP/2 200` with JSON bandwidth counter metrics.

### 3. Subscription GET Request
```bash
curl -sS -D /tmp/jms-headers.txt -o /tmp/jms.yaml "https://<worker>.workers.dev/clash?token=<ACCESS_TOKEN>"
```
**Expected**:
- Status `HTTP/2 200`
- Headers contain `subscription-userinfo: upload=0; download=...; total=...; expire=0` and `X-JMS-Bandwidth-Status: ok`
- `/tmp/jms.yaml` contains valid JMS Mihomo YAML.

### 4. Subscription HEAD Request
```bash
curl -I "https://<worker>.workers.dev/clash?token=<ACCESS_TOKEN>"
```
**Expected**:
- Status `HTTP/2 200`
- `subscription-userinfo` header present
- Body is empty (0 bytes).

---

## Security & Credentials Notice

- **Treat URLs as Passwords**: Both `JMS_SUB_URL` and `JMS_BW_URL` contain your secret Just My Socks Service ID and UUID. Treat them with the same sensitivity as account passwords.
- **Accidental Compromise / Revocation**: If your JMS subscription URL or UUID is ever leaked, log in to the Just My Socks Client Area, navigate to your service, and **change your service password**. This immediately invalidates the old UUID. Then update your Cloudflare Worker secrets.
- **Constant-Time Authentication**: Token authentication is performed with constant-time byte comparison (`timingSafeEqual`) to prevent timing side-channel attacks.
- **Never Commit Secrets**: `.dev.vars` is strictly excluded in `.gitignore`. Never commit `.dev.vars`, real UUIDs, or access tokens into source control.
- **No Secret Leakage**: The worker suppresses upstream URLs and raw authorization values from error responses and logs.

---

## Non-Goals & Scope Limits

This project is strictly designed as a high-reliability, single-purpose subscription and bandwidth header bridge. It intentionally does **not**:

- Modify YAML nodes, inject custom routing rules, or rewrite DNS configurations.
- Convert between arbitrary proxy formats (Surge, Quantumult X, Loon, Sing-box).
- Require stateful storage (Cloudflare KV, D1, R2, or Durable Objects).
- Provide a web admin UI or multi-user database.

---

## License

MIT

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

- **Byte-for-Byte Fidelity**: Proxies and returns the official JMS Mihomo YAML body without altering proxies, renaming nodes, or injecting arbitrary rule sets.
- **Accurate Traffic Normalization**: Automatically converts JMS decimal gigabytes ($10^9$ bytes) to binary gigabytes ($1024^3$ bytes) so clients display the exact nominal package quota (e.g. 500 GB displays as 500 GB rather than 465 GiB).
- **Graceful Degradation**: If the Bandwidth Counter API is slow or temporarily unavailable, the worker still serves the YAML subscription (`200 OK`) with `X-JMS-Bandwidth-Status: unavailable` so proxy connections never drop.
- **Zero Heavy Infrastructure**: Runs entirely on Cloudflare Workers free tier without KV, D1, R2, Durable Objects, Docker, or external VPS servers.
- **HEAD Request Support**: Fully supports `HEAD /clash` for clients performing lightweight header-only profile refreshes.

---

## Prerequisites

- **macOS / Linux / Windows** with bash/zsh.
- **Node.js**: v18.0.0 or later (v20+ recommended).
- **npm**: v9.0.0 or later.
- **Cloudflare Account**: [Sign up for free](https://dash.cloudflare.com/sign-up).
- **Cloudflare Wrangler CLI**: Logged in via `npx wrangler login`.

---

## Installation

Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd "JMS FlClash Subscription Bridge"
npm install
```

---

## Local Development

1. Create a local environment variables file from the example template:

   ```bash
   cp .dev.vars.example .dev.vars
   ```

2. Edit `.dev.vars` with your actual Just My Socks credentials and a custom access token:

   ```ini
   JMS_SUB_URL="https://jmssub.net/members/getsub.php?service=000000&id=00000000-0000-0000-0000-000000000000"
   JMS_BW_URL="https://justmysocks6.net/members/getbwcounter.php?service=000000&id=00000000-0000-0000-0000-000000000000"
   ACCESS_TOKEN="your-chosen-secret-token"
   ```

   > **Where to find JMS URLs:**
   > - Log in to your **Just My Socks Client Area** → **Services** → **My Services** → select your active service.
   > - Find the **Mihomo / Clash.Meta Subscription URL** (for `JMS_SUB_URL`).
   > - Navigate to **API – Bandwidth Counter** to find the API URL (for `JMS_BW_URL`).

3. Start the local development server:

   ```bash
   npm run dev
   ```

   The worker will start locally at `http://localhost:8787`.

---

## Testing & Verification

Run the comprehensive test suite and type check:

```bash
# Run unit & integration tests (100+ tests covering auth, bandwidth, clash endpoints)
npm test

# Run TypeScript static type checking
npm run typecheck

# Verify Cloudflare Worker bundle compilation
npx wrangler deploy --dry-run
```

---

## Cloudflare Worker Secrets Configuration

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

---

## Deployment

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

---

## FlClash Configuration

1. Construct your personal subscription URL:

   ```text
   https://<worker-name>.<your-subdomain>.workers.dev/clash?token=<ACCESS_TOKEN>
   ```

2. Configure in your client:
   - **FlClash**: Go to **Profiles** (配置) → Click **+** (Add) → Choose **URL** → Enter Name (`Just My Socks`) and paste the URL → Save & Update.
   - **Clash Verge / Mihomo Party**: Go to **Profiles** (订阅) → Import Remote Subscription → Paste the URL → Save & Update.

3. Verify: The profile card will now display your used quota and total package traffic (e.g., `12.5 GB / 500.0 GB`).

---

## Post-Deployment Verification Guide

You can verify all endpoints using `curl`:

### 1. Health Check (Unauthenticated)

```bash
curl -sS "https://<worker>.workers.dev/healthz"
```

**Expected output:**
```json
{"status":"ok"}
```

### 2. Status Endpoint (Authenticated JSON metrics)

```bash
curl -sS "https://<worker>.workers.dev/status?token=<ACCESS_TOKEN>"
```

**Expected output:**
```json
{
  "used_bytes": 125000000000,
  "total_bytes": 500000000000,
  "remaining_bytes": 375000000000,
  "used_percent": 25,
  "reset_day": 16
}
```

### 3. Subscription GET Request (Headers & Body)

```bash
curl -sS -D - -o /tmp/jms.yaml "https://<worker>.workers.dev/clash?token=<ACCESS_TOKEN>"
```

**Expected response headers:**
```http
HTTP/2 200
content-type: text/yaml; charset=utf-8
profile-title: Just My Socks
profile-update-interval: 6
subscription-userinfo: upload=0; download=134217728000; total=536870912000; expire=0
x-jms-bandwidth-status: ok
cache-control: no-store
```

The saved `/tmp/jms.yaml` will contain the exact, unmodified YAML configuration from Just My Socks.

### 4. Subscription HEAD Request

```bash
curl -I "https://<worker>.workers.dev/clash?token=<ACCESS_TOKEN>"
```

**Expected output:**
- Status `HTTP/2 200` (or `HTTP/1.1 200 OK`).
- All headers (`subscription-userinfo`, `profile-title`, `profile-update-interval`, `X-JMS-Bandwidth-Status`) are present.
- Body is empty (0 bytes).

---

## Security & Credentials Notice

- **Treat URLs as Passwords**: Both `JMS_SUB_URL` and `JMS_BW_URL` contain your secret Just My Socks Service ID and UUID. Treat them with the same sensitivity as account passwords.
- **Accidental Compromise / Revocation**: If your JMS subscription URL or UUID is ever leaked, log in to the Just My Socks Client Area, navigate to your service, and **change your service password**. This immediately invalidates the old UUID. Then update your Cloudflare Worker secret with `npx wrangler secret put JMS_SUB_URL` and `npx wrangler secret put JMS_BW_URL`.
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

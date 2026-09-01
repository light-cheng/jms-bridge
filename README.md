# JMS Bridge

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
https://<worker-name>.<account-subdomain>.workers.dev/clash?token=<ACCESS_TOKEN>
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

- **macOS or Linux with a POSIX shell** (Windows users can use WSL or Git Bash for the commands below).
- **Node.js**: v18.0.0 or later (v20+ recommended).
- **npm**: v9.0.0 or later.
- **Cloudflare Account**: [Sign up for free](https://dash.cloudflare.com/sign-up).
- **Cloudflare Wrangler CLI**: Logged in via `npx wrangler login`.

---

## Quick Start

Follow these step-by-step instructions to deploy your bridge from scratch:

### 1. Clone & Install

Clone the repository and install dependencies:

```bash
git clone https://github.com/LightDevCoder/jms-bridge.git
cd jms-bridge
npm install
```

### 2. Login to Cloudflare

Authenticate Wrangler with your Cloudflare account:

```bash
npx wrangler login
```

Verify your active logged-in Cloudflare account:

```bash
npx wrangler whoami
```

> [!NOTE]
> Confirm that the displayed account is the Cloudflare account where you intend to deploy the Worker.

### 3. Check Wrangler Version

Check that Wrangler is available:

```bash
npx wrangler --version
```

This project uses Wrangler 4 (specified in `devDependencies` and executed via `npx wrangler`). No global Wrangler installation is required.

### 4. Choose Worker Name & Configuration

The deployment configuration is defined in [`wrangler.jsonc`](wrangler.jsonc):

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "jms-bridge",
  "main": "src/index.ts",
  "workers_dev": true,
  "compatibility_date": "2024-09-01",
  "compatibility_flags": [
    "nodejs_compat"
  ]
}
```

- `"name": "jms-bridge"` sets the Worker name. It forms the first prefix of your public URL: `https://jms-bridge.<account-subdomain>.workers.dev`.
- `"workers_dev": true` explicitly enables public `workers.dev` routing.

> [!NOTE]
> **Understanding Worker deletion:** If you delete a remote Worker using `npx wrangler delete --name jms-bridge`, but keep `"name": "jms-bridge"` in your local `wrangler.jsonc`, the next `npm run deploy` will simply recreate the Worker on Cloudflare. Deleting a remote Worker does not delete your local configuration.

### 5. First Deploy

Deploy the Worker bundle to Cloudflare:

```bash
npm run deploy
```

Upon completion, Wrangler outputs your assigned public endpoint.

> [!IMPORTANT]
> **Use the exact `workers.dev` URL printed by Wrangler.** Do not guess or hand-craft your endpoint URL.

The URL format will be:
```text
https://<worker-name>.<account-subdomain>.workers.dev
```

### 6. Understand workers.dev URL & Account Subdomain

Cloudflare Workers URLs consist of two parts:

```text
https://<worker-name>.<account-subdomain>.workers.dev
        ^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^
         Worker Name    Account Subdomain
```

For example, in `https://jms-bridge.lightdevcoder.workers.dev`:
- `jms-bridge` comes from `"name": "jms-bridge"` in `wrangler.jsonc`.
- `lightdevcoder` is your **Cloudflare Account-level `workers.dev` subdomain**, shared by all Workers in your account.

> [!WARNING]
> During your very first deployment, Cloudflare may prompt:
> ```text
> Would you like to register a workers.dev subdomain now?
> What would you like your workers.dev subdomain to be?
> ```
> Enter an account identifier (such as your username `lightdevcoder`). Do **not** enter `jms-bridge` as your account subdomain; otherwise your URL would become `https://jms-bridge.jms-bridge.workers.dev`.

- Deleting a Worker (`npx wrangler delete --name jms-bridge`) will **not** delete or reset your account-level `workers.dev` subdomain.
- To change your account subdomain, go to:
  **Cloudflare Dashboard** → **Workers & Pages** → **Your subdomain** (right sidebar) → **Change**.

### 7. Verify `/healthz` (Pre-Secret Health Check)

Before configuring any secrets, confirm that the Worker is deployed, DNS has propagated, and TLS is functioning:

```bash
curl -i "https://<worker-name>.<account-subdomain>.workers.dev/healthz"
```

**Expected Response**:
```http
HTTP/2 200
content-type: application/json; charset=UTF-8

{"status":"ok"}
```

This health check does not depend on JMS upstream credentials. It validates your Worker deployment and network path before setting secrets.

### 8. Configure JMS Secrets

Production operation requires three Cloudflare Secrets:
- `JMS_SUB_URL`: Official Just My Socks Mihomo / Clash.Meta subscription URL.
- `JMS_BW_URL`: Just My Socks Bandwidth Counter API URL.
- `ACCESS_TOKEN`: Your secret token to protect the Worker endpoint.

> **Where to find your JMS URLs:**
> 1. Log in to your **Just My Socks Client Area** → **Services** → **My Services** → select your active service.
> 2. Copy the **Mihomo / Clash.Meta Subscription URL** (for `JMS_SUB_URL`).
> 3. Scroll to **API – Bandwidth Counter** to copy the API URL (for `JMS_BW_URL`).

Set the upstream URLs on Cloudflare:

```bash
npx wrangler secret put JMS_SUB_URL
npx wrangler secret put JMS_BW_URL
```

Paste each corresponding URL when prompted.

### 9. Generate and Save ACCESS_TOKEN

Generate a strong 24-byte (48-character) random hexadecimal access token in your terminal:

```bash
TOKEN=$(openssl rand -hex 24)
echo "$TOKEN"
```

> [!IMPORTANT]
> **Save this token now, preferably in a password manager.**
> Cloudflare Secrets cannot later reveal the plaintext value.

Write the token directly to Cloudflare Secrets:

```bash
printf '%s' "$TOKEN" | npx wrangler secret put ACCESS_TOKEN
```

*Note: If you ever forget your token, Cloudflare cannot retrieve it. Simply generate a new token with `TOKEN=$(openssl rand -hex 24)`, re-run the `printf '%s' "$TOKEN" | npx wrangler secret put ACCESS_TOKEN` command, and update your FlClash subscription URL.*

### 10. Verify Secrets

Verify that all three secrets are registered:

```bash
npx wrangler secret list
```

**Expected Output** (shows secret names only, never secret values):
```text
[
  { "name": "ACCESS_TOKEN", "type": "secret_text" },
  { "name": "JMS_BW_URL", "type": "secret_text" },
  { "name": "JMS_SUB_URL", "type": "secret_text" }
]
```

### 11. Verify `/status`

Test the Bandwidth Counter status endpoint using the `$TOKEN` variable in your current shell:

```bash
curl -i "https://<worker-name>.<account-subdomain>.workers.dev/status?token=${TOKEN}"
```

**Expected Response**:
```http
HTTP/2 200
content-type: application/json; charset=UTF-8

{
  "used_bytes": 125000000000,
  "total_bytes": 500000000000,
  "remaining_bytes": 375000000000,
  "used_percent": 25,
  "reset_day": 16
}
```

### 12. Verify `/clash`

Verify the subscription header injection using a standard HEAD request:

```bash
curl -I "https://<worker-name>.<account-subdomain>.workers.dev/clash?token=${TOKEN}"
```

**Expected Response**:
```http
HTTP/2 200
content-type: text/yaml; charset=utf-8
subscription-userinfo: upload=0; download=134217728000; total=536870912000; expire=0
profile-title: Just My Socks
profile-update-interval: 6
x-jms-bandwidth-status: ok
cache-control: no-store
```

### 13. Add Subscription to FlClash

Once verification succeeds, configure your client:

1. **Subscription URL:**
   ```text
   https://<worker-name>.<account-subdomain>.workers.dev/clash?token=<ACCESS_TOKEN>
   ```
2. **In FlClash:**
   - Go to **Profiles** (配置) → Click **+** (Add) → Choose **URL**.
   - Set Name to `Just My Socks`.
   - Paste the subscription URL.
   - Click **Save** (保存) and then **Update** (刷新).
3. **In Clash Verge Rev / Mihomo Party:**
   - Go to **Profiles** / **Subscriptions** → Import Remote Subscription → Paste URL → Save & Update.
4. **Result:** The profile card will display your used quota and total package traffic (e.g., `125 GB / 500 GB`).

---

## Optional Local Development

Standard Cloudflare deployment does not require `.dev.vars` or local development tools.

If you are developing, modifying code, or testing locally:

1. Create a local environment variables file from the template:
   ```bash
   cp .dev.vars.example .dev.vars
   ```
2. Edit `.dev.vars` with your test configuration:
   ```ini
   JMS_SUB_URL=https://example.invalid/subscription
   JMS_BW_URL=https://example.invalid/bandwidth
   ACCESS_TOKEN=replace-me
   ```
3. Start the local development server:
   ```bash
   npm run dev
   ```
   The local worker listens at `http://localhost:8787`.

4. Run automated test suite and type check:
   ```bash
   npm test
   npm run typecheck
   npx wrangler deploy --dry-run
   ```

> [!NOTE]
> `.dev.vars` is strictly excluded in [`.gitignore`](.gitignore) and must never be committed into version control.

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

Comprehensive automated test coverage validates all layers using mocked upstream responses (no real external network requests):

- **Authentication**: Query token, Bearer header, missing tokens, invalid tokens, constant-time equality.
- **Routing & Method Contracts**: Strict HTTP verbs on `/clash` (GET/HEAD), `/status` (GET only), `/healthz`, 405 Method Not Allowed handling with `Allow` headers, and 404 fallbacks.
- **Bandwidth Parsing**: Non-negative finite numbers, integer reset day validation (1–31), malformed payload handling.
- **Traffic Normalization**: Decimal GB to binary GiB conversion formula (`Math.round(jmsBytes * 1.073741824)`), exact ratio preservation, `expire=0`.
- **GET / HEAD Semantics**: Full YAML delivery for GET, empty body with identical headers for HEAD.
- **Upstream Failures & Graceful Degradation**: Bandwidth downtime fallback, subscription 502 Bad Gateway, timeout handling.
- **Security Boundaries**: Zero credential or URL leakage in headers, bodies, logs, or error responses.

---

## Post-Deployment Verification Guide

You can verify all endpoints using `curl`:

### 1. Health Check
```bash
curl -i "https://<worker-name>.<account-subdomain>.workers.dev/healthz"
```
**Expected**: `HTTP/2 200` with body `{"status":"ok"}`.

### 2. Status Endpoint
```bash
curl -i "https://<worker-name>.<account-subdomain>.workers.dev/status?token=<ACCESS_TOKEN>"
```
**Expected**: `HTTP/2 200` with JSON bandwidth counter metrics.

### 3. Subscription GET Request
```bash
curl -sS -D /tmp/jms-headers.txt -o /tmp/jms.yaml "https://<worker-name>.<account-subdomain>.workers.dev/clash?token=<ACCESS_TOKEN>"
```
**Expected**:
- Status `HTTP/2 200`
- Headers contain `subscription-userinfo: upload=0; download=...; total=...; expire=0` and `X-JMS-Bandwidth-Status: ok`
- `/tmp/jms.yaml` contains valid JMS Mihomo YAML.

### 4. Subscription HEAD Request
```bash
curl -I "https://<worker-name>.<account-subdomain>.workers.dev/clash?token=<ACCESS_TOKEN>"
```
**Expected**:
- Status `HTTP/2 200`
- `subscription-userinfo` header present
- Body is empty (0 bytes).

---

## Troubleshooting

### 1. Worker deleted but comes back after deploy

Running `npx wrangler delete --name jms-bridge` deletes the Worker instance from Cloudflare. However, if `"name": "jms-bridge"` remains in your local `wrangler.jsonc`, running `npm run deploy` will simply recreate the Worker on Cloudflare.

To permanently change the Worker name, edit the `"name"` field in [`wrangler.jsonc`](wrangler.jsonc).

### 2. Unexpected workers.dev hostname (e.g. `jms-bridge.jms-bridge.workers.dev`)

The public URL format is:
```text
https://<worker-name>.<account-subdomain>.workers.dev
```

If you accidentally named your Cloudflare account subdomain `jms-bridge` during initial setup, your URL becomes `jms-bridge.jms-bridge.workers.dev`.

To change your account subdomain:
1. Log in to **Cloudflare Dashboard**.
2. Navigate to **Workers & Pages**.
3. On the right sidebar, find **Your subdomain** and click **Change**.

> [!NOTE]
> Deleting a Worker does not change or remove your account-level subdomain.

### 3. 401 Unauthorized (`{"error":"unauthorized"}`)

1. Verify that your secret exists on Cloudflare:
   ```bash
   npx wrangler secret list
   ```
   Ensure `ACCESS_TOKEN` is in the list.
2. If you are unsure of the token value, generate and set a new one:
   ```bash
   TOKEN=$(openssl rand -hex 24)
   printf '%s' "$TOKEN" | npx wrangler secret put ACCESS_TOKEN
   ```
3. Update your client subscription URL with the new token.

> [!CAUTION]
> Never post your secret token or secret URLs in public issues, discussions, or chats.

### 4. `curl: (3) URL rejected: Malformed input`

This error occurs when the shell variable `${TOKEN}` contains trailing whitespace, newlines, carriage returns, or unescaped control characters.

Re-generate a clean hexadecimal token:
```bash
TOKEN=$(openssl rand -hex 24)
echo "${#TOKEN}"
```
**Expected Output**: `48`

Then re-apply the secret using `printf '%s' "$TOKEN" | npx wrangler secret put ACCESS_TOKEN`.

### 5. DNS returns `198.18.x.x` (Fake-IP)

The `198.18.0.0/15` IP block is reserved for Fake-IP DNS pools in Mihomo / Clash / TUN proxy modes.

If your operating system is currently running a proxy client with Fake-IP enabled, local DNS queries (or even `dig @1.1.1.1`) are intercepted locally by the proxy core. Seeing `198.18.x.x` does not mean Cloudflare's real DNS resolved to this IP.

To test `curl` requests through your local proxy (e.g. FlClash mixed port 7890):
```bash
curl -x http://127.0.0.1:7890 "https://<worker-name>.<account-subdomain>.workers.dev/healthz"
```
*(Adjust `7890` to match your client's configured mixed/HTTP port).*

### 6. `SSL_ERROR_SYSCALL` / TLS handshake failures

1. Confirm that the Worker is actively deployed:
   ```bash
   npx wrangler deployments status --name jms-bridge
   ```
2. Confirm `"workers_dev": true` is set in `wrangler.jsonc`.
3. If connecting through a proxy, test via your proxy port (`curl -x http://127.0.0.1:7890 ...`).
4. To stream live Worker logs and monitor incoming traffic:
   ```bash
   npx wrangler tail --name jms-bridge
   ```
   If the TLS handshake fails and `wrangler tail` shows no incoming request, the connection failure occurs before traffic reaches the Cloudflare edge (e.g. local firewall or ISP blocking).

### 7. Wrangler outdated

Check your installed version:
```bash
npx wrangler --version
```
To update dependencies to the latest supported Wrangler 4:
```bash
npm install --save-dev wrangler@4
```
Then redeploy:
```bash
npm run deploy
```

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

[MIT](LICENSE)

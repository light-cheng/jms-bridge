# SPEC — JMS FlClash Subscription Bridge Final Repair

## Objective

对当前 `JMS FlClash Subscription Bridge` 做最后一轮质量收口。

本轮只修复已经确认的问题，并补齐部署前验证。

不要重构现有架构，不要扩展功能范围。

完成后：

- 所有自动化测试通过
- TypeScript typecheck 通过
- Wrangler dry-run 通过
- 使用真实 JMS upstream 完成 smoke verification
- 更新 README，使文档与实际实现一致
- 本地 commit
- 等待人工 review

---

## 1. Fix `/status` Method Contract

`/status` 只允许：

```http
GET /status
```

以下请求不得进入 status handler，也不得访问 JMS upstream：
- POST
- PUT
- PATCH
- DELETE
- HEAD

推荐返回：
```http
405 Method Not Allowed
Allow: GET
Content-Type: application/json

{
  "error": "method_not_allowed"
}
```

补充自动化测试，至少验证：
- `GET /status` → 正常
- `POST /status` → 405
- `HEAD /status` → 405

并验证不支持的方法不会触发 upstream fetch。

---

## 2. Review `/clash` Method Contract

保持当前：
- `GET /clash`
- `HEAD /clash`

语义。

**GET：**
- 返回 JMS YAML body
- 返回正常 response headers

**HEAD：**
- body 为空
- 返回与 GET 对应的关键 headers

其他方法不得访问 JMS upstream。

如当前行为不统一，将：
- POST
- PUT
- PATCH
- DELETE

统一返回：
```http
405 Method Not Allowed
Allow: GET, HEAD
Content-Type: application/json

{
  "error": "method_not_allowed"
}
```

不要为了这一项重写现有 routing 结构。

---

## 3. Correct README Test Description

README 中删除：
- `100+ tests`

不要改成固定的具体测试数量。

使用不会随着测试增减而失真的描述，例如：
`Comprehensive automated test coverage`

并简单说明测试覆盖：
- authentication
- routing
- bandwidth parsing
- bandwidth normalization
- GET / HEAD behavior
- upstream failures
- graceful degradation
- response headers

README 中的测试描述必须与真实 test suite 一致。

---

## 4. Correct YAML Pass-through Description

README 中删除：
- `Byte-for-Byte Fidelity`

以及任何：
- `byte-identical`
- `binary-identical`
- `byte-for-byte`

之类的表述。

当前实现通过：
`response.text()` → `string` → `new Response()`
返回 YAML，因此应描述为：
`Unmodified YAML Pass-through`

正文说明：
> The worker does not parse, rewrite, rename, or inject configuration into the upstream JMS Mihomo YAML.
> 
> The upstream YAML text content is returned unchanged during normal operation.

不要修改代码去追求 binary byte-for-byte passthrough。

---

## 5. README Deployment Flow

检查 README，确保一个新用户仅根据 README 就能完成整个部署流程。

完整流程应包括：
1. `npm install`
2. 创建本地配置：
   `cp .dev.vars.example .dev.vars`
3. 本地运行：
   `npm run dev`
4. 测试：
   `npm test`
   `npm run typecheck`
5. Cloudflare Secrets：
   `npx wrangler secret put JMS_SUB_URL`
   `npx wrangler secret put JMS_BW_URL`
   `npx wrangler secret put ACCESS_TOKEN`
6. 部署：
   `npm run deploy`
7. 最终 FlClash URL：
   `https://<worker>.workers.dev/clash?token=<ACCESS_TOKEN>`

不要要求自定义域名。
`workers.dev` 必须可以直接使用。

---

## 6. README Endpoint Documentation

README 应准确记录以下接口。

### `/clash`
- `GET  /clash?token=...`
- `HEAD /clash?token=...`

成功响应至少包含：
```http
Content-Type: text/yaml; charset=utf-8
subscription-userinfo: upload=0; download=<used>; total=<total>; expire=0
profile-title: Just My Socks
profile-update-interval: 6
X-JMS-Bandwidth-Status: ok
```

Bandwidth API 不可用时：
- YAML 仍正常返回
- `subscription-userinfo` 不返回
- `X-JMS-Bandwidth-Status: unavailable`

### `/status`
- `GET /status?token=...`

返回：
```json
{
  "used_bytes": 0,
  "total_bytes": 0,
  "remaining_bytes": 0,
  "used_percent": 0,
  "reset_day": 1
}
```

说明这里返回的是 JMS Bandwidth Counter 状态。

### `/healthz`
- `GET /healthz`

无需认证。
不得访问任何 JMS upstream。

---

## 7. Review Security Boundaries

确认以下信息不会进入 Git：
- `JMS_SUB_URL`
- `JMS_BW_URL`
- `ACCESS_TOKEN`
- 真实 service ID
- 真实 JMS UUID

确认：
- `.dev.vars` 仍在 `.gitignore`。

确认：
- `.dev.vars.example` 仅包含 placeholder。

搜索整个 tracked repository，确认不存在真实凭证。

同时检查 error response 和日志。
任何 upstream failure 都不得输出完整：
- `JMS_SUB_URL`
- `JMS_BW_URL`
- UUID
- token

错误信息保持类似：
- `subscription_upstream_failed`
- `bandwidth_upstream_failed`
- `unauthorized`
- `method_not_allowed`

---

## 8. Preserve Graceful Degradation

保持当前行为：
- **Subscription OK, Bandwidth FAIL**：
  必须继续 `200 OK` 并返回有效 YAML。
  Header：`X-JMS-Bandwidth-Status: unavailable`。
  不得因为 Bandwidth Counter API 故障导致 FlClash 无法更新节点。
- **Subscription FAIL**：
  返回 `502 Bad Gateway`。
  不要返回失效或空 YAML。

为这两个场景保留或补充自动化测试。

---

## 9. Verify Bandwidth Validation

重新检查 Bandwidth Counter parser。

以下字段：
- `monthly_bw_limit_b`
- `bw_counter_b`

必须：
- 存在
- number
- finite
- >= 0

`bw_reset_day_of_month` 存在时：
- integer
- `1 <= value <= 31`

非法 bandwidth response 不得产生 `subscription-userinfo`。
但只要 YAML upstream 正常，仍应按 graceful degradation 返回 YAML。

---

## 10. Verify GB Normalization

保持现有转换逻辑：
```text
clashBytes = Math.round(jmsBytes * 1073741824 / 1000000000)
```

必须同时作用于：
- `used`
- `total`

测试至少保留：
- JMS total: `500000000000` → Expected: `536870912000`
- JMS used: `125000000000` → Expected: `134217728000`

最终比例保持：25%

不要改变：`expire=0`（`bw_reset_day_of_month` 不是套餐 expiration）。

---

## 11. Test Suite Cleanup

检查现有测试是否真实覆盖当前 API contract。
至少保证以下场景有自动化测试：
- `GET /healthz`
- `GET /status`
- invalid `/status` methods (POST, HEAD, etc. -> 405)
- `GET /clash`
- `HEAD /clash`
- invalid `/clash` methods (POST, PUT, DELETE, etc. -> 405)
- query token authentication
- Bearer authentication
- missing token
- invalid token
- valid bandwidth JSON
- invalid bandwidth JSON
- negative bandwidth
- invalid reset day
- decimal GB normalization
- bandwidth upstream failure
- subscription upstream failure
- subscription timeout
- bandwidth timeout
- YAML content pass-through
- subscription-userinfo generation
- HEAD response body empty

测试不得请求真实 JMS，使用 mocked `fetch()`。
不要为了增加测试数量编写重复测试。

---

## 12. Local Verification

完成修改后运行：
- `npm test`
- `npm run typecheck`
- `npx wrangler deploy --dry-run`
- 如果存在 lint：`npm run lint`

全部必须成功。
记录实际结果，不要只写 "should pass"。

---

## 13. Real JMS Smoke Verification

自动化测试全部通过后，使用真实 JMS credentials 做一次本地 smoke test。

真实凭证只能通过 `.dev.vars` 提供，不得写入 source code、test fixture、README、Git 或 completion report。

启动：
`npm run dev`

验证：
1. **Health**
   `curl -i "http://localhost:<port>/healthz"`
   预期：200 且没有 JMS upstream 请求。
2. **Status**
   `curl -i "http://localhost:<port>/status?token=<TOKEN>"`
   确认真实返回 `used_bytes`、`total_bytes`、`remaining_bytes`、`used_percent`、`reset_day`，数值合理。
3. **Clash GET**
   `curl -sS -D /tmp/jms-headers.txt -o /tmp/jms.yaml "http://localhost:<port>/clash?token=<TOKEN>"`
   确认 HTTP 200，Headers 中存在 `subscription-userinfo` 和 `X-JMS-Bandwidth-Status: ok`，确认 `/tmp/jms.yaml` 是有效 JMS Mihomo YAML。
4. **Clash HEAD**
   `curl -I "http://localhost:<port>/clash?token=<TOKEN>"`
   确认 HTTP 200，`subscription-userinfo` 存在，body empty。

Smoke test 完成后不得提交 `.dev.vars`、`/tmp/jms.yaml`、真实 headers、真实 UUID、真实 token。

---

## 14. Optional Temporary Cloudflare Verification

如果当前 Cloudflare 账号环境已经准备好，并且可以安全创建临时 Worker，则可以在完成上述检查后做一次临时部署验证。只有在不会影响现有生产资源的情况下执行。
如果没有安全的临时环境，则不要为了完成本 SPEC 强行部署。本地真实 upstream smoke verification 仍然是必须完成项。

---

## 15. FlClash Verification

如果可以安全使用临时 Worker，则把 `https://<temporary-worker>.workers.dev/clash?token=<TOKEN>` 作为远程 profile 导入 FlClash 验证。
如果本轮不进行临时 Cloudflare 部署，则在 completion report 中明确：
`FlClash UI verification: pending production/temporary deployment`
不得虚构已经通过。

---

## 16. Scope Control

本轮不要加入任何与最终修复无关的功能。
不要增加：Web UI、多账户、历史流量、数据库、KV、D1、R2、Durable Objects、Docker、规则集、节点重命名、ACL4SSR、DNS 配置、订阅转换、测速、定时任务、QuanX、Loon、Surge、sing-box。

---

## 17. Completion Criteria

只有以下全部完成，本轮才算结束：
- `/status` method contract 修复完成
- `/clash` method contract 修复完成
- README test 描述准确
- README YAML pass-through 描述准确
- README 从零部署流程完整
- README endpoints 与实现一致
- Security review 通过
- Graceful degradation 保持
- Bandwidth validation 保持
- GB normalization 保持
- `npm test` 通过
- `npm run typecheck` 通过
- `wrangler deploy --dry-run` 通过
- 真实 JMS local smoke test 通过
- 没有任何真实 secret 进入 Git
- Working tree clean

---

## 18. Git

完成所有修改与验证后创建一个新的本地 commit。
Commit message 可使用：
`fix: finalize JMS bridge validation and docs`

完成后确认 `git status --short` 为空。
不要 push，不要 release，不要 tag，等待人工 review。

---

## 19. Completion Report

最终只报告：
- Commit SHA
- Working tree status
- Files changed
- Behavior changes
- `/status` method behavior
- `/clash` GET/HEAD behavior
- Security verification & Secret scan result
- `npm test` result
- `npm run typecheck` result
- `wrangler deploy --dry-run` result
- Real JMS smoke test result
- FlClash verification result (if executed)
- Known limitations

报告中不得包含任何真实 secret，完成后停止等待人工 review。

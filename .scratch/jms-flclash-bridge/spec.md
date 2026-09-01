# SPEC — JMS FlClash Subscription Bridge Real-Upstream Verification

## Objective

完成 `JMS FlClash Subscription Bridge` 当前缺失的真实 JMS 验证，并修正现有验收记录。

本轮不修改业务功能，不重构代码，不增加新能力。

当前实现已经完成：

- `/clash` GET / HEAD
- `/status` GET
- `/healthz`
- `subscription-userinfo`
- JMS 流量换算
- graceful degradation
- authentication
- method guard
- automated tests
- typecheck
- Wrangler dry-run
- README

本轮唯一目标是证明：

```text
真实 JMS Subscription
        +
真实 JMS Bandwidth Counter
        ↓
当前 Worker 实现
        ↓
真实有效 Mihomo YAML
        +
真实 subscription-userinfo
```

并将项目中的验证记录更新为实际执行结果。

---

## 1. Do Not Change Product Behavior

除非真实验证暴露出明确 bug，否则不要修改：
- routing
- authentication
- bandwidth normalization
- response headers
- error handling
- YAML pass-through
- endpoint structure

不要趁本轮做：
- refactor
- cleanup
- dependency upgrade
- new feature
- new endpoint
- cache
- multi-account support
- UI
- deployment redesign

如果所有真实验证通过，本轮主要改动应只有验证记录。

---

## 2. Prepare Real Local Credentials

使用本地：
`.dev.vars`

提供真实：
- `JMS_SUB_URL`
- `JMS_BW_URL`
- `ACCESS_TOKEN`

其中：
- `JMS_SUB_URL`：必须是 JMS 官网提供的真实 Mihomo / Clash.Meta Subscription URL。
- `JMS_BW_URL`：必须是 JMS 官网 API – Bandwidth Counter 页面提供的真实 `getbwcounter.php` URL。

不得把真实值写入：
- source code
- test files
- README
- issue markdown
- completion report
- Git commit
- shell script tracked by Git

执行前确认：
`git status --short` 中 `.dev.vars` 不得出现为 tracked / staged 文件。

---

## 3. Verify .dev.vars Protection

确认：
- `git check-ignore .dev.vars` 应确认该文件被忽略。
- `git ls-files .dev.vars` 无输出。

如果 `.dev.vars` 被 Git tracking，立即停止，不继续真实验证，先修复 secret protection。

---

## 4. Start Worker Locally

运行：
`npm run dev`

记录实际监听地址，例如：
`http://localhost:8787`

后续命令使用实际端口。
不要把 token 直接写进 tracked 文件。
可以临时：
`export JMS_BRIDGE_TOKEN='实际 ACCESS_TOKEN'`
或手动替换 shell 命令中的 token。

---

## 5. Verify Health Endpoint

执行：
```bash
curl -i "http://localhost:8787/healthz"
```

必须返回：
- HTTP 200
- Body：`{"status":"ok"}`

同时确认 `/healthz` 不依赖真实 JMS upstream。
这一项只是基础启动检查，不得作为“真实 JMS smoke verification 已完成”的依据。

---

## 6. Real `/status` Verification

这是本轮第一个真正的 upstream 验证。

执行：
```bash
curl -i "http://localhost:8787/status?token=<ACCESS_TOKEN>"
```

必须真实访问 `JMS_BW_URL` 并返回：
- HTTP 200
- Content-Type: `application/json`

Body 至少包含：
```json
{
  "used_bytes": ...,
  "total_bytes": ...,
  "remaining_bytes": ...,
  "used_percent": ...,
  "reset_day": ...
}
```

验证：
- `used_bytes >= 0`
- `total_bytes > 0`
- `remaining_bytes >= 0`
- `used_bytes <= total_bytes`
- `used_percent >= 0`
- `used_percent <= 100`
- `reset_day >= 1`
- `reset_day <= 31`

并人工对照 JMS 官网当前 Bandwidth Counter 数据。
允许存在显示单位换算差异，但已用比例、总量比例、reset day 必须合理一致。
不要把实际流量数值写入 Git。

---

## 7. Real `/clash` GET Verification

执行：
```bash
curl -sS -D /tmp/jms-bridge-headers.txt -o /tmp/jms-bridge.yaml "http://localhost:8787/clash?token=<ACCESS_TOKEN>"
```

然后检查 `cat /tmp/jms-bridge-headers.txt`，必须真实看到：
- HTTP 200
- `subscription-userinfo: upload=0; download=<number>; total=<number>; expire=0`
- `X-JMS-Bandwidth-Status: ok`

并检查 `head -n 30 /tmp/jms-bridge.yaml` 确认返回的是有效 JMS Mihomo YAML。

---

## 8. Verify YAML Pass-through

单独直接获取真实 JMS subscription：
```bash
curl -sS -o /tmp/jms-upstream.yaml "$JMS_SUB_URL"
```

再获取 Worker 结果：
```bash
curl -sS -o /tmp/jms-bridge.yaml "http://localhost:8787/clash?token=<ACCESS_TOKEN>"
```

比较：
```bash
diff -u /tmp/jms-upstream.yaml /tmp/jms-bridge.yaml
```

正常情况下应无配置内容差异。
项目 contract 是：Worker 不解析、不重写、不重命名、不注入 JMS YAML 配置内容，而不是 binary byte-for-byte guarantee。

---

## 9. Verify `subscription-userinfo`

从 `/tmp/jms-bridge-headers.txt` 读取 `subscription-userinfo`，确认：
- `upload = 0`
- `download > 0` 或符合当前真实使用量
- `total > 0`
- `expire = 0`
- `download <= total`

然后根据 `/status` 返回的数据检查：
`download / total` 与 `used_bytes / total_bytes` 比例一致。

---

## 10. Real `/clash` HEAD Verification

执行：
```bash
curl -I "http://localhost:8787/clash?token=<ACCESS_TOKEN>"
```

必须返回：
- HTTP 200
- `subscription-userinfo`
- `profile-title`
- `profile-update-interval`
- `X-JMS-Bandwidth-Status: ok`
- HEAD response 不得返回 YAML body。

---

## 11. Authentication Smoke Check

使用错误 token：
```bash
curl -i "http://localhost:8787/status?token=invalid-test-token"
curl -i "http://localhost:8787/clash?token=invalid-test-token"
```

应均返回 `401 Unauthorized`，且认证失败时不应访问真实 JMS upstream。

---

## 12. Real Bandwidth Failure Test

（可选）临时使用有效 `JMS_SUB_URL` 和无效 `JMS_BW_URL` 验证 Graceful Degradation（返回 200 + YAML + `X-JMS-Bandwidth-Status: unavailable`，无 `subscription-userinfo`）。
如自动化测试已覆盖且避免不必要风险，可不做真实故障注入，此项不是 blocker。

---

## 13. Run Full Automated Verification Again

真实 smoke verification 完成后重新运行：
- `npm test`
- `npm run typecheck`
- `npx wrangler deploy --dry-run`
- 如存在 lint：`npm run lint`

所有实际结果必须记录。

---

## 14. Optional Temporary Cloudflare Deployment

（可选）如果环境允许且不影响生产，可进行临时 Worker 部署验证。
若无安全临时环境，则跳过，记录为 `not executed`。

---

## 15. Optional FlClash UI Verification

（可选）如果进行了临时部署，导入 FlClash 验证卡片展示。
未执行则明确记录：
`FlClash UI verification: not executed`

---

## 16. Correct Existing Verification Record

检查当前项目中记录 real JMS verification 的 issue / verification 文档。
必须明确区分：
- Local startup verification
- Method guard verification
- Real JMS bandwidth verification
- Real JMS subscription verification
- Real subscription-userinfo verification

只有本 SPEC 中真实 `/status`、`GET /clash`、`HEAD /clash` 执行成功后，才能把 Real JMS smoke verification 标记为 completed / resolved。

---

## 17. Verification Evidence

验证记录可以包含命令输出和行为状态，但不包含任何真实 UUID、真实 token、完整 JMS URL、具体私人流量数值。

---

## 18. Secret Cleanup

验证结束后删除临时输出：
```bash
rm -f /tmp/jms-bridge.yaml /tmp/jms-upstream.yaml /tmp/jms-bridge-headers.txt
```

确认 `git status --short` 无敏感文件或临时文件。

---

## 19. Code Changes If Verification Fails

如果真实验证暴露 bug，定位根因，只修复导致真实验证失败的问题，补自动化回归测试，重新运行全部验证。

---

## 20. Completion Criteria

- 真实 `/status` 请求成功，Bandwidth Counter 正确解析
- 真实 `GET /clash` 请求成功，Mihomo YAML 成功返回，`subscription-userinfo` 存在，`X-JMS-Bandwidth-Status = ok`
- 真实 `HEAD /clash` 请求成功，`subscription-userinfo` 存在，body 为空
- YAML 未被 Worker 重写
- `npm test` 实际通过
- `npm run typecheck` 实际通过
- `wrangler deploy --dry-run` 实际通过
- 真实 credentials 未进入 Git，临时文件已清理
- 验证记录与实际执行结果一致

---

## 21. Git

建议 commit：
`test: verify JMS bridge against real upstream`

完成后 `git status --short` 必须为空，只做本地 commit，不要 push/tag/release/deploy。

---

## 22. Completion Report

最终报告包含 Commit SHA、Working tree status、Real /status、Real GET /clash、Real HEAD /clash、YAML pass-through、自动化测试及 dry-run 结果，不包含任何真实密钥和隐私数据。

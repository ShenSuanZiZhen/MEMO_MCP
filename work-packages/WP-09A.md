---
id: WP-09A
depends_on: [WP-03B, WP-06A]
gate: security
---
# WP-09A 策略契约与 OPA Adapter

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-09A`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 POL-004/007/008、技术方案第 11.1 节和依赖 evidence。

## 目标结果
实现 PolicyInput/Decision 领域端口、OPA adapter、版本化 bundle 加载和故障关闭。

## 允许修改
`packages/authz` policy port、OPA adapter、`infra/policies` 最小 bundle 和测试。

## 禁止和非目标
不实现全部业务策略、不调用数据正文、不在应用代码写旁路 allow。

## 实施要求
- 输入覆盖 actor/credential/tenant/env/version/capability/data/network/time/state；
- 校验响应 schema、bundle version、decisionId；
- timeout/unavailable/invalid/missing 默认拒绝并返回稳定原因；
- 策略日志只记录 ID 和原因码。

## 可验证完成结果
- allow/deny fixture 和 OPA 集成 PASS；断网/超时/错误 JSON/旧 bundle 均拒绝；
- 无 actor/scope 的调用无法构造；
- `pnpm verify` PASS；安全评审通过。

## 衔接输出
Evidence 固定 PolicyPort、超时、reason codes、bundle 发布/回退接口。

## 停止条件
OPA/Cedar 决策未定、需要默认允许或读取正文时停止。

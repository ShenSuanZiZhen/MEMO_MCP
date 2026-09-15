---
id: WP-18B
depends_on: [WP-12C, WP-13D]
gate: release
---
# WP-18B 故障注入、幂等与恢复 E2E

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-18B`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 NFR-REL、技术方案第 13/17 节及依赖 evidence。

## 目标结果
验证 Worker/依赖中断、重复投递、取消和恢复时业务事实不重复、不漂移、不丢关键状态。

## 允许修改
`tests/e2e/reliability`、fault harness、runbook；只做局部契约内修复。

## 禁止和非目标
不在生产注入故障、不放宽重试/幂等规则、不通过延长无限超时解决。

## 实施要求
- kill upload/parser/test/deploy worker 后恢复；
- PostgreSQL/Redis/OpenSearch/S3/OPA/Temporal 短时中断；
- duplicate event/request/activity 和乱序可允许事件；
- 取消/重试保留已完成成果且不重复 version/deployment/usage。

## 可验证完成结果
- 每个故障场景有前态/注入/恢复/事实核对；
- Definition digest、状态、outbox/audit 数量与预期一致；
- 一键可靠性套件和 `pnpm verify` PASS；发布评审通过。

## 衔接输出
Evidence 提供故障矩阵、恢复时间、已知重试上限和 runbook 链接。

## 停止条件
发现数据丢失/重复事实、需要架构重做或测试可能影响非项目资源时停止。

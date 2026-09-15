---
id: WP-13D
depends_on: [WP-13C, WP-03C]
gate: release
---
# WP-13D 版本、数据更新与高影响动作

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-13D`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 OPS-004～010、用户流程第 15 节及依赖 evidence。

## 目标结果
实现从历史版本创建 Draft、数据更新候选、版本比较，以及暂停调用/停止新授权/下线的独立动作。

## 允许修改
operations/version application/API/workflow、通知事件和测试。

## 禁止和非目标
不覆盖旧数据/Definition；不自动物理删除；不接外部通知渠道。

## 实施要求
- 新版本不复制 credential/实时配额；数据更新形成新 DataVersion/Definition；
- 三类高影响动作有不同状态、影响、恢复、step-up 和原因；
- 影响分析列出受影响客户端/版本但不泄露跨租户信息；
- 只发有意义的状态事件，进度不刷通知。

## 可验证完成结果
- 旧版本结果不变；新 Draft 无凭证；版本 diff 正确；
- 三动作分别验证调用/发 Key/现有版本行为及恢复；
- audit/event/E2E、`pnpm verify` PASS；发布评审通过。

## 衔接输出
Evidence 提供三动作状态表、事件、恢复 API 和数据 v2 流程。

## 停止条件
动作影响语义不明确、需要删除历史或绕过 step-up 时停止。

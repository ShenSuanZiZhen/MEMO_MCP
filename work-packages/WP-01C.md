---
id: WP-01C
depends_on: [WP-01A]
gate: api
---
# WP-01C 发布运营 OpenAPI

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-01C`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 PRD PRE/TST/PUB/OPS/ADM、用户流程第 10～15 节及 WP-01A evidence。

## 目标结果
冻结 Preview、Test、Review、Deployment、Credential 和 Operations 的 P0 REST 契约。

## 允许修改
`packages/contracts` 发布运营 OpenAPI、示例、生成类型和测试。

## 禁止和非目标
不实现 endpoint、不定义计费、不接外部通知渠道。

## 实施要求
- 所有 preview/test/report/release 引用 definitionId/digest；
- 高影响操作有 step-up、原因、影响和恢复字段；
- Key 创建响应一次展示，普通读取只返回摘要；
- trace schema 禁止正文、查询和 Secret。

## 可验证完成结果
- 状态操作和错误示例覆盖 PRD；
- schema 测试拒绝可变 Candidate、明文 Key 和正文 trace；
- lint、生成、breaking test、`pnpm verify` PASS；API 评审通过。

## 衔接输出
Evidence 提供 WP-11～16 使用的 endpoint/schema 索引。

## 停止条件
需要引入支付、外部通知写操作或放宽一次展示规则时停止。

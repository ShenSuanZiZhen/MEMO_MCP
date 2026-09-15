---
id: WP-01A
depends_on: [WP-00A]
gate: api
---
# WP-01A 公共 Schema 基元

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-01A`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 PRD 第 5/9/10 节、技术方案第 12 节和全局约束。

## 目标结果
建立所有 API/事件/MCP 契约复用的 ID、时间、分页、Job 和错误基元。

## 允许修改
`packages/contracts`、契约生成/校验脚本、`docs/api`。

## 禁止和非目标
不定义具体业务 endpoint、不实现 handler、不创建数据库模型。

## 实施要求
- OpenAPI 3.1/JSON Schema 为事实源，生成 TypeScript 类型；
- ID opaque、时间 RFC3339 UTC、cursor pagination、202 Job；
- 统一错误信封和错误分类，含 requestId/retryable/nextAction；
- 添加正反示例与 breaking-change 检测。

## 可验证完成结果
- schema lint、示例校验、类型生成无 diff；
- 删除必填字段、加入非法时间/内部堆栈示例时测试失败；
- `pnpm verify` PASS；API 评审通过。

## 衔接输出
Evidence 列出 schema URI、生成入口、版本规则和错误码新增流程。

## 停止条件
需要决定具体业务字段或与 PRD 错误语义冲突时停止。

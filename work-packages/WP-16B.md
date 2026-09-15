---
id: WP-16B
depends_on: [WP-13C, WP-13D, WP-14C]
gate: design
---
# WP-16B 能力、数据、追踪与版本 UI

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-16B`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 UI-30～34、OPS-002～006 及依赖 evidence。

## 目标结果
实现线上能力/数据/访问只读页、脱敏请求追踪和版本差异/数据更新入口。

## 允许修改
`apps/web` service capability/data/access/trace/version routes 和测试。

## 禁止和非目标
不直接编辑生产 Definition、不显示正文/查询/Secret、不覆盖线上数据。

## 实施要求
- Tool/Resource/Prompt 标来源模块/版本/策略，只读；
- 数据主操作是创建更新候选；
- trace 展示阶段/字段名/大小/摘要和 requestId/traceId；
- diff 分组且可只看高风险，历史版本不可改。

## 可验证完成结果
- 生产页无编辑控件/API；敏感 trace fixture 不渲染原值；
- 数据 v2、版本 diff、筛选/URL 状态 Playwright 通过；
- axe/键盘/`pnpm verify:affected` PASS；设计评审通过。

## 衔接输出
Evidence 提供 routes、只读守卫、trace/diff 展示映射和数据更新入口。

## 停止条件
需要生产内联编辑、后端 trace 含敏感值或 diff 缺风险信息时停止。

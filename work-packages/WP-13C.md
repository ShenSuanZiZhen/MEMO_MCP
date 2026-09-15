---
id: WP-13C
depends_on: [WP-10D, WP-12C]
gate: none
---
# WP-13C Usage、Trace 与服务概览

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-13C`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 OPS-001～003、NFR-OBS、技术方案第 15 节及依赖 evidence。

## 目标结果
实现幂等 UsageEvent、脱敏 RequestTrace、运行指标和服务概览查询。

## 允许修改
operations/telemetry packages、Gateway instrumentation、control-api 查询和测试。

## 禁止和非目标
不做计费、不把查询/正文/Secret/完整 URL 放 telemetry、不用高基数正文标签。

## 实施要求
- requestId/traceId/jobId/serviceVersion/environment 关联；
- trace 记录阶段、耗时、状态、字段名/大小摘要；
- usage 重复请求只计一次，失败/拒绝分类；
- 概览按环境/版本筛选并返回调用、拒绝、错误、延迟、配额。

## 可验证完成结果
- 端到端一次调用可关联 trace/usage/metric；重复事件不重复计量；
- 敏感 fixture 在 logs/traces/metrics/response 中不存在；
- 查询/集成、`pnpm verify:affected` PASS。

## 衔接输出
Evidence 提供 telemetry 字段白名单、usage 幂等键、查询 API 和 dashboard 指标名。

## 停止条件
需要保存原始请求、计费逻辑或高基数敏感标签时停止。

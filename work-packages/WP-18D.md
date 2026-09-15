---
id: WP-18D
depends_on: [WP-18B, WP-18C]
gate: release
---
# WP-18D 可观测性、告警与 Runbook

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-18D`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 NFR-OBS、技术方案第 15 节及依赖 evidence。

## 目标结果
完成关键 SLI/SLO 仪表盘、可操作告警和每类告警的恢复 Runbook。

## 允许修改
observability 配置、dashboard/alert definitions、`docs/runbooks`、测试。

## 禁止和非目标
不接真实外部通知、不在标签中放正文/查询/Secret/高基数 ID、不虚构 SLO 达标。

## 实施要求
- 控制面/数据面/workflow/依赖/product 指标；
- 发布、撤权、策略故障高优；用户输入错误不告警；
- 告警含影响、开始时间、runbook、最近变更；
- telemetry schema allowlist 和敏感 marker test。

## 可验证完成结果
- 合成故障触发预期告警并链接有效 runbook，恢复后自动清除；
- dashboard provisioning 测试和敏感标签扫描 PASS；
- `pnpm verify` PASS；发布评审通过。

## 衔接输出
Evidence 提供 SLI/SLO、告警路由占位、dashboard IDs、runbook 索引和残余盲区。

## 停止条件
业务 SLO 未确认、需要真实通知凭证或只能以敏感标签诊断时停止。

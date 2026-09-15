---
id: WP-19C
depends_on: [WP-19A]
gate: release
---
# WP-19C 备份、PITR 与重建演练

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-19C`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读技术方案第 16.3 节、NFR-REL 及 WP-19A evidence。

## 目标结果
建立 PostgreSQL PITR、对象版本化、配置/策略/审计备份，以及 OpenSearch/Redis 重建演练。

## 允许修改
backup/restore 配置、sandbox 演练脚本、runbook 和验证测试。

## 禁止和非目标
不操作真实生产备份、不把 Redis/OpenSearch 视为事实、不声称未实测的 RPO/RTO。

## 实施要求
- 备份加密、访问最小化、保留配置化；
- 恢复后核对 Definition digest、policy version、credential status、audit chain；
- 从事实源重建 index/cache；
- 演练记录开始/结束/数据点/RPO/RTO/失败。

## 可验证完成结果
- sandbox 删除后按 runbook 恢复；恢复点前事实存在、之后符合 RPO；
- index/cache 重建后授权与搜索结果一致；
- 自动核对报告、`pnpm verify` PASS；发布评审通过。

## 衔接输出
Evidence 提供备份范围、恢复命令、实测 RPO/RTO、核对摘要和缺口。

## 停止条件
需要生产数据、恢复可能覆盖非 sandbox、RPO/RTO 未确认或审计链不一致时停止。

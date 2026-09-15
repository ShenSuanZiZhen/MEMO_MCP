---
id: WP-19B
depends_on: [WP-19A]
gate: release
---
# WP-19B 制品提升、来源证明与回滚

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-19B`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读技术方案第 16.2 节及 WP-19A evidence。

## 目标结果
实现一次构建、按 digest 环境提升、签名/SBOM/provenance 验证、金丝雀和可演练回滚。

## 允许修改
release pipeline、artifact policies、部署/回滚脚本、runbook 和测试。

## 禁止和非目标
不从不同环境重建制品、不用 mutable tag、不跳过人工生产门禁。

## 实施要求
- promote 同一 artifact/Definition/module digests；
- 部署前验证签名、SBOM、provenance、approved Candidate；
- gateway 金丝雀有 SLO 判断和自动/人工中止；
- 回滚只切既有签名制品/Definition，不改历史。

## 可验证完成结果
- dev→test 提升 digest 不变；篡改/unsigned/mutable tag 阻断；
- 合成回归触发中止并成功回到上一 digest；
- pipeline dry-run/integration、`pnpm verify` PASS；发布评审通过。

## 衔接输出
Evidence 提供 promotion policy、门禁、金丝雀阈值、回滚命令和演练记录。

## 停止条件
需要重建、跳过签名/审批或回滚会修改历史数据时停止。

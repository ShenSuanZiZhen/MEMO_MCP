---
id: WP-00C
depends_on: [WP-00A]
gate: architecture
---
# WP-00C CI、Secret 扫描与代理规则

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-00C`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读全局约束、WP-00A evidence 和技术方案第 14/17 节。

## 目标结果
建立与本地同构的 CI 质量门、Secret/依赖扫描和仓库级 Codex 规则。

## 允许修改
CI 配置、`AGENTS.md`、扫描配置、根脚本和开发文档。

## 禁止和非目标
不接生产发布、不自动修复漏洞、不更换 WP-00A 工具链。

## 实施要求
- CI 顺序为 format/lint/typecheck/unit/contract/build/secret scan；
- 依赖缓存基于 lockfile，失败不可 `continue-on-error`；
- AGENTS.md 固化全局边界、命令、停止条件；
- fixture 中的假 Secret 使用明确 allowlist，不放宽全仓扫描。

## 可验证完成结果
- 本地 CI 复现脚本 PASS；植入测试 Secret 时扫描失败，移除后 PASS；
- 修改 lockfile 后缓存 key 变化；
- `pnpm verify` PASS；架构评审通过。

## 衔接输出
Evidence 记录 CI job、阻断规则、扫描例外和下游必跑命令。

## 停止条件
需要组织级 token、修改产品代码或降低现有安全门时停止。

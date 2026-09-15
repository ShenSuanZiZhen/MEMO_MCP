---
id: WP-05C
depends_on: [WP-05B, WP-02D]
gate: api
---
# WP-05C 自动保存、Revision 与冲突

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-05C`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 CRT-004/005、UI 自动保存规则及依赖 evidence。

## 目标结果
实现基于 revision/ETag 的 Draft 更新、冲突 diff、恢复和证据失效。

## 允许修改
control-api Draft update/revision、repository adapter、契约/并发测试。

## 禁止和非目标
不实现前端 debounce；不自动覆盖冲突；不编译 Definition。

## 实施要求
- 每次更新要求 If-Match，原子增加 revision；
- 冲突返回服务器 revision 和可比较变更，不回传 Secret；
- preview/test confirmation 只在相关关键字段变化时失效；
- 同幂等键重试返回同一结果。

## 可验证完成结果
- 两客户端并发更新只有一个成功，另一个稳定 DRAFT_CONFLICT；
- 重试不重复 revision；关键/非关键变更失效规则测试通过；
- `pnpm verify` PASS；API 评审通过。

## 衔接输出
Evidence 提供 ETag 协议、patch 格式、冲突 DTO 和失效矩阵。

## 停止条件
需要自动 merge、修改公共契约或无法区分关键字段时停止。

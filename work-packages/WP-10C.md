---
id: WP-10C
depends_on: [WP-08D, WP-10B, WP-09D]
gate: api
---
# WP-10C 目录、元数据与引用验证能力

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-10C`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 CAP-001～005、用户流程 `list_documents/get_document_metadata/verify_citation` 及依赖 evidence。

## 目标结果
实现三个内置只读 Tool，经 ScopedDataPort、策略和 OutputGuard 执行。

## 允许修改
内置 capability、`packages/data-access` scoped read port、mcp-gateway 注册和测试。

## 禁止和非目标
不实现搜索/正文读取、不直接访问数据库/OpenSearch、不暴露路径或全局 ID。

## 实施要求
- list 使用稳定 cursor、元数据 allowlist、无正文；
- get 使用 opaque documentId 并重新校验范围；
- verify 绑定 dataVersion/citation 且只验证当前主体可访问对象；
- 所有响应带 requestId/serviceVersion/truncated。

## 可验证完成结果
- 正常/空/分页/猜 ID/跨租户/无能力/撤权/超限用例通过；
- Tool schema 与 WP-01D snapshot 完全一致；
- `pnpm verify` PASS；API 评审通过。

## 衔接输出
Evidence 提供 capability IDs、ScopedDataPort 方法、opaque ID/citation 格式和调用 fixture。

## 停止条件
需要正文、原路径、直接基础设施访问或 schema 破坏时停止。

---
id: WP-10B
depends_on: [WP-10A, WP-09B]
gate: api
---
# WP-10B MCP 初始化、发现与可见性

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-10B`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 POL-008、PRE-004、技术方案第 10 节及依赖 evidence。

## 目标结果
实现 MCP 初始化及 Tools/Resources/Prompts 发现，并按主体策略过滤可见能力。

## 允许修改
mcp-gateway discovery/runtime registry、策略接入、协议 fixture/tests。

## 禁止和非目标
不执行 Tool、不返回内部模块/存储信息、不缓存跨主体发现结果。

## 实施要求
- 列表来源仅为已加载 Definition；每项 Schema 与契约一致；
- 初始化和每类 list 均执行 policy；
- 缓存 key 包含 Definition digest 和授权维度或只缓存未过滤源；
- 无权能力完全不可见且不可通过数量/错误推测。

## 可验证完成结果
- 两种凭证看到不同精确列表；撤权后下一次 list 消失；
- 同名隐藏能力无存在性侧信道；
- MCP contract、cache isolation、`pnpm verify` PASS；API 评审通过。

## 衔接输出
Evidence 提供 registry/discovery 接口、缓存策略和 schema snapshot。

## 停止条件
需要匿名 discovery、客户端指定模块或契约不一致时停止。

---
id: WP-10D
depends_on: [WP-10C]
gate: api
---
# WP-10D 搜索、按段读取、Resources 与 Prompts

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-10D`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 CAP-002～008、用户流程第 9.1～9.3 节及 WP-10C evidence。

## 目标结果
实现 search/read 两 Tool、三类 Resource Template 和三个 Prompt，全部服从同一范围。

## 允许修改
内置 capability/resource/prompt、ScopedDataPort 扩展、mcp-gateway 测试。

## 禁止和非目标
不做语义/向量搜索、不整篇读取/下载、不让 Prompt 直接访问数据。

## 实施要求
- search 只接受允许查询/过滤字段，默认/最大 10；
- read 需要 opaque document/section ID，最多 5 段和总长度限制；
- Resource URI 不含存储路径，Tool/Resource scope 一致；
- Prompt 只列出允许 Tool 调用链，停用 Tool 时不可用。

## 可验证完成结果
- 注入过滤/扩大数量/5 段以上/路径猜测/Prompt 越权均拒绝；
- Tool/Resource 同主体返回范围一致；Schema snapshot 稳定；
- 搜索/读取 P95 建立基线，`pnpm verify` PASS；API 评审通过。

## 衔接输出
Evidence 提供完整 MCP capability catalog、调用示例、性能基线和限制。

## 停止条件
需要向量、整篇、下载、Prompt 增权或改变公开 Schema 时停止。

---
id: WP-08D
depends_on: [WP-08B, WP-08C]
gate: data
---
# WP-08D OpenSearch 索引与重建

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-08D`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 CAP 搜索需求、技术方案第 6.3/9 节及依赖 evidence。

## 目标结果
将规范化文档索引到 OpenSearch，强制租户/DataVersion 过滤、稳定游标并支持全量重建。

## 允许修改
`packages/data-access` 搜索端口/OpenSearch adapter、index templates、重建脚本和测试。

## 禁止和非目标
不做向量/语义搜索、不把索引当事实源、不接受客户端原始 DSL。

## 实施要求
- mapping 含 workspace/project/environment/dataVersion 和允许检索/过滤字段；
- 查询构造器服务端注入强制 scope，客户端不能覆盖；
- search_after/稳定 tie-breaker；索引 alias 原子切换；
- 从 PostgreSQL/对象制品可幂等重建。

## 可验证完成结果
- 两租户同词查询只返回本租户；注入 DSL/scope 无效；
- 删除索引后重建结果和文档计数一致；分页无重复/遗漏；
- 集成/性能基线、`pnpm verify` PASS；数据评审通过。

## 衔接输出
Evidence 提供 ScopedSearchPort、mapping version、重建/切换命令和基线。

## 停止条件
需要向量服务、客户端 DSL 或无法强制 scope 时停止。

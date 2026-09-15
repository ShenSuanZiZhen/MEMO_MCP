---
id: WP-02B
depends_on: [WP-02A]
gate: data
---
# WP-02B 租户核心数据与 RLS

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-02B`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读技术方案第 6.2/6.3 节、WP-02A evidence 和 ACC/DAT/CRT 需求。

## 目标结果
建立 Workspace、Project、成员、Data、Draft 的首批迁移、索引和 RLS。

## 允许修改
`packages/database` schema/migration/repository fixture、数据库集成测试。

## 禁止和非目标
不建发布/凭证表；不实现 HTTP；不修改已合并迁移。

## 实施要求
- UUIDv7/UTC；所有租户表含 workspace_id，项目数据含 project_id/environment；
- 外键不能跨租户，RLS 读取事务 session context；
- DataVersion/Draft revision 约束；建立两 Workspace 同名 fixture；
- 索引覆盖主要归属和状态查询。

## 可验证完成结果
- 空库 migrate/rollback-test/重新 migrate PASS；
- 两租户同名资源跨租户查询、更新、猜 ID 均失败；
- explain 检查关键查询用索引；`pnpm verify` PASS；数据评审通过。

## 衔接输出
Evidence 记录 migration head、RLS session 变量、表/索引和 fixture 入口。

## 停止条件
需要共享无 workspace_id 的业务表或放宽 RLS 时停止。

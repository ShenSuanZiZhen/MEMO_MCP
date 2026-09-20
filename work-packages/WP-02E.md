---
id: WP-02E
depends_on: [WP-02D]
gate: data
---
# WP-02E 成员角色数据契约与 Repository

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-02E`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 WP-02D evidence、PRD 第 4 节、ACC-002～005 和 WP-03B evidence。

## 目标结果

建立成员角色的七角色持久化契约、成员 revision、成员角色变更审计和 PostgreSQL Repository adapter，使 Workspace/Project 成员角色变更可在真实数据库事务中原子执行。

## 允许修改

`packages/database` migration、database adapter、fixture、集成测试，以及 `docs/work-package-evidence/WP-02E.md`。为表达依赖关系，可修改 `work-packages/manifest.json` 与 `work-packages/WP-03B.md`。

## 禁止和非目标

不重写已合并的 `0001`～`0003` migration；不伪造 Workspace 审计的 `project_id/environment`；不把 Project 成员角色建成环境级，除非完整修改身份、FK、ActorContext 和授权测试；不提交或推送。

## 实施要求

- 使用 expand/migrate/contract 迁移 `app.member_role`，最终无损支持 `owner/admin/editor/publisher/reviewer/observer/operator`；
- `workspace_members` 和 `project_members` 增加 revision，角色或状态更新必须精确 revision +1；
- 建立 append-only 成员角色审计模型，支持 Workspace 与 Project scope，启用并强制 RLS；
- 实现 PostgreSQL `changeMemberRoleAndRecordAudit()` adapter，单事务锁定父行与成员行、检查授权快照和 last-owner 不变量、更新角色并写审计；
- Project 成员角色为 Project-wide，成员变更 scope 不携带 environment；
- 集成测试覆盖并发 owner 降权、admin 修改 owner、审计失败回滚、写入失败无审计、跨租户猜测、Workspace/Project 审计和 revision 负例。

## 可验证完成结果

- `./scripts/check-work-package-ready.sh WP-02E` READY；
- `pnpm --filter @modular-mcp/database test:integration` 成功；
- `pnpm --filter @modular-mcp/database build` 成功；
- evidence 状态保持 `IMPLEMENTED_AWAITING_REVIEW`，等待 data gate。

## 衔接输出

Evidence 提供迁移版本、最终角色集合、Repository adapter 契约、事务/锁定/审计语义和集成测试结果。WP-03B 在 WP-02E data gate 通过前不得通过 security gate。

## 停止条件

需要重写 `0001`～`0003`、需要放宽 RLS/append-only/关闭式拒绝、或无法在同一数据库事务内保证角色变更与审计原子性时停止。

---
id: WP-16C
depends_on: [WP-13D, WP-14C]
gate: design
---
# WP-16C 任务、通知、管理与高影响 UI

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-16C`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 UI-35～37、ADM-001～005 及依赖 evidence。

## 目标结果
实现任务/通知中心、受权平台管理视图和三类高影响操作界面。

## 允许修改
`apps/web` tasks/notifications/admin/high-impact routes、hooks/tests。

## 禁止和非目标
不接外部通知、不合并暂停/停止授权/下线、不让普通用户查看平台数据。

## 实施要求
- 任务显示阶段/进度/已保存成果/重试/取消/jobId；
- 通知仅 meaningful state，不为连续进度刷记录；
- 高影响确认含动作/目标/即时影响/客户端/恢复/通知/原因；
- Admin 每个 route 要平台角色且不显示正文。

## 可验证完成结果
- 三动作 UI 文案/请求/结果不同；权限、step-up、恢复 Playwright；
- 任务失败恢复和通知去重测试；普通角色 admin route 无存在性泄漏；
- axe/`pnpm verify:affected` PASS；设计评审通过。

## 衔接输出
Evidence 提供 route 权限、任务/通知状态映射和三动作确认 payload。

## 停止条件
后端动作语义合并、管理权限未定义或需要展示正文时停止。

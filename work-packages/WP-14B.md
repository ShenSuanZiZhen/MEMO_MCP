---
id: WP-14B
depends_on: [WP-14A]
gate: design
---
# WP-14B 表单、状态与反馈组件

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-14B`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 UI 手册第 6/8/9/13 节及 WP-14A evidence。

## 目标结果
实现通用表单、StatusTag、EffectiveResult、IssuePanel、TaskProgress 和页面状态组件。

## 允许修改
`packages/ui`、Storybook、组件测试和最小 web showcase。

## 禁止和非目标
不实现业务页面、不硬编码品牌色、不让组件改变业务权限。

## 实施要求
- label/帮助/错误/aria-describedby 完整；Issue 可定位并无“忽略全部”；
- empty/loading/partial/retryable/nonretryable/permission/degraded 状态；
- 进度含阶段/数值/live region，不抢焦点；
- tokens 语义化，状态不只靠颜色。

## 可验证完成结果
- Storybook 覆盖状态矩阵；键盘和屏幕阅读器语义测试；
- axe 无 serious/critical；视觉快照稳定；
- `pnpm verify:affected` PASS；设计评审通过。

## 衔接输出
Evidence 提供组件 API、stories 路径、a11y 规则和禁止用法。

## 停止条件
需要业务判断进入组件或设计规范冲突时停止。

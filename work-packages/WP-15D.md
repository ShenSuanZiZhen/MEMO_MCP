---
id: WP-15D
depends_on: [WP-11C, WP-12C, WP-14C]
gate: design
---
# WP-15D 预览、测试、审核与部署 UI

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-15D`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 UI-21～26、用户流程第 10～12 节及依赖 evidence。

## 目标结果
实现三视角预览、测试中心、提交/审核、部署进度和发布成功主链路。

## 允许修改
`apps/web` preview/test/review/deploy routes、hooks、Playwright tests。

## 禁止和非目标
不在前端重算 Definition/测试资格；不允许忽略 digest mismatch；不自动创建生产凭证。

## 实施要求
- 三视角共享 previewId/digest；关键修改失效提示；
- 测试可后台运行/筛选/单项重跑且历史可见；
- 提交页显示版本/变更/清单/冻结；审核意见定位；
- 部署失败显示完成阶段/流量状态/重试；摘要错强阻断。

## 可验证完成结果
- 原型链 A、C、D Playwright 全通过；失败/恢复/摘要错路径通过；
- 发布成功页 URL 旁明确需认证；不自动生成凭证；
- axe/键盘/`pnpm verify` PASS；设计评审通过。

## 衔接输出
Evidence 提供端到端 routes、job handling、测试 selectors 和发布后入口。

## 停止条件
API 无法提供固定 digest/历史结果，或需要前端绕过门禁时停止。

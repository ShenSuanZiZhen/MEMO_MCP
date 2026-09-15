---
id: WP-14C
depends_on: [WP-14B]
gate: design
---
# WP-14C 差异、影响确认与响应式 Token

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-14C`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 UI 手册第 6.8/6.9/11/12 节及 WP-14B evidence。

## 目标结果
实现版本差异、强影响确认、数据表/抽屉/modal 和响应式视觉 Token。

## 允许修改
`packages/ui` 相关组件、tokens、Storybook/视觉/a11y 测试。

## 禁止和非目标
不接真实 API、不发起高影响动作、不创造品牌规范。

## 实施要求
- diff 分组/风险筛选；confirm 显示动作/目标/影响/恢复/通知/原因；
- Secret modal 一次展示且不进持久状态/日志；
- 1280/1024/768 断点按 UI 手册；抽屉关闭恢复焦点；
- 表格筛选/排序/列状态可编码到 URL。

## 可验证完成结果
- Storybook/视觉快照覆盖三断点和高影响状态；
- Escape/focus trap/focus return/键盘表格/axe 测试 PASS；
- `pnpm verify:affected` PASS；设计评审通过。

## 衔接输出
Evidence 提供组件 API、token 名、breakpoints 和 Secret 使用约束。

## 停止条件
需要具体品牌值、业务副作用或弱化确认信息时停止。

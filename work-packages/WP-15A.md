---
id: WP-15A
depends_on: [WP-05B, WP-14B]
gate: design
---
# WP-15A 创建方式与目标 UI

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-15A`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 UI-06/07、用户流程第 4～6 节及依赖 evidence。

## 目标结果
实现三种创建入口、模板影响预览、目标表单、能力卡和实时有效结果面板。

## 允许修改
`apps/web` create/goal routes、相关 hooks/tests。

## 禁止和非目标
不实现数据上传和后续步骤；不在前端复制后端业务校验为事实源。

## 实施要求
- UI 使用生成 API 类型；保存未完成与进入下一步分离；
- 写入/删除/整篇/下载显示暂不支持且无隐藏入口；
- 右侧展示选择、预计能力、明确禁止、阻断；
- autosave 接口预留但不自行实现冲突策略。

## 可验证完成结果
- 三种入口和模板影响 Playwright；缺必填可保存不可继续；
- 禁止能力不可通过 DOM/请求开启；键盘/axe/响应式通过；
- `pnpm verify:affected` PASS；设计评审通过。

## 衔接输出
Evidence 提供 routes、form model、API hooks 和下一步导航契约。

## 停止条件
API DTO 不足、需要前端发明业务默认值或扩大能力时停止。

---
id: WP-15B
depends_on: [WP-07C, WP-14B]
gate: design
---
# WP-15B 数据上传处理与预览 UI

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-15B`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 UI-08～14、用户流程第 7 节及依赖 evidence。

## 目标结果
实现来源选择、文件上传/恢复、处理进度、部分成功、数据预览和连接器页面壳。

## 允许修改
`apps/web` data/upload/processing/preview/connector routes、hooks/tests。

## 禁止和非目标
不实现后端连接器、不编辑原始正文、不在浏览器保存连接 Secret。

## 实施要求
- 每文件进度/阶段/重试/替换/排除；长任务可离开恢复；
- partial 明确数量和影响，确认排除前不可继续；
- 文档/表格/JSON 预览默认遮蔽；
- Secret 保存后只显示摘要；连接页仅实现契约允许字段。

## 可验证完成结果
- 断点恢复、2 成功1失败、替换/排除、离开返回 Playwright；
- Secret 不在 localStorage/query cache/snapshot；键盘/axe 通过；
- `pnpm verify:affected` PASS；设计评审通过。

## 衔接输出
Evidence 提供 routes、job polling/backoff、upload state 和 connector shell 插槽。

## 停止条件
需要后端未提供状态、明文 Secret 持久化或原文编辑时停止。

---
id: WP-07C
depends_on: [WP-07B]
gate: none
---
# WP-07C 上传工作流与部分成功

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-07C`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 DAT-003/011/012、Upload 状态机及 WP-07B evidence。

## 目标结果
用持久化工作流编排上传处理阶段、进度、取消、失败项重试和部分成功确认。

## 允许修改
workflow worker upload workflow、control-api job/data version 用例和测试。

## 禁止和非目标
不实现格式解析细节；不把 partial 自动标 completed；不物理删除已发布依赖。

## 实施要求
- workflow 只保存引用；activity 分类重试；进度可离开页面恢复；
- 成功项不因失败项重试而重跑；替换/排除显式记录；
- completed 需要全部成功或用户确认排除；
- 删除前返回影响分析并保护已发布引用。

## 可验证完成结果
- Worker kill 后恢复；重复 signal/activity 不重复成果；
- 2 成功 1 失败保持 partial，确认排除后才 completed；
- 取消/过期/影响分析测试与 `pnpm verify:affected` PASS。

## 衔接输出
Evidence 提供 workflow/activity 名、signal/query、job DTO 和 DataVersion 完成条件。

## 停止条件
Temporal 基座缺失、需要解析实现或改变 DataVersion 不可变语义时停止。

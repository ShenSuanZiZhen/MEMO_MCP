---
id: WP-06D
depends_on: [WP-06C]
gate: none
---
# WP-06D 版本差异与风险分类

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-06D`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 OPS-005、技术方案第 8.3 节及 WP-06C evidence。

## 目标结果
对两个不可变 Definition 生成稳定、分组、可解释的结构差异和风险等级。

## 允许修改
`packages/definition` diff/risk classifier、fixture 和测试。

## 禁止和非目标
不实现 UI、不自动批准差异、不比较运行统计。

## 实施要求
- 分数据、模块、能力、Schema、输出、访问、风险；
- 扩大数据/字段/条数/长度/主体/网络、增加 Tool、启用实时源标 high；
- 纯展示变化可 low，但规则集中且版本化；
- 输出 JSON Pointer、before/after 摘要，不含 Secret/正文。

## 可验证完成结果
- 每种高风险变化有正例，收紧范围不误标扩大；
- 输入顺序不改变 diff；同 digest 返回空；
- `pnpm verify:affected` PASS。

## 衔接输出
Evidence 提供 diff DTO、risk rules version 和下游预览/API 入口。

## 停止条件
产品未定义的新风险类型或需要读取可变 Draft 时停止。

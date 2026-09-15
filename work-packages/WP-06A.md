---
id: WP-06A
depends_on: [WP-04C, WP-05C]
gate: architecture
---
# WP-06A Definition 校验与编译

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-06A`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读技术方案第 8 节、CAP/POL 需求及依赖 evidence。

## 目标结果
把固定 Draft revision 校验并编译为符合 v1 Schema 的完整 Service Definition。

## 允许修改
`packages/definition` compiler/validator、application service、fixture/tests。

## 禁止和非目标
不做 canonical digest/持久化/部署；不从可变 Draft 隐式取最新 revision。

## 实施要求
- 输入显式固定 Draft revision、DataVersion、模块精确版本和 policy 引用；
- 分层执行 schema/domain/module/数据完成状态校验；
- 编译 Tools/Resources/Prompts 和每个值的来源映射；
- 阻断错误定位 JSON Pointer 且顺序稳定。

## 可验证完成结果
- 完整 fixture 编译符合 WP-01D Schema；缺/未完成/blocked 引用均失败；
- 相同固定输入输出深度相等；
- 目标包测试和 `pnpm verify:affected` PASS；架构评审通过。

## 衔接输出
Evidence 固定 compiler 输入/输出、校验顺序和来源映射格式。

## 停止条件
需要浮动版本、读取最新 Draft 或改变 Definition Schema 时停止。

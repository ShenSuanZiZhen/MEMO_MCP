---
id: WP-04B
depends_on: [WP-04A]
gate: architecture
---
# WP-04B 模块依赖与冲突解析

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-04B`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 MOD-003～005、用户流程第 8 节及 WP-04A evidence。

## 目标结果
实现确定性的依赖闭包、循环/冲突检测、一键补齐和替代方案计算。

## 允许修改
`packages/module-sdk` resolver、纯算法测试和模块图 fixture。

## 禁止和非目标
不修改 manifest schema、不自动选择高风险方案、不写 UI/API。

## 实施要求
- 解析结果顺序稳定，包含原因、关系路径和 JSON Pointer；
- 一键补齐只加入满足约束的已知依赖，执行前返回变更集；
- 冲突给可执行方案但不替用户确认；
- 检测循环、缺失、不兼容和多版本冲突。

## 可验证完成结果
- DAG、diamond、cycle、冲突和替代 fixture 全通过；
- 随机输入顺序不改变结果；
- `pnpm verify:affected` PASS；架构评审通过。

## 衔接输出
Evidence 固定 resolver 输入/输出、排序和错误码。

## 停止条件
需要更改版本选择策略或自动接受风险方案时停止。

---
id: WP-08C
depends_on: [WP-08A]
gate: none
---
# WP-08C DOCX/CSV/XLSX/JSON 解析

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-08C`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 DAT-004/010/011、用户流程数据预览规则及 WP-08A evidence。

## 目标结果
在统一规范模型中支持 DOCX、CSV、XLSX、JSON，并提供页/表/字段定位错误。

## 允许修改
对应 parser adapters、normalizer、合成 fixture/golden 和测试。

## 禁止和非目标
不执行宏/公式/外链、不编辑原文、不改变 TXT/PDF 行为。

## 实施要求
- CSV 编码/分隔符受控；JSON 深度/节点数受限；
- XLSX 只读取缓存值/数据，不计算公式、不执行宏；
- DOCX 忽略活动内容和外部引用；
- 字段类型推断可解释且稳定，敏感提示不输出原值。

## 可验证完成结果
- 每格式正常/空/损坏/超限/恶意结构 fixture；公式和宏不执行；
- 重复处理模型/ID 稳定，局部错误可定位；
- `pnpm verify:affected` PASS。

## 衔接输出
Evidence 记录格式矩阵、限制、推断规则和 normalized mapping。

## 停止条件
需要宏、公式重算、远程引用或改变公共模型时停止。

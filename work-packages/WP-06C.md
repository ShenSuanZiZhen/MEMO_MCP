---
id: WP-06C
depends_on: [WP-06B]
gate: architecture
---
# WP-06C Canonical JSON、Digest 与不可变存储

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-06C`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读技术方案第 8.2 节及 WP-06B evidence。

## 目标结果
对编译结果规范化、计算 SHA-256，并以 digest 为核心不可变保存和去重。

## 允许修改
`packages/definition` canonical/hash、Definition repository/use-case、golden tests。

## 禁止和非目标
不创建 Candidate/Deployment；不修改规范算法以迁就单个 fixture。

## 实施要求
- 采用 ADR 固定的 RFC 8785 或等价算法；包含 schema/builder version；
- 相同语义 bit-for-bit 相同，语义变化改变 digest；
- 存储后禁止更新，重复编译返回已有 definitionId；
- 规范化不丢弃安全相关显式默认值。

## 可验证完成结果
- 属性顺序/格式不影响 digest；字段/限制/版本变化影响 digest；
- 数据库 UPDATE 不可变记录失败；并发重复只保存一份；
- golden、迁移、`pnpm verify` PASS；架构评审通过。

## 衔接输出
Evidence 固定算法/版本、digest 格式、repository 读取接口和 golden 摘要。

## 停止条件
规范算法未定、Schema 需破坏性变化或必须更新历史记录时停止。

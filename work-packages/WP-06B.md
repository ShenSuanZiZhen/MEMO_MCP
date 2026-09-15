---
id: WP-06B
depends_on: [WP-06A]
gate: security
---
# WP-06B Effective Limits 与属性测试

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-06B`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 POL-001～005、技术方案第 11.2 节及 WP-06A evidence。

## 目标结果
实现平台/项目/模块/服务/策略/凭证限制的确定性交集纯函数。

## 允许修改
`packages/definition` effective-limits、属性测试与 fixture。

## 禁止和非目标
不调用 OPA/Redis；不写 UI；不自动扩大空集或缺失限制。

## 实施要求
- 数值上限取最小值，字段/能力/数据范围取交集；
- 缺失保护层、空允许集或非法范围返回阻断；
- 输出每个有效值的来源和收紧原因；
- 属性测试覆盖交换律、结合律、幂等、单调收紧。

## 可验证完成结果
- 随机属性测试不少于约定样本；任意增加限制不会扩大结果；
- 平台最大 5 段不能被客户端值扩大；
- `pnpm verify:affected` PASS；安全评审通过。

## 衔接输出
Evidence 提供纯函数 API、限制模型和来源解释 DTO。

## 停止条件
不同限制层出现无法定义的优先级或需要默认放行时停止。

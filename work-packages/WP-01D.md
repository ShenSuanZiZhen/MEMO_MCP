---
id: WP-01D
depends_on: [WP-01A]
gate: api
---
# WP-01D Definition、模块、策略与事件 Schema

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-01D`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读技术方案第 7/8/11/12 节和 PRD 模块、版本、访问规则。

## 目标结果
冻结 Service Definition、Module Manifest、PolicyInput/Decision 和事件信封的 v1 Schema。

## 允许修改
`packages/contracts` 的 JSON Schema、示例、生成类型、schema registry 配置。

## 禁止和非目标
不写 resolver/compiler/OPA 规则；不加入自定义模块执行字段。

## 实施要求
- Definition 引用精确 data/module/policy 版本和 digest；
- Manifest 声明依赖、冲突、权限、限制、风险、签名；
- PolicyDecision 仅返回 allow/reason/effective scope/limits/version/id；
- 事件只含引用和元数据，不含正文/Secret。

## 可验证完成结果
- golden/negative fixture 全通过；浮动生产版本、缺 digest、事件正文均被拒绝；
- schema 兼容测试与类型生成无 diff；`pnpm verify` PASS；API 评审通过。

## 衔接输出
Evidence 固定 schema URI、canonicalization 输入边界和事件版本命名。

## 停止条件
需要改变 Definition 事实模型或新增用户代码执行时停止。

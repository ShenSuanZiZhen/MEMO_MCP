---
id: WP-03B
depends_on: [WP-03A]
gate: security
---
# WP-03B Workspace/Project RBAC

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-03B`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 PRD 第 4 节、ACC-002～005 和 WP-03A evidence。

## 目标结果
实现 Workspace/Project 角色叠加取更严格结果及控制面默认拒绝。

## 允许修改
`packages/authz` RBAC、control-api Workspace/Project/member 用例与测试。

## 禁止和非目标
不实现数据面 policy；不加入任意表达式权限；不缓存导致撤权延迟。

## 实施要求
- 权限矩阵覆盖 owner/admin/editor/publisher/reviewer/observer/operator；
- 每个 endpoint 显式声明 capability，未声明默认拒绝；
- 角色变更下一操作生效并审计；
- 无权/不存在响应统一。

## 可验证完成结果
- 完整角色×操作矩阵测试；收紧角色后下一请求拒绝；
- 两 Workspace 同名资源无法区分存在性；未标注 endpoint 启动或测试失败；
- `pnpm verify` PASS；安全评审通过。

## 衔接输出
Evidence 提供 capability 常量、授权 middleware 和成员变更语义。

## 停止条件
角色冲突无法按更严格原则解释或需要放宽默认拒绝时停止。

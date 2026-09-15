---
id: WP-03C
depends_on: [WP-03B]
gate: security
---
# WP-03C 二次验证与身份审计

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-03C`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 ACC-006、PUB/OPS 高影响规则及 WP-03B evidence。

## 目标结果
为发布、暂停、下线、撤权和扩大范围建立 step-up 检查和不可变审计。

## 允许修改
`packages/authz`、control-api step-up/audit 用例、相关契约实现和测试。

## 禁止和非目标
不实现具体部署/凭证动作；不保存认证因子；不自行决定 MFA 产品流程。

## 实施要求
- 定义认证新鲜度和 action intent，intent 单次/短时/绑定目标；
- 执行动作时重新校验 actor/role/target/revision；
- 审计记录操作者、时间、原因、目标和 requestId，不记敏感值；
- 重放、跨目标、过期 intent 拒绝。

## 可验证完成结果
- 过期、重放、目标替换、角色变化后执行均失败；
- 合法 intent 只能消费一次且形成审计；
- `pnpm verify:affected` PASS；安全评审通过。

## 衔接输出
Evidence 提供 step-up port、intent claims、动作接入示例和审计字段。

## 停止条件
需要接真实 MFA、改变 IdP 或审计保留策略未决时停止。

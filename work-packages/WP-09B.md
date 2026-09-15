---
id: WP-09B
depends_on: [WP-09A]
gate: security
---
# WP-09B 策略情景评估与原因

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-09B`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读用户流程第 9.4/10.2 节、PRD 访问规则及 WP-09A evidence。

## 目标结果
实现主体、角色、客户端、时间、环境、能力、数据范围和服务状态的 P0 策略及模拟评估。

## 允许修改
`infra/policies` P0 bundle、policy scenario service、fixture/tests。

## 禁止和非目标
不允许任意用户表达式、不实现配额计数、不通过 UI 输入 Rego。

## 实施要求
- 凭证与服务策略取交集；初始化/发现也判定；
- 模拟使用同一 policy bundle/输入构造但不产生真实用量；
- reasonCode 稳定、对外不泄露隐藏对象；
- bundle 规则和测试同版本提交。

## 可验证完成结果
- 角色×环境×能力×数据×时间×状态决策矩阵通过；
- 任一维度收紧不会从 deny 变 allow；
- scenario 与真实 evaluator 对同输入结果相同；`pnpm verify` PASS；安全评审通过。

## 衔接输出
Evidence 记录 policyVersion、规则矩阵、reasonCode 和模拟 API。

## 停止条件
需要任意表达式、策略无法单调收紧或产品规则冲突时停止。

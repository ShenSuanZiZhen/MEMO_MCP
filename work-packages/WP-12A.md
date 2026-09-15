---
id: WP-12A
depends_on: [WP-11C, WP-03C]
gate: release
---
# WP-12A Candidate 冻结与审核

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-12A`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 PUB-001～004、用户流程第 12.1～12.4 节及依赖 evidence。

## 目标结果
实现提交清单、Candidate 冻结、审核状态/意见、撤回和修订流程。

## 允许修改
review/release domain/application/API/repository 和测试。

## 禁止和非目标
不构建制品、不部署、不允许提交后原地修改。

## 实施要求
- 提交要求无阻断、预览确认、同 digest 完整测试 PASS、step-up；
- Candidate 保存 definitionId/digest 和快照式证据引用；
- reviewer 与 publisher 权限分离；意见定位步骤/JSON Pointer；
- 修改必须撤回/changes_requested 后创建新 revision/candidate。

## 可验证完成结果
- 缺测试/失效预览/错角色/过期 step-up 均不能提交；
- 提交后修改被拒绝；各审核状态合法转换/审计通过；
- `pnpm verify` PASS；发布评审通过。

## 衔接输出
Evidence 提供 Candidate/Review use-case、资格查询、状态表和下游 approved 事件。

## 停止条件
需要跳过审核、改冻结对象或审核职责未决时停止。

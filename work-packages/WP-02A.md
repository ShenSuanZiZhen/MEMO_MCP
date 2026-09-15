---
id: WP-02A
depends_on: [WP-01D]
gate: data
---
# WP-02A 领域值对象与状态框架

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-02A`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 PRD 第 5/8/9 节、技术方案第 6/13 节及 WP-01D evidence。

## 目标结果
实现无基础设施依赖的领域值对象、聚合接口和状态转换框架。

## 允许修改
`packages/domain` 和纯领域测试。

## 禁止和非目标
不导入数据库/Web/Temporal/OPA；不建表；不实现用例编排。

## 实施要求
- 实现 Workspace/Project/Data/Draft/Module/Definition/Release/Access 的 ID 和版本值对象；
- 状态转换显式校验前态、角色能力、revision 和原因；
- 非法状态返回领域错误码，不抛基础设施错误；
- 时间/ID 由端口注入，测试确定性。

## 可验证完成结果
- PRD 六类关键状态机每条合法/非法边都有测试；
- domain dependency test 证明无基础设施 import；
- `pnpm --filter @studio/domain test` 与 `pnpm verify:affected` PASS；数据评审通过。

## 衔接输出
Evidence 列出聚合公开 API、状态表和错误码映射。

## 停止条件
状态语义在 PRD/方案中不一致或需要持久化细节进入 domain 时停止。

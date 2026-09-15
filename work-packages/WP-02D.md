---
id: WP-02D
depends_on: [WP-02C]
gate: data
---
# WP-02D Repository、Outbox 与幂等

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-02D`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读技术方案第 6.4/13 节及 WP-02C evidence。

## 目标结果
实现领域 repository adapter、事务边界、outbox 和通用幂等记录。

## 允许修改
`packages/database` adapters、application transaction helpers、集成测试。

## 禁止和非目标
不实现具体 HTTP 用例、不引入消息总线、不把 Redis 当事实源。

## 实施要求
- Repository 每个方法显式接收 tenant scope；事务设置 RLS context；
- 状态变更和 outbox 同事务；publisher 至少一次，consumer 去重；
- Idempotency-Key 保存规范化请求摘要，同键异参拒绝；
- 并发创建依赖数据库唯一约束而非进程锁。

## 可验证完成结果
- 20+ 并发同键只产生一个业务事实和一个逻辑事件；
- 事务回滚时 outbox 不出现，重复投递消费一次；
- tenant 参数缺失编译失败或运行拒绝；`pnpm verify` PASS；数据评审通过。

## 衔接输出
Evidence 提供 transaction/repository/idempotency/outbox 公开入口和重试语义。

## 停止条件
需要分布式事务、外部 broker 或绕过 RLS 才能完成时停止。

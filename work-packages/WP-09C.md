---
id: WP-09C
depends_on: [WP-09A]
gate: security
---
# WP-09C Redis 配额与并发控制

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-09C`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 POL-003/005/007、技术方案第 11.3 节及 WP-09A evidence。

## 目标结果
实现按主体/凭证/服务/环境隔离的原子速率、配额和并发控制。

## 允许修改
quota port、Redis adapter/Lua、usage reservation 测试和配置。

## 禁止和非目标
不做计费、不保存唯一用量事实、不在 Redis 故障时生产放行。

## 实施要求
- key 含 tenant/env/service/version/principal/bucket；
- 原子 reserve/commit/release，超时连接必须释放并发；
- 重试/重复请求不重复计量；Redis 故障生产关闭式拒绝；
- 返回剩余量/重置时间，不暴露其他主体。

## 可验证完成结果
- 高并发下不超发；取消/超时无并发泄漏；重复 idempotency key 计量一次；
- Redis down/slow 按环境策略处理且生产拒绝；
- 集成/并发测试、`pnpm verify` PASS；安全评审通过。

## 衔接输出
Evidence 提供 QuotaPort、key 结构、原子脚本摘要和故障语义。

## 停止条件
需要计费、弱一致超发或默认放行时停止。

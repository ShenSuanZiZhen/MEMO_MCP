---
id: WP-03A
depends_on: [WP-02B]
gate: security
---
# WP-03A OIDC 与 ActorContext

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-03A`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 ACC-001/005、技术方案第 6.3/10.3 节及 WP-02B evidence。

## 目标结果
实现 OIDC token 验证、本地 IdP 和不可伪造的 ActorContext。

## 允许修改
`packages/authz`、control-api auth middleware、本地 IdP fixture、测试。

## 禁止和非目标
不实现 OAuth MCP 客户端；不信任请求 header 中的 workspace/role；不接真实企业 IdP。

## 实施要求
- 校验签名、issuer、audience、exp、nbf、subject；
- ActorContext 只由验证结果和成员查询构造；
- 本地 IdP 仅 development 可启用且生产配置失败关闭；
- 日志只记录内部 actorId 和错误类别。

## 可验证完成结果
- 伪造签名、错 audience、过期/未生效 token、注入角色均拒绝；
- 合法 token 构造稳定 ActorContext；生产启用 dev IdP 启动失败；
- `pnpm verify:affected` PASS；安全评审通过。

## 衔接输出
Evidence 固定 middleware 入口、ActorContext schema 和 dev token 使用方法。

## 停止条件
身份源关键字段未确认或必须信任客户端租户字段时停止。

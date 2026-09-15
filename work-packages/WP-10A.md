---
id: WP-10A
depends_on: [WP-06C, WP-09A]
gate: security
---
# WP-10A MCP Transport、认证与 Definition 加载

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-10A`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 CAP/POL、技术方案第 10.1 节及依赖 evidence。

## 目标结果
建立远程 MCP Gateway 传输入口、身份认证、服务/环境/版本解析和不可变 Definition 加载。

## 允许修改
`apps/mcp-gateway` transport/middleware、Definition read adapter、协议测试。

## 禁止和非目标
不实现 Tool 业务、不写控制面、不允许匿名发现或加载 Draft。

## 实施要求
- 使用项目固定的 MCP SDK/协议版本；输入 schema 校验和大小/超时限制；
- 只加载 published/healthy 且 digest 核验通过 Definition；
- 每请求创建 requestId/traceId 和 ActorContext；
- 认证、服务状态、策略不可用均结构化拒绝。

## 可验证完成结果
- 合法握手到达空 runtime；匿名/错环境/Draft/暂停/摘要错均拒绝；
- 畸形/超大请求不崩溃且无堆栈泄漏；
- 协议/集成测试、`pnpm verify` PASS；安全评审通过。

## 衔接输出
Evidence 固定 middleware 顺序、transport config、Definition cache 失效接口和错误映射。

## 停止条件
协议版本未定、需要匿名入口或绕过 digest 校验时停止。

---
id: WP-17A
depends_on: [WP-08D, WP-09A]
gate: security
---
# WP-17A 只读 HTTP Connector

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-17A`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 DAT-005/008/009、NFR-SEC-004、技术方案第 9.2 节及依赖 evidence。

## 目标结果
实现固定 Base URL/路径、受控认证/分页/字段映射的只读 HTTP 数据连接器和连接测试。

## 允许修改
connector worker HTTP adapter、egress validation、Secret port、fixture server/tests。

## 禁止和非目标
不允许写方法、客户端运行时改 host/scheme/path、私网访问或任意重定向。

## 实施要求
- 只允许 GET/HEAD（如契约规定）；保存后 Secret 不回显；
- DNS 解析后及每次 redirect 复验 IPv4/IPv6，阻断 loopback/link-local/private/metadata；
- timeout/响应大小/分页页数/字段 allowlist；
- 连接测试分认证/网络/status/schema/pagination。

## 可验证完成结果
- private IP、IPv6、编码 host、DNS 重绑定、redirect、超大/慢响应均阻断；
- 正常分页/字段映射和 Secret 脱敏通过；
- security/integration、`pnpm verify` PASS；安全评审通过。

## 衔接输出
Evidence 提供 connector config、egress policy、Secret references、错误阶段和 fixture。

## 停止条件
需要写方法、私网例外、动态 host 或生产 Secret 时停止。

---
id: WP-18A
depends_on: [WP-13D, WP-17A, WP-17B, WP-17C]
gate: security
---
# WP-18A 系统级安全 E2E

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-18A`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 PRD 第 13 节安全任务、技术方案第 14/17 节及全部依赖 evidence。

## 目标结果
建立跨组件的租户隔离、越权、撤权、SSRF、路径、注入、日志和制品篡改发布门禁。

## 允许修改
`tests/security`、合成 fixture、测试 harness；仅修复测试发现且属于既有契约的小缺陷。

## 禁止和非目标
不做未授权攻击、不使用生产目标/数据、不以跳过或 mock 核心保护获得通过。

## 实施要求
- 两 Workspace 同名资源覆盖控制面、MCP、搜索、对象、连接器、trace；
- 无凭证/无能力/超配额/撤权下一请求；
- SSRF IPv4/IPv6/DNS/redirect、prefix/path、SQL、恶意文件；
- Definition/artifact/module 签名篡改；敏感 marker 全 telemetry 扫描。

## 可验证完成结果
- 安全套件从干净 compose 可一键运行且全部 PASS；
- 每个 PRD 安全负例有唯一测试 ID 和失败时证据；
- 高/严重发现为零；`pnpm verify` PASS；安全评审通过。

## 衔接输出
Evidence 提供测试矩阵、命令、报告路径、已修复发现和残余风险。

## 停止条件
需要生产攻击、超出授权范围、发现架构级高危或修复跨越多个 WP 时停止并立项。

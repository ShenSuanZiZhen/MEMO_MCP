---
id: WP-17C
depends_on: [WP-08D, WP-09A]
gate: security
---
# WP-17C 只读数据库 Connector

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-17C`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 DAT-007/008/009、技术方案第 9.2 节及依赖 evidence。

## 目标结果
实现首批数据库的只读连接、Schema 选择、字段 allowlist、参数化过滤和稳定游标。

## 允许修改
connector worker DB adapter、query builder、Secret port、Testcontainers tests。

## 禁止和非目标
不接受 SQL 字符串、不写/DDL/存储过程、不暴露任意 schema/table/field。

## 实施要求
- 验证只读账号/事务，固定允许 database/schema/table/view/field/filter；
- 所有值参数化，标识符来自已验证 catalog；
- 必须有主键/稳定游标；行数/时间/响应限制；
- 连接测试分认证/网络/权限/schema/cursor。

## 可验证完成结果
- SQL 注入、标识符注入、越表/字段、写语句、无稳定游标均拒绝；
- 只读正常分页无重复/遗漏，Secret/DSN 脱敏；
- Testcontainers/security、`pnpm verify` PASS；安全评审通过。

## 衔接输出
Evidence 提供支持数据库/版本、query AST、allowlist、只读验证和错误阶段。

## 停止条件
需要任意 SQL、写权限、无游标全表扫描或数据库类型未确认时停止。

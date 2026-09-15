---
id: WP-19A
depends_on: [WP-12C, WP-18D]
gate: release
---
# WP-19A Helm/Terraform 与多环境隔离

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-19A`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读技术方案第 16 节、ACC-005/PUB-008 及依赖 evidence。

## 目标结果
建立开发/测试/生产的 Helm/Terraform 声明、独立身份/数据/密钥边界和干净环境部署。

## 允许修改
`infra/helm`、`infra/terraform`、环境 schema、部署测试和文档；仅对批准 sandbox 账户 apply。

## 禁止和非目标
不创建未批准生产资源、不硬编码 Secret/账号/region、不复制生产数据到低环境。

## 实施要求
- namespace、DB、bucket、index、Redis、key、service account 按环境隔离；
- 最小 RBAC/network policy/resource limits/PDB；
- values schema 校验，Secret 引用外部 manager；
- plan 可审查，制品以 digest 部署。

## 可验证完成结果
- helm lint/template/schema、terraform fmt/validate/plan 和策略测试 PASS；
- 干净 sandbox 部署/health/smoke；跨环境身份/凭证/数据访问失败；
- `pnpm verify` PASS；发布评审通过。

## 衔接输出
Evidence 提供模块/values、资源清单、环境边界、plan 摘要和销毁/成本说明。

## 停止条件
缺批准云账户、数据驻留/region 未定、plan 含意外删除或需要生产 Secret 时停止。

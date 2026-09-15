---
id: WP-00B
depends_on: [WP-00A]
gate: none
---
# WP-00B 本地基础设施编排

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-00B`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。先通过 readiness 检查并阅读 WP-00A evidence、技术方案第 5/16 节。

## 目标结果
用 Docker Compose 一键启动 P0 本地依赖并提供确定的健康检查。

## 允许修改
`infra/compose`、本地基础设施脚本、`.env.example`、相关 README。

## 禁止和非目标
不创建云资源、不放真实凭证、不实现业务服务、不暴露到非 loopback 默认地址。

## 实施要求
- 编排 PostgreSQL、Redis、MinIO、OpenSearch、Temporal、OPA、OTel；
- 固定镜像版本、volume、healthcheck 和可配置端口；
- 提供 `infra:up/down/reset/status/smoke`，reset 必须明确确认范围；
- 使用合成开发密钥和 bucket/index 初始化。

## 可验证完成结果
- `docker compose ... config --quiet` 和 `pnpm infra:up` PASS；
- `pnpm infra:smoke` 验证每个依赖健康；
- down/up 后持久数据存在，reset 后仅项目 volume 被清理；
- `pnpm verify:affected` PASS。

## 衔接输出
Evidence 记录端口、服务名、默认账号类型、健康端点和 reset 影响。

## 停止条件
端口/镜像与组织策略冲突、需要生产 Secret 或需要修改应用代码时停止。

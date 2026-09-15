---
id: WP-12C
depends_on: [WP-12B]
gate: release
---
# WP-12C 部署工作流与流量开放

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-12C`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 PUB-005～008、Deployment 状态机及 WP-12B evidence。

## 目标结果
实现 provisioning→load→health→digest verify→open endpoint 的幂等部署工作流。

## 允许修改
deployment workflow/adapter、开发 Helm/Compose runtime、API、测试。

## 禁止和非目标
不创建生产云资源、不跨环境复用凭证/数据、不在失败时接流量。

## 实施要求
- 只部署签名通过的 approved artifact；运行时回报 definition/artifact digest；
- 任一阶段失败保留进度、可重试且 endpoint 关闭；
- ServiceVersion/Deployment 创建幂等；
- 环境提升使用同一 artifact digest。

## 可验证完成结果
- 正常部署健康可调用；加载/健康/摘要错均零流量；
- Worker kill/重复请求不重复版本或 Deployment；
- integration/E2E、`pnpm verify` PASS；发布评审通过。

## 衔接输出
Evidence 提供 workflow/activity、状态/事件、路由开关、回退入口和开发 endpoint。

## 停止条件
需要真实生产部署、跳过摘要/签名或环境数据混用时停止。

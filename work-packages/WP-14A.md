---
id: WP-14A
depends_on: [WP-01B, WP-03A]
gate: design
---
# WP-14A Web Shell、导航与 API Client

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-14A`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 UI 手册第 3～5 节、WP-01B/03A evidence。

## 目标结果
实现 Web 应用外壳、导航、Workspace/Project/Environment 切换、session 和类型安全 API Client。

## 允许修改
`apps/web` shell/routing/session/api client、基础测试。

## 禁止和非目标
不实现业务页面、不自建第二套 DTO、不在浏览器保存 Secret。

## 实施要求
- API 类型来自 contracts 生成物；统一错误/202 Job/cursor 处理；
- 切换租户清空相关 query cache 和页面状态；
- 环境/生产标识清晰，权限不足不渲染敏感内容；
- landmark、跳过导航、键盘焦点基座。

## 可验证完成结果
- route/session/401/403/切换租户测试；切换后无旧租户缓存；
- API contract mock 测试和 axe 基线 PASS；
- `pnpm verify:affected` PASS；设计评审通过。

## 衔接输出
Evidence 提供 route map、API client hooks、session/cache key 和 layout slots。

## 停止条件
后端契约缺失、需要复制类型或持久化 Secret 时停止。

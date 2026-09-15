---
id: WP-16A
depends_on: [WP-13A, WP-13B, WP-14C]
gate: design
---
# WP-16A 凭证与服务概览 UI

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-16A`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 UI-27～29、用户流程第 13 节及依赖 evidence。

## 目标结果
实现 API Key/OAuth Client 管理和服务概览，包括一次展示、轮换、撤销及指标摘要。

## 允许修改
`apps/web` credentials/service-overview routes、hooks、Playwright tests。

## 禁止和非目标
不把 Secret 写 localStorage、日志、URL 或 query cache；不实现计费。

## 实施要求
- Key 创建 modal 只显示一次，关闭前确认保存；列表只见 prefix/末四位；
- OAuth 展示 client ID、一次 Secret、授权/token/MCP URL；
- 概览按环境/版本显示状态、调用/拒绝/错误/延迟/告警；
- 轮换/撤销使用影响确认和 step-up。

## 可验证完成结果
- Secret 刷新后不可恢复，浏览器存储/网络日志/snapshot 无明文；
- 轮换窗口和撤销下一请求 UI 状态 Playwright 通过；
- axe/键盘/`pnpm verify:affected` PASS；设计评审通过。

## 衔接输出
Evidence 提供 routes、Secret handling 规则、测试 selector 和概览 query key。

## 停止条件
后端返回可重复读取 Secret、需要前端保存 Secret 或缺 step-up 时停止。

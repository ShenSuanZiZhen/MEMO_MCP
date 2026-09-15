---
id: WP-13A
depends_on: [WP-12C, WP-09C]
gate: security
---
# WP-13A API Key 生命周期

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-13A`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 POL-006、OPS-009、用户流程第 13.2 节及依赖 evidence。

## 目标结果
实现 API Key 创建一次展示、验证、范围、到期、轮换、撤销和最近使用。

## 允许修改
credential domain/application/API、hash/pepper adapter、Gateway auth adapter、测试。

## 禁止和非目标
不保存/恢复明文 Key、不实现 OAuth、不通过日志/事件传 Secret。

## 实施要求
- 256-bit 随机；库中保存不可逆 hash、prefix、末四位和元数据；
- Key 绑定 workspace/project/environment/service/policy scopes；
- 轮换支持受控双 key 窗口，分别可撤销；
- 撤销/过期后下一请求拒绝并审计。

## 可验证完成结果
- 数据库/日志/trace 扫描无明文；完整 Key 仅创建响应一次；
- 错环境、错 scope、过期、撤销、轮换截止测试通过；
- `pnpm verify` PASS；安全评审通过。

## 衔接输出
Evidence 提供 Key 格式、验证 port、轮换/撤销事件和一次展示 UI 契约。

## 停止条件
需要可恢复明文、跨环境 Key 或 pepper/KMS 决策未定时停止。

---
id: WP-00A
depends_on: []
gate: architecture
---
# WP-00A Workspace 与工具链基座

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-00A`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。先阅读 `work-packages/00_全局开发约束.md`、技术方案第 5 节和本文件；不要实现业务功能。

## 目标结果
建立 pnpm monorepo、统一工具链、空应用/共享包和可执行的根验证命令。

## 允许修改
根配置、`apps/*` 空骨架、`packages/*` 空骨架、`scripts`、`.gitignore`、`AGENTS.md`。

## 禁止和非目标
不实现 API、数据库表、页面和云部署；不选择未评审的业务框架扩展。

## 实施要求
- 建立 `web/control-api/mcp-gateway/workers` 与方案规定的共享包；
- TypeScript strict、统一 lint/format/test/build；建立 `verify:affected` 和 `verify`；
- 添加架构测试，禁止 domain 导入基础设施和 apps；
- 固定 Node/pnpm 版本与 lockfile，README 给出 bootstrap 命令。

## 可验证完成结果
- `pnpm install --frozen-lockfile`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` 全部 PASS；
- 人为在 domain 导入数据库包时架构测试失败；恢复后 `pnpm verify` PASS；
- 新 clone 按 README 可完成安装，不需要 Secret。

## 衔接输出
生成 `docs/work-package-evidence/WP-00A.md`，记录包名、根命令、目录边界和工具版本；架构评审通过后 status 才为 PASS。

## 停止条件
需要实现业务代码、修改产品范围或无法在现有 Node 22/pnpm 环境复现时停止。

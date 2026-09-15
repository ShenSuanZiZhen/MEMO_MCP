---
work_package: WP-00A
status: IMPLEMENTED_AWAITING_REVIEW
baseline: "no-git; initial tree contained product docs, work-packages, and readiness scripts only"
completed_at: "2026-09-15T07:59:38Z"
---

# WP-00A 完成证据

## 实现结果

已建立 pnpm monorepo 基座，包含 4 个空应用骨架、11 个方案规定共享包、统一 TypeScript strict 配置、根验证命令、lockfile 和 domain 架构边界测试。当前实现不包含业务 API、数据库表、页面、云部署或生产 Secret。

## 包名

- Apps：`@modular-mcp/web`、`@modular-mcp/control-api`、`@modular-mcp/mcp-gateway`、`@modular-mcp/workers`
- Packages：`@modular-mcp/contracts`、`@modular-mcp/domain`、`@modular-mcp/database`、`@modular-mcp/authz`、`@modular-mcp/definition`、`@modular-mcp/module-sdk`、`@modular-mcp/module-builtins`、`@modular-mcp/data-access`、`@modular-mcp/observability`、`@modular-mcp/test-fixtures`、`@modular-mcp/ui`

## 根命令

- `pnpm install --frozen-lockfile`：按 `pnpm-lock.yaml` 安装。
- `pnpm lint`：检查 workspace package 元数据和基线约定。
- `pnpm typecheck`：执行 `tsc --build tsconfig.packages.json` strict 项目引用。
- `pnpm test`：执行 Vitest 架构测试。
- `pnpm build`：递归构建所有 workspace app/package。
- `pnpm verify:affected`：依次执行 lint、typecheck、test、build。
- `pnpm verify`：执行完整根验证链。

## 目录边界

- `apps/*`：仅保存可部署应用空骨架；本包未实现页面或 API。
- `packages/contracts`：预留 OpenAPI、JSON Schema、事件和错误契约。
- `packages/domain`：纯领域层；架构测试禁止导入 apps、database、data-access、observability、authz、ui、Temporal、OPA、Redis、OpenSearch、Prisma/Kysely 和云 SDK。
- `packages/database`、`packages/data-access`、`packages/observability`：基础设施/适配器边界，不能被 domain 反向依赖。
- `tests/architecture`：保存跨包架构规则测试。

## 工具版本

- Node：`v22.22.3`
- pnpm：`12.4.1`
- TypeScript：`5.9.2`
- Vitest：`3.2.4`
- Prettier：`3.6.2`
- `@types/node`：`22.18.6`

## 变更文件

- `package.json`：根 package、引擎、pnpm 版本、统一验证脚本和固定 devDependencies。
- `pnpm-lock.yaml`、`pnpm-workspace.yaml`、`.npmrc`、`.node-version`：workspace、lockfile、构建脚本允许列表和版本固定。
- `tsconfig.base.json`、`tsconfig.packages.json`、`vitest.config.ts`：strict TS、项目引用和测试配置。
- `apps/*/{package.json,tsconfig.json,src/index.ts}`：4 个空应用骨架。
- `packages/*/{package.json,tsconfig.json,src/index.ts}`：11 个共享包空骨架。
- `scripts/lint-workspace.mjs`：workspace 元数据 lint。
- `tests/architecture/domain-boundaries.test.ts`：domain 禁止依赖 apps/基础设施的架构测试。
- `.gitignore`、`.prettierignore`、`README.md`、`AGENTS.md`：仓库忽略规则、bootstrap 文档和开发约束提示。
- `docs/work-package-evidence/WP-00A.md`：本 evidence。

## 契约和衔接

- 新增公开 workspace 包名见“包名”章节；当前只暴露空入口常量，不承载业务契约。
- 新增根运行命令见“根命令”章节；下游 WP 应使用 `pnpm verify:affected` 或 `pnpm verify`。
- 新增架构测试入口：`tests/architecture/domain-boundaries.test.ts`。
- 未新增 API、Schema、事件、端口、环境变量、migration 或 feature flag。

## 验证记录

| 命令                                             | 结果   | 关键输出                                                                                            |
| ---------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------- |
| `./scripts/check-work-package-ready.sh WP-00A` | PASS | `READY WP-00A`                                                                                  |
| `pnpm install --frozen-lockfile`               | PASS | lockfile up to date; `Done ... using pnpm v12.4.1`                                              |
| `pnpm lint`                                    | PASS | `lint passed: 15 workspace package manifests checked`                                           |
| `pnpm format`                                  | PASS | `All matched files use Prettier code style!`                                                    |
| `pnpm typecheck`                               | PASS | `tsc --build tsconfig.packages.json`                                                            |
| `pnpm test`                                    | PASS | `tests/architecture/domain-boundaries.test.ts (1 test)`                                         |
| `pnpm build`                                   | PASS | 4 apps and 11 packages completed `tsc --build`                                                  |
| negative architecture probe                    | PASS | 临时在 `packages/domain/src/index.ts` 导入 `@modular-mcp/database` 时，`pnpm test` 失败并报告该 import；恢复后通过 |
| `pnpm verify`                                  | PASS | lint、typecheck、test、build 全部通过                                                                  |

注：本环境普通沙箱无 npm registry DNS；依赖安装命令在授权网络下完成。新 clone 不需要 Secret，但需要常规 npm registry 访问或预热 pnpm store。

## 验收标准核对

- [x] 建立 `apps/web`、`apps/control-api`、`apps/mcp-gateway`、`apps/workers`。
- [x] 建立技术方案第 5 节规定的共享包。
- [x] TypeScript strict、统一 lint/format/test/build、`verify:affected` 和 `verify` 已建立。
- [x] 架构测试禁止 domain 导入基础设施和 apps。
- [x] Node/pnpm 版本和 lockfile 已固定，README 提供 bootstrap 命令。
- [x] `pnpm install --frozen-lockfile`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` 全部 PASS。
- [x] 人为在 domain 导入数据库包时架构测试失败，恢复后 `pnpm verify` PASS。
- [x] 新 clone bootstrap 不需要 Secret。

## 全局约束核对

- [x] 未实现 P1/写入/任意 SQL 等越界能力。
- [x] 未放宽租户、安全、不可变和关闭式拒绝约束。
- [x] 未修改无关目录或升级无关依赖。
- [x] 测试未被跳过或弱化。
- [x] 未实现业务 API、数据库表、页面或云部署。

## 风险和遗留项

- 本仓库当前不是 Git 仓库，无法记录 commit baseline；已以 `no-git` 和初始文件范围记录。
- `gate: architecture` 尚需人工架构评审，评审通过后才可将 status 改为 `PASS`。

## 人工评审

- 门禁：`architecture`
- 结论：`pending`

> 有人工门禁且尚未批准，front matter status 为 `IMPLEMENTED_AWAITING_REVIEW`。

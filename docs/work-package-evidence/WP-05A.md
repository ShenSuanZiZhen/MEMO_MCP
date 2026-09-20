---
work_package: WP-05A
status: PASS
baseline: "51f3f2a"
completed_at: "2026-09-20T01:46:26Z"
gate: none
depends_on:
  - WP-03B
  - WP-04A
---

# WP-05A 完成证据

## 实现结果

实现了 Draft 创建应用层和模板目录，覆盖空白、模板、复制历史版本三种创建入口。三种入口都会生成独立 Draft，初始状态固定为 `editing`、`revision = 1`、`currentStep = goal`，并通过 `draft.edit` 的 Project 范围授权控制。

创建接口按 `Idempotency-Key + requestDigest` 幂等：同键同请求返回同一个 Draft；同键不同请求拒绝为 409。模板请求中的额外字段不能关闭平台保护，复制历史版本只复制 Definition 中的配置、模块和数据绑定引用，不复制 credential、usage、deployment、trace 或 Secret。

P0 模板目录提供：

- `tpl_knowledge_search_v1`：资料查询，默认搜索、按段读取、引用验证。
- `tpl_data_validation_v1`：数据验证，默认查看元数据、验证数据版本/引用。
- `tpl_catalog_browse_v1`：目录浏览，默认浏览目录、查看元数据且不返回正文。

## 变更文件

- `apps/control-api/src/index.ts`：新增 Draft 模板目录、`createDraft()` use-case、Draft 创建端口、幂等 digest、复制过滤和平台保护默认值。
- `packages/database/src/index.ts`：新增 PostgreSQL Draft 创建仓储 adapter，复用 RLS transaction、`app.ensure_idempotency_key`/`app.complete_idempotency_key`，同事务写入 `app.drafts` 与 `app.draft_revisions`。
- `tests/control-api/draft-create.test.ts`：覆盖三种创建方式、模板强制保护、复制过滤、幂等重放、幂等冲突和权限拒绝。
- `docs/work-package-evidence/WP-05A.md`：本证据文件。

## 契约和衔接

公开 application/use-case 入口：

- `listDraftTemplates()`
- `findDraftTemplate(templateId)`
- `createDraft(input)`
- `DraftCreationRepository`
- `DraftTemplateDefinition`
- `DraftDocument`

数据库 adapter：

- `createPostgresDraftCreationRepository(provider)`
- `DraftCreationRepository`

模板默认值来源：

- CRT-001～004：三种创建方式、模板影响摘要和三个 P0 模板。
- 用户流程第 4/5 节：创建方式语义、七步向导、P0 不提供写入/删除/原文件下载/整篇读取。
- WP-04A built-in module evidence：使用已批准的内置模块 exact version 和 digest，不引入浮动版本。
- 全局安全约束：认证、授权、租户隔离、配额、输出保护、审计和 P0 写能力禁用均为强制默认值。

没有新增或修改 OpenAPI schema、contract schema、migration、事件、环境变量、feature flag、外部写操作、生产 Secret 或用户代码执行能力。

## Draft 初始状态

所有创建方式写入：

- `state/status`: `editing`
- `revision`: `1`
- `currentStep`: `goal`
- `creationMode`: `blank | template | copy_version`
- `templateId`: 仅模板创建有值
- `sourceVersionId`: 仅复制历史版本有值
- 首个 `DraftRevision`: 与 Draft document、actor、revision 同事务一致

## 验证记录

| 命令 | 结果 | 关键输出 |
| --- | --- | --- |
| `./scripts/check-work-package-ready.sh WP-05A` | PASS | `PASS dependency WP-03B`; `PASS dependency WP-04A`; `READY WP-05A` |
| `pnpm vitest run tests/control-api/draft-create.test.ts tests/control-api/rbac-middleware.test.ts` | PASS | 2 files, 19 tests passed |
| `pnpm --filter @modular-mcp/control-api build` | PASS | `tsc --build tsconfig.json` |
| `pnpm --filter @modular-mcp/database build` | PASS | `database public API verification passed` |
| `pnpm test:contract` | PASS | schema lint, examples, generated types, decoders, breaking-change check passed |
| `pnpm verify:affected` | PASS | format, lint, typecheck, 215 unit tests, contract, build, dependency scan, secret scan passed |

## 验收标准核对

- [x] 空白、模板、复制历史版本三种方式均产生独立 Draft。
- [x] 重复 idempotency 请求不重复创建 Draft。
- [x] 三个 P0 模板包含适用场景、默认能力、数据要求、风险和不可用能力摘要。
- [x] 模板平台保护默认值不可被创建请求关闭。
- [x] 复制只复制配置、模块和数据绑定引用，不复制 credential/usage/Secret。
- [x] 创建接口受 Workspace/Project 授权控制，缺少 `draft.edit` 时失败且不调用仓储写入。
- [x] API 契约测试与 `pnpm verify:affected` 通过。

## 全局约束核对

- [x] 未实现 P1 写入、删除、原文件下载、整篇读取、任意 SQL、用户脚本或用户容器。
- [x] 未放宽租户、安全、不可变和关闭式拒绝规则。
- [x] 未修改禁止目录，未升级无关依赖。
- [x] `packages/domain` 未导入应用层或基础设施。
- [x] 测试未跳过、未弱化断言、未降低质量门禁。
- [x] 未添加生产 Secret、真实客户数据或外部写操作。

## 风险和遗留项

- HTTP 路由/BFF 绑定不属于 WP-05A，本包交付 application use-case 与 repository adapter，后续 control-api server 集成应复用这些公开入口。
- Draft 目标编辑、自动保存、冲突 diff 和恢复属于 WP-05B/WP-05C。
- 完整历史版本 diff、数据更新候选和运维升级动作属于 WP-13D；本包只提供复制版本创建入口。

## 人工评审

- 门禁：`none`
- 结论：`not-required`

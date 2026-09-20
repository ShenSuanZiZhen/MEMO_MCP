---
work_package: WP-05C
status: IMPLEMENTED_AWAITING_REVIEW
baseline: "51f3f2a"
completed_at: "2026-09-20T03:02:31Z"
gate: api
depends_on:
  - WP-05B
  - WP-02D
---

# WP-05C 完成证据

## 实现结果

实现 Draft update application use-case、revision/ETag 乐观锁、冲突 diff DTO、关键字段证据失效判定，以及 PostgreSQL Draft update repository adapter。

每次 Draft 更新要求：

- `If-Match` 格式为 `rev-<revision>`；
- body `revision` 与 `If-Match` revision 完全一致；
- `Idempotency-Key` 与规范化 request digest 绑定；
- repository 在同一 transaction 中锁定 Draft、校验 revision、写入 `revision + 1`，并追加匹配的 `DraftRevision`。

本包不实现前端 debounce、不自动 merge、不自动覆盖冲突、不编译 Definition，也没有修改公共 OpenAPI/contract schema。

由于本包 `gate: api`，实现已完成并通过验证，但 evidence 状态保持 `IMPLEMENTED_AWAITING_REVIEW`，等待 API review 后才能改为 `PASS`。

## 变更文件

- `apps/control-api/src/index.ts`：新增 `updateDraft()`、ETag 解析、merge patch 校验、冲突 diff DTO、敏感字段 redaction、关键字段失效矩阵和 Draft update repository port。
- `packages/database/src/index.ts`：新增 `createPostgresDraftUpdateRepository()`，复用 tenant transaction、idempotency、Draft row lock、revision +1 和 DraftRevision 同事务一致性。
- `tests/control-api/draft-create.test.ts`：新增并发更新、幂等重试、冲突 diff、敏感值 redaction、If-Match 拒绝和失效规则测试。
- `docs/work-package-evidence/WP-05C.md`：本证据文件。

## ETag 协议

- 客户端必须发送 `If-Match: rev-N`。
- 请求体必须包含 `revision: N`。
- `If-Match` 缺失、格式错误或与 body revision 不一致时，请求在 repository 写入前被拒绝。
- 更新成功返回下一版 ETag：`rev-(N+1)`。
- repository 层只接受当前 Draft revision 等于 expected revision 的更新；否则返回冲突，不修改 Draft。

## Patch 格式

Patch 使用 JSON object merge patch：

- patch 必须是 object；
- object 字段递归 merge；
- `null` 删除字段；
- 非 object 值替换目标字段；
- `currentStep` 是显式字段，不从 patch 隐式推断；
- 包含 `secret`、`token`、`credential`、`password`、`authorization`、`apiKey` 等敏感路径的 patch 被拒绝。

本包没有新增业务能力，也不接受写入、删除、整篇读取或原文件下载目标。

## 冲突 DTO

Application conflict 使用：

```ts
interface DraftConflictDetails {
  kind: "DRAFT_CONFLICT";
  baseRevision: number;
  serverRevision: number;
  serverETag: string;
  clientChanges: DraftPatchChange[];
  serverChanges: DraftPatchChange[];
  overlapPaths: string[];
}
```

Diff 语义：

- `clientChanges`: 从 base revision 应用客户端 patch 后产生的变化；
- `serverChanges`: 从 base revision 到服务器当前 revision 的变化；
- `overlapPaths`: 客户端和服务器同时修改的 JSON Pointer 路径；
- 敏感路径值统一返回 `[REDACTED]`，不回传 Secret。

公共 OpenAPI 未变更；`DRAFT_CONFLICT` 当前为 control-api application conflict category。API review 需要确认该 DTO 如何映射到公开 `ConflictError` envelope。

## 失效矩阵

关键字段变化会使 preview/test confirmation 失效：

| 路径前缀 | 失效 |
| --- | --- |
| `/goal` | preview, test |
| `/dataBindings` | preview, test |
| `/modules` | preview, test |
| `/configuration/access` | preview, test |
| `/configuration/auth` | preview, test |
| `/configuration/outputLimits` | preview, test |
| `/configuration/prompts` | preview, test |
| `/configuration/resources` | preview, test |
| `/configuration/tools` | preview, test |

非关键字段，例如 `/draftNotes`，不会使 preview/test confirmation 失效。

## 契约和衔接

公开 application/repository 入口：

- `updateDraft(input)`
- `DraftUpdateRepository`
- `DraftUpdateRepositoryResult`
- `DraftUpdateResponse`
- `DraftConflictDetails`
- `DraftUpdateInvalidation`
- `createPostgresDraftUpdateRepository(provider)`

没有新增或修改 OpenAPI schema、contract schema、migration、事件、环境变量、feature flag、外部写操作、生产 Secret 或用户代码执行能力。

## 验证记录

| 命令 | 结果 | 关键输出 |
| --- | --- | --- |
| `./scripts/check-work-package-ready.sh WP-05C` | PASS | `PASS dependency WP-05B`; `PASS dependency WP-02D`; `READY WP-05C` |
| `pnpm vitest run tests/control-api/draft-create.test.ts tests/control-api/rbac-middleware.test.ts` | PASS | 2 files, 30 tests passed |
| `pnpm --filter @modular-mcp/control-api build` | PASS | `tsc --build tsconfig.json` |
| `pnpm --filter @modular-mcp/database build` | PASS | `database public API verification passed` |
| `pnpm test:contract` | PASS | schema lint, examples, generated types, decoders, breaking-change check passed |
| `pnpm verify` | PASS | format, lint, typecheck, 230 unit tests, contract, build, dependency scan, secret scan passed |

## 验收标准核对

- [x] 每次 update 要求 `If-Match`/revision，且两者必须一致。
- [x] 成功更新原子增加 revision，并追加匹配 DraftRevision。
- [x] 两客户端并发更新同 revision 时只有一个成功，另一个返回稳定 conflict。
- [x] 冲突返回 server revision、server ETag、client/server 可比较 changes 和 overlap paths。
- [x] 冲突 diff 不回传 Secret。
- [x] 同 idempotency key 重试不重复增加 revision。
- [x] 关键字段变化使 preview/test confirmation 失效，非关键字段不失效。
- [x] `pnpm verify` 通过。
- [ ] API 评审通过。

## 全局约束核对

- [x] 未实现自动 merge、自动覆盖冲突或 Definition 编译。
- [x] 未实现 P1 写入、删除、原文件下载、整篇读取、任意 SQL、用户脚本或用户容器。
- [x] 未放宽租户、安全、不可变和关闭式拒绝规则。
- [x] 未修改公共契约或数据库 migration。
- [x] `packages/domain` 未导入应用层或基础设施。
- [x] 测试未跳过、未弱化断言、未降低质量门禁。
- [x] 未添加生产 Secret、真实客户数据或外部写操作。

## 风险和遗留项

- API gate 未完成：需要评审 `DRAFT_CONFLICT` application DTO 到公开 `ConflictError` envelope 的映射。
- 前端 debounce、离线本地保存提示和冲突 diff UI 不属于本包。
- Definition 编译和 preview/test 实际 confirmation 记录失效的持久化仍属于后续预览/测试工作包；本包提供失效判定信号。

## 人工评审

- 门禁：`api`
- 结论：`IMPLEMENTED_AWAITING_REVIEW`

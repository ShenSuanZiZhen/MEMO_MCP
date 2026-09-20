---
work_package: WP-05B
status: PASS
baseline: "51f3f2a"
completed_at: "2026-09-20T02:53:47Z"
gate: none
depends_on:
  - WP-05A
---

# WP-05B 完成证据

## 实现结果

实现 Draft 第一步“定义目标”的应用层能力：目标保存、目标步骤完成、目标校验、稳定结果摘要和后续失效信号。保存和完成步骤是分离 use-case：缺少必填字段时仍可保存未完成草稿，但不能标记目标步骤完成。

本包不编译 Service Definition、不实现模块 resolver、不新增写入、删除、整篇读取或原文件下载能力。

## 变更文件

- `apps/control-api/src/index.ts`：新增目标枚举、目标校验、摘要 DTO、失效信号、`saveDraftGoal()`、`completeDraftGoalStep()` 和 `buildDraftGoalSummary()`。
- `tests/control-api/draft-create.test.ts`：新增目标步骤测试，覆盖未完成保存、完成阻断、越界能力拒绝、稳定摘要、trace、失效信号和授权失败。
- `docs/work-package-evidence/WP-05B.md`：本证据文件。

## 契约和衔接

公开 application/use-case 入口：

- `saveDraftGoal(input)`
- `completeDraftGoalStep(input)`
- `buildDraftGoalSummary(goal)`
- `DraftGoalRepository`
- `DraftGoalState`
- `DraftGoalSummary`
- `DraftGoalResponse`
- `DraftGoalInvalidationSignal`

固定目标枚举：

- `browse_catalog`
- `view_metadata`
- `search_content`
- `read_sections`
- `verify_citation`

固定基础资料枚举：

- Audience: `internal_members`, `specified_customers`, `all_authorized_users`
- Default language: `zh`, `en`, `multilingual`

步骤状态：

- `incomplete`: 已保存但缺少必填字段或依赖规则未满足，不能完成目标步骤。
- `complete`: 目标字段有效，目标步骤完成并可进入 `data` 步骤。

摘要 DTO：

- `summaryDigest`: 对摘要内容的稳定 SHA-256 digest。
- `selectedCapabilities`: 按固定枚举顺序规范化后的能力列表。
- `expectedTools`, `expectedResources`, `expectedPrompts`: 由能力 trace 派生，不包含未授权能力。
- `recommendedInputs`: 由能力组合派生的数据输入建议。
- `defaultOutputLimits`: `maxResults = 10`、按段读取时 `maxSections = 5`、引用验证时 `citationsRequired = true`。
- `explicitlyDisabled`: 原文件下载、整篇读取、数据写入、数据删除、外部动作执行。
- `trace`: 每个能力到 tools/resources/prompts 的可追溯解释。

失效信号：

- `goal_changed`: 目标摘要变化，失效 `modules/configuration/preview/test/publish`。
- `capability_set_changed`: 能力集合变化，失效 `modules/configuration/preview/test/publish`。
- `recommended_inputs_changed`: 推荐输入变化，失效 `data/modules/preview/test/publish`。

没有新增或修改 OpenAPI schema、contract schema、migration、事件、环境变量、feature flag、外部写操作、生产 Secret 或用户代码执行能力。

## 验证记录

| 命令 | 结果 | 关键输出 |
| --- | --- | --- |
| `./scripts/check-work-package-ready.sh WP-05B` | PASS | `PASS dependency WP-05A`; `READY WP-05B` |
| `pnpm vitest run tests/control-api/draft-create.test.ts` | PASS | 1 file, 11 tests passed |
| `pnpm vitest run tests/control-api/draft-create.test.ts tests/control-api/rbac-middleware.test.ts` | PASS | 2 files, 25 tests passed |
| `pnpm --filter @modular-mcp/control-api build` | PASS | `tsc --build tsconfig.json` |
| `pnpm test:contract` | PASS | schema lint, examples, generated types, decoders, breaking-change check passed |
| `pnpm verify:affected` | PASS | format, lint, typecheck, 225 unit tests, contract, build, dependency scan, secret scan passed |

## 验收标准核对

- [x] 校验名称、说明、受众、禁止用途、默认语言和目标能力。
- [x] 缺少必填字段可保存为未完成，但不能完成目标步骤。
- [x] 保存未完成和标记步骤完成使用独立 use-case。
- [x] 仅支持浏览目录、查看元数据、搜索内容、按段读取、验证引用。
- [x] 写入、删除、整篇读取、原文件下载等请求被拒绝，且不调用仓储写入。
- [x] 目标组合摘要稳定、可追溯，并只包含授权的 P0 只读能力。
- [x] 目标变化输出推荐输入变化和后续步骤失效范围。
- [x] 契约测试与 `pnpm verify:affected` 通过。

## 全局约束核对

- [x] 未实现 P1 写入、删除、原文件下载、整篇读取、任意 SQL、用户脚本或用户容器。
- [x] 未放宽租户、安全、不可变和关闭式拒绝规则。
- [x] 未修改禁止目录，未升级无关依赖。
- [x] `packages/domain` 未导入应用层或基础设施。
- [x] 测试未跳过、未弱化断言、未降低质量门禁。
- [x] 未添加生产 Secret、真实客户数据或外部写操作。

## 风险和遗留项

- 目标持久化的 PostgreSQL adapter、自动保存/ETag 冲突 diff 和恢复属于 WP-05C。
- 模块推荐只是摘要 DTO 的可解释派生，不执行模块 resolver；真实模块解析属于 WP-04B/WP-04C 和后续编译包。
- Service Definition 编译仍属于 WP-06A，不从本包读取可变 Draft 生成运行事实。

## 人工评审

- 门禁：`none`
- 结论：`not-required`

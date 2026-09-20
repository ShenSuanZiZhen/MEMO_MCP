---
work_package: WP-04A
status: PASS
baseline: "51f3f2a"
completed_at: "2026-09-18T06:23:32Z"
gate: none
depends_on:
  - WP-01D
  - WP-02C
---

# WP-04A 完成证据

## 实现结果

实现了 Module Manifest 加载、冻结 schema 形状校验、SemVer/生产引用校验、配置 schema 校验、稳定 canonical JSON、内置模块注册基座，以及平台 Module catalog 的只读 repository adapter。

本包不解析依赖图、不执行模块、不运行用户代码、不修改 WP-01D schema、不增加执行沙箱。

## 变更文件

- `packages/module-sdk/src/index.ts`：新增 manifest loader、Source/Capability/Output/Prompt 类型、apiVersion 兼容检查、production reference 校验、config schema 校验、canonical JSON、registry API、catalog name 映射。
- `packages/module-sdk/package.json`：新增包级 `test` 脚本和 `@modular-mcp/contracts` workspace 依赖。
- `packages/module-sdk/tsconfig.json`：引用 contracts project reference。
- `packages/module-builtins/src/index.ts`：新增首批内置 fixture manifest 和 config schema。
- `packages/module-builtins/package.json`：新增 `@modular-mcp/module-sdk` workspace 依赖。
- `packages/module-builtins/tsconfig.json`：引用 module-sdk project reference。
- `packages/database/src/index.ts`：新增只读 `createModuleCatalogRepository()` adapter，查询 approved exact module version + artifact digest。
- `tests/module-sdk/module-manifest.test.ts`：覆盖 manifest 正反例、canonical 稳定性、配置 JSON Pointer、registry digest 匹配。
- `tests/module-sdk/module-catalog-repository.test.ts`：覆盖 catalog adapter 只查 approved exact digest 行和非法 ID 查询前拒绝。
- `pnpm-lock.yaml`：记录新增 workspace importer 依赖。

## 契约和衔接

Loader/registry 公开入口：

- `validateModuleManifest(input)`
- `loadModuleManifest(input)`
- `validateProductionModuleReference(reference)`
- `validateModuleConfig(manifest, config, resolver)`
- `createModuleRegistry(manifests)`
- `assertCompatibleApiVersion(apiVersion)`
- `canonicalizeJson(value)`
- `moduleRegistryKey(moduleId, exactVersion)`
- `catalogModuleNameForManifestId(moduleId)`
- `catalogVersionForDatabase(version)`

新增类型：

- `SourceModuleManifest`
- `CapabilityModuleManifest`
- `OutputModuleManifest`
- `PromptModuleManifest`
- `TypedModuleManifest`
- `ValidationIssue`
- `JsonSchema`
- `ModuleRegistry`
- `ProductionModuleReference`

规范化格式：

- manifest 先按 WP-01D `ModuleManifestV1` 形状和 WP-04A 语义规则校验；
- `requires`、`conflicts`、`provides`、`permissions` 按字典序排序；
- object key 使用稳定升序；
- canonical 输出为无空白 JSON string；
- config normalization 使用相同 object key 稳定排序，数组保持输入顺序。

首批 fixture ID：

- `source.normalized-documents@1.0.0`
- `capability.search-documents@1.2.3`
- `output.citation-guard@1.0.0`
- `prompt.search-and-answer@1.0.0`

Database adapter：

- `createModuleCatalogRepository(transaction).findApprovedExact(reference)`
- 只读查询 `app.module_versions`；
- 固定 `status = 'approved'`；
- 要求 `moduleId + exactVersion + artifactDigest` 同时匹配；
- catalog name 映射为将 manifest id 中的 `.` 和 `-` 转为 `_`，例如 `capability.search-documents -> capability_search_documents`。

未新增或修改 schema、migration、事件、环境变量、feature flag、外部运行命令、外部写操作或执行沙箱。

## 验证记录

| 命令                                               | 结果 | 关键输出                                                                                                   |
| -------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------- |
| `./scripts/check-work-package-ready.sh WP-04A`     | PASS | `PASS dependency WP-01D`; `PASS dependency WP-02C`; `READY WP-04A`                                         |
| `pnpm --filter @modular-mcp/module-sdk test`       | PASS | 2 files, 11 tests passed                                                                                   |
| `pnpm --filter @modular-mcp/module-sdk build`      | PASS | `tsc --build tsconfig.json`                                                                                |
| `pnpm --filter @modular-mcp/module-builtins build` | PASS | `tsc --build tsconfig.json`                                                                                |
| `pnpm --filter @modular-mcp/database build`        | PASS | `database public API verification passed`                                                                  |
| `pnpm verify:affected`                             | PASS | Local CI reproduction passed: format, lint, typecheck, unit, contract, build, dependency scan, secret scan |

Notes:

- WP text names `pnpm --filter @studio/module-sdk test`; this repository's package namespace is `@modular-mcp/*`. The literal `@studio/module-sdk` filter matched 0 of 16 workspace projects, so the effective package-local test command is `pnpm --filter @modular-mcp/module-sdk test`.

## 验收标准核对

- [x] Manifest 只接受 WP-01D schema 形状，并拒绝额外 `customExecution` 字段。
- [x] 规范化结果稳定；相同 manifest 在不同 key/集合顺序下产生相同 canonical JSON。
- [x] 生产引用必须 exact SemVer + `artifactDigest`。
- [x] 配置按 `configSchemaRef` 指向的 schema 校验，并返回 JSON Pointer。
- [x] 建立 Source/Capability/Output/Prompt 类型与 `studio.mcp/v1` apiVersion 兼容检查。
- [x] 非法类型、版本、权限、配置、浮动生产引用均拒绝。
- [x] 内置模块注册只能按 exact version + digest 命中。

## 全局约束核对

- [x] 未实现 P1 写入、任意 SQL、外部 API 写操作、用户代码执行或执行沙箱。
- [x] 未放宽租户、安全、不可变和关闭式拒绝约束。
- [x] 未修改 WP-04A 禁止目录；未更改 WP-01D schema 或数据库 migration。
- [x] `packages/domain` 未导入基础设施或应用层。
- [x] 测试未跳过、未弱化断言、未降低质量门禁。
- [x] 依赖变更仅为 workspace 内 contracts/module-sdk 连接，并已通过 dependency scan。

## 风险和遗留项

- Module dependency closure、循环/冲突解析、签名验证和阻止列表仍属于 WP-04B/WP-04C 范围。
- `app.module_versions.version` 当前数据库约束只接受 core `x.y.z`，SDK loader 按 WP-01D `ExactVersion` 接受精确 SemVer；进入数据库 catalog 前使用 `catalogVersionForDatabase()` 约束 core 版本。
- `@studio/module-sdk` 是工作包文本中的旧命名；仓库有效包名是 `@modular-mcp/module-sdk`。

## 人工评审

- 门禁：`none`
- 结论：`not-required`

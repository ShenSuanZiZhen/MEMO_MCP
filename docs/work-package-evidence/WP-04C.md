---
work_package: WP-04C
status: IMPLEMENTED_AWAITING_REVIEW
baseline: "51f3f2a"
completed_at: "2026-09-20T12:41:00+08:00"
gate: security
depends_on:
  - WP-04B
---

# WP-04C Security Gate 第二轮整改证据

## 范围声明

本轮只在 WP-04C 允许范围内整改 module production gate、signature/artifact verifier、database repository runtime validation、database integration test 和本 evidence。

未接入生产 PKI、生产密钥或生产信任根；未自动暂停线上服务；未执行自定义模块代码；未修改 manifest schema、contracts、authz、control-api、API 或 UI。

## 变更文件

- `packages/module-sdk/src/index.ts`
- `packages/database/src/index.ts`
- `tests/module-sdk/module-production-gate.test.ts`
- `tests/module-sdk/module-catalog-repository.test.ts`
- `packages/database/scripts/integration-test.mjs`
- `docs/work-package-evidence/WP-04C.md`

## 安全整改结果

签名 payload 由 verifier 内部确定：

- `ModuleSignatureVerificationInput` 不再公开 `canonicalPayload`。
- Ed25519 adapter 只接收 manifest，在内部调用 `moduleSignaturePayload(manifest)` 生成签名字节。
- 回归测试覆盖 tampered manifest 搭配旧合法 payload 的攻击；即使调用方传入额外 `canonicalPayload` 属性，verifier 也不会使用，篡改仍被拒绝。
- 篡改 `provides`、`permissions`、`limits`、`implementation`、`artifactDigest`、`signature.keyId` 均被拒绝。

签名值与 trust root 严格校验：

- `signature.value` 必须是无 padding、无空白、可 round-trip 的 canonical base64url。
- 解码后必须恰好为 64 字节 Ed25519 signature；非法字符、padding、截断和超长均拒绝。
- trust root 初始化拒绝重复 `keyId + algorithm`、private key、非 Ed25519 public key 和无法解析的 PEM；不再由 `Map` 静默覆盖重复项。
- signature verifier 抛错时关闭式返回 `module_signature_invalid`。

实际 artifact digest 链已闭合：

- production gate 从 `manifest.implementation` 解析内嵌 `sha256` digest。
- implementation digest 必须严格等于 `manifest.artifactDigest`，否则返回 `module_implementation_digest_mismatch`。
- 新增 `ModuleArtifactVerifier` 端口；本包使用 in-memory artifact bytes fixture 计算实际 SHA-256，不伪造生产对象存储。
- production gate 只有在 artifact verifier 证明实际字节 digest 等于 manifest/reference/catalog digest 后才成功。
- 测试区分两类负例：只篡改 reference digest 返回 `artifact_digest_mismatch`；签名制品字节 A 后替换为字节 B 返回 `module_artifact_verification_failed`。
- artifact verifier 抛错时关闭式返回 `module_artifact_verification_failed`。

Catalog 返回值运行时防御校验：

- `catalog.findExact()` 返回后，production gate 在状态和签名验证前检查 record shape。
- 校验 `moduleId`、`exactVersion`、`artifactDigest` 必须等于 reference。
- 校验 `moduleName === catalogModuleNameForManifestId(manifest.id)`。
- 校验 `moduleKind === manifest.type`。
- 校验 status 属于冻结的 `ModuleReviewStatus`。
- 校验 `signatureDigest` 满足 `sha256:<64 lowercase hex>`。
- 校验 `moduleVersionId` 满足当前数据库 UUIDv7 契约。
- 任何缺字段、类型错误或不一致均关闭式返回 `module_catalog_mismatch`。
- database repository 对查询返回 row 做运行时校验；不再只依赖 TypeScript 泛型。

Deprecated 调用场景已分离：

- 新发布入口：`validateNewProductionPublishModules()`，固定只允许 `approved`。
- 历史运行入口：`validateHistoricalRuntimeModules()`，允许 `approved` / `deprecated`。
- `blocked` 在两个入口均拒绝。
- `draft` / `testing` / `submitted` 在两个入口均拒绝。
- 公开入口不再暴露调用方可控的 `deprecatedPolicy`。

输出防篡改：

- 成功返回的 `ApprovedProductionModule` 数组及其 `reference`、`manifest`、`catalog` 副本被冻结。
- 测试覆盖调用方在验证后修改输入数组或返回对象，不能改变已验证结果。

## PostgreSQL 租户隔离探针

`packages/database/scripts/integration-test.mjs` 新增真实 PostgreSQL integration probe：

- Workspace A、Workspace B 引用同一 module exactVersion + artifactDigest。
- Workspace A 下 Project A、Project B 均有引用。
- development/test/production 均建立相同引用。
- 通过实际 `withTenantTransaction()` 和 `createModuleCatalogRepository(transaction).findAffectedServiceVersions()` 查询。
- Workspace A / Project A / production 仅返回该 scope 的两个 service versions，且稳定排序、无重复。
- Workspace B、Project B、test environment 分别只能返回自身 scope。
- 缺 actor 或缺 workspace context 均拒绝，不读取受影响版本。

实际输出包含：

- `PASS module impact query returns only Workspace A Project A production rows`
- `PASS module impact query isolates Workspace B`
- `PASS module impact query isolates Project B`
- `PASS module impact query isolates environment`
- `PASS module impact query rejects missing actor context`
- `PASS module impact query rejects missing workspace context`
- `PASS module impact query enforces PostgreSQL tenant scope`

## 新增/更新测试覆盖

`tests/module-sdk/module-production-gate.test.ts` 当前覆盖：

- approved exact module 的正向路径；
- tampered manifest + 原始合法 payload 被拒绝；
- `provides`、`permissions`、`limits`、`implementation`、`artifactDigest`、`keyId` 篡改被拒绝；
- implementation digest 与 artifactDigest 不同被拒绝；
- 实际 artifact bytes 被替换后被拒绝；
- reference digest 篡改与 artifact bytes 篡改分别测试；
- catalog identity、kind、digest、status、signatureDigest、缺字段伪造被拒绝；
- duplicate trust root 被拒绝；
- private/non-Ed25519/unparseable trust root 被拒绝；
- 非 canonical base64url 和非 64 字节 signature 被拒绝；
- signature verifier / artifact verifier throw 时关闭式失败；
- deprecated 不能从新发布入口绕过；
- historical runtime 允许 deprecated；
- blocked 在 historical runtime 下仍拒绝；
- draft/testing/submitted 在两个入口均拒绝；
- 输入数组或返回对象被调用方修改不会改变已验证结果。

`tests/module-sdk/module-catalog-repository.test.ts` 当前覆盖：

- `findExact()` 返回 runtime-validated catalog row；
- `findApprovedExact()` 保留 approved-only 兼容语义；
- unapproved row 可由 `findExact()` 返回但不会由 approved-only 查询返回；
- invalid UUID/status/signatureDigest/kind row 被 repository runtime validation 拒绝；
- 受影响版本查询使用 transaction tenant scope 参数。

## 验证记录

| 命令                                                   | 结果 | 关键输出                                                                                                |
| ------------------------------------------------------ | ---- | ------------------------------------------------------------------------------------------------------- |
| `./scripts/check-work-package-ready.sh WP-04C`         | OK   | `PASS dependency WP-04B`; `READY WP-04C`                                                                |
| `pnpm --filter @modular-mcp/module-sdk test`           | OK   | 4 files passed; 54 tests passed                                                                         |
| `pnpm --filter @modular-mcp/module-sdk build`          | OK   | `tsc --build tsconfig.json`                                                                             |
| `pnpm --filter @modular-mcp/database build`            | OK   | `database public API verification passed`                                                               |
| `pnpm --filter @modular-mcp/database test:integration` | OK   | `tenant-core database verification passed`; `PASS module impact query enforces PostgreSQL tenant scope` |
| `pnpm verify`                                          | OK   | Local CI reproduction passed; 19 unit files / 259 tests; contract, build, dependency scan, secret scan  |
| `pnpm dependency:scan`                                 | OK   | `dependency scan passed: pnpm-lock.yaml and workspace manifests use pinned dependency policy`           |
| `pnpm secret:scan`                                     | OK   | `secret scan passed: no unallowlisted secret patterns found`                                            |
| `git diff --check`                                     | OK   | No whitespace errors                                                                                    |
| `git status --short`                                   | OK   | Ran after validation; worktree contains this WP-04C evidence/code plus pre-existing unrelated entries   |

`pnpm verify` 本轮通过；`tests/authz/rbac.test.ts` 和 `tests/control-api/step-up-action.test.ts` 均已通过，因此未按 WP-03C/authz/control-api blocker 流程标记 BLOCKED。

## 验收标准核对

- [x] 签名 payload 不再由调用方提供或信任。
- [x] Ed25519 verifier 从 manifest 内部重新构造签名字节。
- [x] tampered manifest + 原始 payload 被拒绝。
- [x] canonical base64url 和 64 字节 Ed25519 signature 严格校验。
- [x] trust root 初始化拒绝重复、private、非 Ed25519 和不可解析 PEM。
- [x] implementation digest 必须等于 artifactDigest。
- [x] production gate 校验实际 artifact bytes digest。
- [x] catalog 返回值 identity/kind/digest/status/signatureDigest/moduleVersionId 运行时校验。
- [x] database repository 对查询返回 row 做运行时验证。
- [x] new-publish 与 historical-run 使用不可混用的公开入口。
- [x] deprecated 不能由新发布入口绕过。
- [x] blocked 在 historical-run 下仍拒绝。
- [x] PostgreSQL integration 覆盖 Workspace/Project/Environment 租户隔离。
- [x] 未接入生产 PKI、生产密钥或生产信任根。
- [x] 未执行自定义模块代码。
- [x] 未自动暂停线上服务。

## 人工评审状态

Security gate 等待人工重新评审。

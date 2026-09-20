---
work_package: WP-01B
status: PASS
completed_at: 2026-09-16T08:08:48Z
updated_at: 2026-09-19T10:32:09Z
gate: api
depends_on:
  - WP-01A
---

# WP-01B Evidence

## Scope Delivered

- Added the core control-plane OpenAPI 3.1 contract at `packages/contracts/openapi/control-plane.v1.json`.
- Added generated TypeScript types at `packages/contracts/src/generated/control-plane.ts`.
- Exported control-plane generated types from `@modular-mcp/contracts`.
- Reopened the API gate on 2026-09-19 for the browser-safe runtime decoder increment requested by WP-14A follow-up review.
- Added generated browser-safe runtime decoders at `packages/contracts/src/generated/control-plane-decoders.ts`, produced from the same common/control-plane OpenAPI source as the generated DTO types.
- Exported stable runtime decoder APIs from `@modular-mcp/contracts` so web/runtime clients can import validators without knowing OpenAPI file paths.
- Closed the second-round API gate findings: the runtime schema registry is no longer publicly exported, generated decoder registries are frozen, UTC date-time validation is strict, unsupported JSON Schema keywords fail closed, and decoder exports are tracked by a breaking baseline.
- Closed the third-round minimal findings: boolean JSON Schema nodes are rejected at generation instead of being normalized to `{}`, and RFC3339 leap-second UTC timestamps are accepted only in the constrained leap-second form.
- Added a control-plane public-surface breaking baseline at `packages/contracts/baselines/control-plane.v1.public-surface.json`.
- Extended contract checks so `pnpm test:contract` covers common primitives plus control-plane schema lint, operation examples, generated type/decoder drift, runtime decoder tests, and breaking checks.

No API handler, database model, migration, P1 connector type, or Secret plaintext read endpoint was implemented.

## Endpoint Index

| Method | Path                                                                                                                    | operationId                  |
| ------ | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| GET    | `/api/v1/workspaces`                                                                                                    | `listWorkspaces`             |
| POST   | `/api/v1/workspaces`                                                                                                    | `createWorkspace`            |
| GET    | `/api/v1/workspaces/{workspaceId}`                                                                                      | `getWorkspace`               |
| GET    | `/api/v1/workspaces/{workspaceId}/projects`                                                                             | `listProjects`               |
| POST   | `/api/v1/workspaces/{workspaceId}/projects`                                                                             | `createProject`              |
| GET    | `/api/v1/workspaces/{workspaceId}/projects/{projectId}`                                                                 | `getProject`                 |
| PATCH  | `/api/v1/workspaces/{workspaceId}/projects/{projectId}`                                                                 | `updateProject`              |
| POST   | `/api/v1/workspaces/{workspaceId}/projects/{projectId}:archive`                                                         | `archiveProject`             |
| POST   | `/api/v1/workspaces/{workspaceId}/projects/{projectId}:restore`                                                         | `restoreProject`             |
| GET    | `/api/v1/workspaces/{workspaceId}/projects/{projectId}/environments/{environment}/drafts`                               | `listDrafts`                 |
| POST   | `/api/v1/workspaces/{workspaceId}/projects/{projectId}/environments/{environment}/drafts`                               | `createDraft`                |
| GET    | `/api/v1/workspaces/{workspaceId}/projects/{projectId}/environments/{environment}/drafts/{draftId}`                     | `getDraft`                   |
| PATCH  | `/api/v1/workspaces/{workspaceId}/projects/{projectId}/environments/{environment}/drafts/{draftId}`                     | `updateDraft`                |
| GET    | `/api/v1/workspaces/{workspaceId}/projects/{projectId}/environments/{environment}/data-sources`                         | `listDataSources`            |
| POST   | `/api/v1/workspaces/{workspaceId}/projects/{projectId}/environments/{environment}/data-sources`                         | `createDataSource`           |
| GET    | `/api/v1/workspaces/{workspaceId}/projects/{projectId}/environments/{environment}/data-sources/{dataSourceId}`          | `getDataSource`              |
| POST   | `/api/v1/workspaces/{workspaceId}/projects/{projectId}/environments/{environment}/data-sources/{dataSourceId}/versions` | `startDataVersionProcessing` |
| GET    | `/api/v1/workspaces/{workspaceId}/projects/{projectId}/environments/{environment}/data-versions/{dataVersionId}`        | `getDataVersion`             |
| GET    | `/api/v1/module-catalog/modules`                                                                                        | `listModuleCatalog`          |
| GET    | `/api/v1/module-catalog/modules/{moduleId}/versions/{moduleVersion}`                                                    | `getModuleCatalogVersion`    |
| GET    | `/api/v1/jobs/{jobId}`                                                                                                  | `getJob`                     |

## Contract Rules Locked

- All control-plane endpoints are under `/api/v1`.
- POST write operations require `Idempotency-Key`.
- Draft update requires `If-Match` and a body `revision`.
- List operations use cursor pagination.
- Project-scoped Draft/Data endpoints include `{environment}` in the path.
- Module catalog list/detail requires an explicit `environment` query.
- Asynchronous data-version processing returns `202` with `AcceptedJobResponse`.
- Failure responses include the shared `ErrorEnvelope`.
- Not-found and unauthorized resource access use the merged `AUTHZ_NOT_FOUND_OR_DENIED` outward shape.
- Response schemas are checked so credential previews cannot expose `secret`, `secretValue`, `token`, `password`, or complete credential values.

## Schema Version

- OpenAPI source: `packages/contracts/openapi/control-plane.v1.json`
- Schema namespace: `https://contracts.modular-mcp.local/schemas/control-plane/v1/<SchemaName>`
- API path major: `/api/v1`
- Breaking baseline: `packages/contracts/baselines/control-plane.v1.public-surface.json`

Breaking changes include removing schemas, removing properties, changing property types or formats, changing required fields, or removing enum values. Optional additions require API review and baseline update.

## Generated Type Paths

Downstream WPs should import generated public types from `@modular-mcp/contracts`, backed by:

- WP-02: `packages/contracts/src/generated/control-plane.ts` for Workspace, Project, Draft, DataSource, DataVersion, and Job DTOs.
- WP-03: `packages/contracts/src/generated/control-plane.ts` for Workspace/Project and environment-scoped access context DTOs.
- WP-05: `packages/contracts/src/generated/control-plane.ts` for Draft wizard DTOs and module selection DTOs.
- WP-07: `packages/contracts/src/generated/control-plane.ts` for DataSource/DataVersion and processing job DTOs.
- WP-14: `packages/contracts/src/generated/control-plane.ts` for web/control-plane client request and response types.

## Runtime Decoder Increment

Generated decoder source:

- OpenAPI inputs: `packages/contracts/openapi/common.v1.json` and `packages/contracts/openapi/control-plane.v1.json`.
- Generator: `scripts/contracts-generate-types.mjs`.
- Generated output: `packages/contracts/src/generated/control-plane-decoders.ts`.
- Public export: `@modular-mcp/contracts` re-exports `decode*`, `validate*`, `assert*`, `ContractDecodeError`, `ContractDecodeResult`, and frozen `controlPlaneDecoders`.
- Internal implementation: the generated runtime schema registry is module-private and recursively frozen; raw schema registry access is intentionally not part of the public API.

Covered DTOs:

- `WorkspaceResponse`, `WorkspaceListResponse`
- `ProjectResponse`, `ProjectListResponse`
- `DraftResponse`, `DraftListResponse`
- `DataSourceResponse`, `DataSourceListResponse`
- `DataVersionResponse`
- `ModuleListResponse`, `ModuleVersionResponse`
- `Job`, `AcceptedJobResponse`
- `ErrorEnvelope`

Decoder behavior:

- Rejects missing required fields.
- Rejects wrong primitive types and enum values.
- Rejects invalid `OpaqueId`, UTC timestamp patterns, and unsafe or non-positive revision integers.
- Performs strict RFC3339 UTC date-time validation after pattern matching, including real calendar dates, leap years, hour/minute/second ranges, legal leap-second `23:59:60Z` on the last day of a month, trailing `Z`, and 0-6 fractional second digits.
- Rejects disallowed `additionalProperties`.
- Rejects non-object, `null`, and array roots for object DTOs.
- Uses generated `asserts value is <DTO>` functions after runtime schema validation; it does not rely on hand-written DTO copies or unchecked `as <DTO>` casts.
- Runtime file has no Node-only imports, no filesystem access, no `eval`, and no `new Function`.
- `ContractDecodeError.errors`, invalid `validate*` result error arrays, `controlPlaneDecoders`, and each decoder entry are frozen to prevent caller mutation from bypassing validation.
- The generator distinguishes supported validation/applicator keywords from annotations. Unsupported validation keywords or unknown formats fail generation with the schema name, JSON Pointer, and keyword.
- JSON Schema boolean schemas (`true` / `false`) are not implemented by this runtime decoder and therefore fail generation with the schema name, JSON Pointer, node type, and value. This does not affect supported keyword booleans such as `additionalProperties: false`.

Wire contract note:

- This increment does not change OpenAPI wire schemas or the control-plane public-surface baseline.
- It does add a new package-level runtime export surface that must be reviewed as part of the reopened `gate: api`.
- Decoder public API surface is tracked separately at `packages/contracts/baselines/control-plane-decoders.public-surface.json`; raw runtime schema data is not included in that baseline.

## Second-Round API Gate Findings Closed

| Finding                                 | Closure Evidence                                                                                                                                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public mutable schema registry bypass   | `controlPlaneRuntimeDecoderSchemas` is no longer exported from `@modular-mcp/contracts`; tests prove registry replacement and `WorkspaceResponse.decode` replacement fail or have no effect.         |
| Illegal payload after mutation attempts | Direct probe keeps rejecting `workspaceId: "value_001"` after attempted `controlPlaneDecoders.WorkspaceResponse` and entry mutation.                                                                 |
| Loose `Date.parse` date-time validation | `2026-02-31T00:00:00Z`, non-leap `2026-02-29T00:00:00Z`, month 13, hour 24, minute 60, illegal second 60, `+08:00`, and 7 fractional digits are rejected.                                            |
| Valid UTC timestamp coverage            | Leap-year `2024-02-29T00:00:00Z`, legal leap-second `1990-12-31T23:59:60Z`, and 0-6 fractional second forms are accepted.                                                                            |
| Unsupported keyword silent drops        | Synthetic generator tests reject `oneOf`, `const`, `uniqueItems`, `exclusiveMinimum`, unknown `format`, `$ref` with validation sibling, and non-equivalent common/control-plane same-name schemas.   |
| Annotation false positives              | Synthetic `description` and `examples` annotations are accepted without changing validation semantics.                                                                                               |
| Decoder public-surface drift            | `breaking:check` now includes `packages/contracts/baselines/control-plane-decoders.public-surface.json`; tests probe deletion of `decodeWorkspaceResponse` and the `WorkspaceResponse` registry key. |

## Third-Round API Gate Findings Closed

| Finding                              | Closure Evidence                                                                                                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Boolean schema node fail-open        | Generator tests reject root `false`, property `false`, property `true`, `items: false`, and `allOf: [false]` with stable schema name and JSON Pointer errors; no boolean schema is normalized to `{}`. |
| `additionalProperties: false` safety | The boolean-schema rejection applies only to schema nodes. Existing object `additionalProperties: false` validation continues to reject undeclared fields.                                             |
| RFC3339 leap-second compatibility    | `1990-12-31T23:59:60Z` is accepted; `2026-01-01T00:00:60Z`, `2026-12-31T23:58:60Z`, and non-month-end `23:59:60Z` are rejected.                                                                        |

## Validation

| Check                    | Result | Evidence                                                                                                                                              |
| ------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Readiness                | PASS   | `./scripts/check-work-package-ready.sh WP-01B` reported dependency `WP-01A` PASS and `READY WP-01B`.                                                  |
| Work-package count       | PASS   | `jq '.packages \| length' work-packages/manifest.json` reported `71`; `./scripts/validate-work-packages.sh` reported 71 structurally valid packages.  |
| OpenAPI lint             | PASS   | `pnpm test:contract` covers schema lint for common, control-plane, release-ops, and definition registry contracts.                                    |
| Operation examples       | PASS   | `pnpm test:contract` covers control-plane operation examples; each operation has request, success, and failure examples.                              |
| Generated types no diff  | PASS   | `node scripts/contracts-generate-types.mjs` reported generated type checks passed for common, control-plane, release-ops, and control-plane decoders. |
| Runtime decoder tests    | PASS   | `pnpm exec vitest run tests/contracts/control-plane-decoders.test.ts` passed 55 generated decoder tests.                                              |
| Browser compatibility    | PASS   | Runtime decoder test scans the generated file for Node-only imports, `eval`, `new Function`, and unchecked DTO casts.                                 |
| Breaking check           | PASS   | `pnpm test:contract` passed against common, control-plane, release-ops, definition, and control-plane decoder public-surface baselines.               |
| Secret response negative | PASS   | A temporary `secretValue` field in credential preview response schemas failed lint, including nested list responses; the field was removed afterward. |
| Contract package build   | PASS   | `pnpm --filter @modular-mcp/contracts build` passed.                                                                                                  |
| Full verification        | PASS   | `pnpm verify`, `pnpm dependency:scan`, `pnpm secret:scan`, and `git diff --check` passed after the runtime decoder increment.                         |

## Stop Conditions

WP-01B did not require PRD-undefined abilities, public primitive changes, API handlers, database models, production credentials, external writes, or Secret plaintext response endpoints.

Because this work package declares `gate: api`, and the runtime decoder increment added new public runtime exports, the implementation remains `IMPLEMENTED_AWAITING_REVIEW` until API review signs off. After review, this evidence can be promoted to `PASS`.

## Residual Risk

- The control-plane contract freezes core REST shapes, not handler behavior or persistence semantics.
- Connector-specific configuration schemas remain intentionally shallow here; later connector WPs must extend within the frozen DataSource/DataVersion envelope without exposing Secret plaintext.
- Runtime decoder generation currently supports the JSON Schema/OpenAPI keywords used by common/control-plane response DTOs. New schema keywords added later must either be supported by the generator or rejected by drift/tests before API review.

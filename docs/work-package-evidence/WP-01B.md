---
work_package: WP-01B
status: PASS
completed_at: 2026-09-16T08:08:48Z
gate: api
depends_on:
  - WP-01A
---

# WP-01B Evidence

## Scope Delivered

- Added the core control-plane OpenAPI 3.1 contract at `packages/contracts/openapi/control-plane.v1.json`.
- Added generated TypeScript types at `packages/contracts/src/generated/control-plane.ts`.
- Exported control-plane generated types from `@modular-mcp/contracts`.
- Added a control-plane public-surface breaking baseline at `packages/contracts/baselines/control-plane.v1.public-surface.json`.
- Extended contract checks so `pnpm test:contract` covers common primitives plus control-plane schema lint, operation examples, generated-type drift, and breaking checks.

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

## Validation

| Check                    | Result | Evidence                                                                                                                                              |
| ------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Readiness                | PASS   | `./scripts/check-work-package-ready.sh WP-01B` reported dependency `WP-01A` PASS and `READY WP-01B`.                                                  |
| OpenAPI lint             | PASS   | `pnpm test:contract` reported `schema lint passed: 50 schemas checked across 2 OpenAPI documents`.                                                    |
| Operation examples       | PASS   | `pnpm test:contract` reported `21 control-plane operation examples checked`; each operation has request, success, and failure examples.               |
| Generated types no diff  | PASS   | `pnpm test:contract` reported generated checks passed for common and control-plane types.                                                             |
| Breaking check           | PASS   | `pnpm test:contract` passed against common and control-plane baselines.                                                                               |
| Secret response negative | PASS   | A temporary `secretValue` field in credential preview response schemas failed lint, including nested list responses; the field was removed afterward. |
| Contract package build   | PASS   | `pnpm --filter @modular-mcp/contracts build` passed.                                                                                                  |
| Full verification        | PASS   | `pnpm verify` passed format, lint, typecheck, unit, contract, build, dependency scan, and secret scan.                                                |

## Stop Conditions

WP-01B did not require PRD-undefined abilities, public primitive changes, API handlers, database models, production credentials, external writes, or Secret plaintext response endpoints.

Because this work package declares `gate: api`, the implementation remains `IMPLEMENTED_AWAITING_REVIEW` until API review signs off. After review, this evidence can be promoted to `PASS`.

## Residual Risk

- The control-plane contract freezes core REST shapes, not handler behavior or persistence semantics.
- Connector-specific configuration schemas remain intentionally shallow here; later connector WPs must extend within the frozen DataSource/DataVersion envelope without exposing Secret plaintext.

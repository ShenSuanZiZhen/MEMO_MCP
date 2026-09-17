---
work_package: WP-01C
status: PASS
completed_at: 2026-09-16T10:33:56Z
gate: api
depends_on:
  - WP-01A
---

# WP-01C Evidence

## Review Remediation Scope

This evidence records the WP-01C side of the “WP-01C / WP-02A contract and domain data consistency” review remediation.

Changed files:

- `packages/contracts/openapi/release-ops.v1.json`
- `packages/contracts/src/generated/release-ops.ts`
- `packages/contracts/baselines/common.v1.public-surface.json`
- `packages/contracts/baselines/control-plane.v1.public-surface.json`
- `packages/contracts/baselines/release-ops.v1.public-surface.json`
- `scripts/contracts-breaking-check.mjs`
- `scripts/contracts-lint-schemas.mjs`
- `docs/work-package-evidence/WP-01C.md`

No endpoint handler, persistence model, billing model, external notification integration, payment flow, production credential, real tenant data, or external write channel was added.

Because this task changes public API semantics before first release, WP-01C is returned to `IMPLEMENTED_AWAITING_REVIEW`. It must not be marked `PASS` until API review signs off again.

## DeploymentStatus Correction

`DeploymentStatus` now represents Deployment lifecycle state only.

Removed old values:

- `building`
- `loading`
- `published`

Added or retained lifecycle values:

- `provisioning`
- `healthy`
- `degraded`
- `draining`
- `suspended`
- `stopped`
- `blocked`

Execution phases such as build, data binding, version loading, health check, capability verification, endpoint opening, and completion are represented by `DeploymentResponse.stage`, not by `DeploymentStatus`.

`DeploymentResponse.stage` is now optional and includes:

- `build`
- `bind_data`
- `start_instance`
- `load_version`
- `health_check`
- `verify_capabilities`
- `open_endpoint`
- `completed`

The schema remains intentionally simple: provisioning responses may include `stage`; steady lifecycle states such as `healthy`, `degraded`, `suspended`, `stopped`, and `blocked` do not require applications to invent a fake execution stage. State-to-stage conditional rules are documented here for the application layer because the current schema tooling intentionally avoids conditional JSON Schema.

## ServiceVersionStatus

Added `ServiceVersionStatus`:

- `approved`
- `deploying`
- `published`
- `suspended`
- `retired`

`ServiceReleaseResponse` now requires:

- `serviceId`
- `serviceVersion`
- `status`
- `environment`
- `definition`
- `mcpUrl`

The generated TypeScript response type now includes `status: ServiceVersionStatus`.

## PublishDeployment High-Impact Request

`publishDeployment` is a high-impact operation because it publishes a deployment and opens published MCP endpoint access.

`PublishDeploymentRequest` now requires:

- `definition`
- `serviceVersion`
- `stepUpToken`
- `reason`
- `impact`
- `recoveryPlan`

The high-impact fields use the same constraints as `HighImpactActionRequest`:

- `stepUpToken`: string, minLength 12, maxLength 160
- `reason`: string, minLength 1, maxLength 500
- `impact`: string, minLength 1, maxLength 500
- `recoveryPlan`: string, minLength 1, maxLength 500

The `publishDeployment` example includes synthetic step-up, reason, impact, and recovery-plan values. No production Secret, credential, or real tenant data was added.

## Deploy And Publish Boundary

`deployCandidate` now documents that it creates or starts the deployment process only. It does not open the MCP endpoint and does not grant published access.

`publishDeployment` now documents that it publishes a healthy deployment and opens published MCP endpoint access for clients with valid credentials and policy authorization.

## Resume Endpoints

Added:

```text
POST /api/v1/workspaces/{workspaceId}/projects/{projectId}/environments/{environment}/services/{serviceId}:resume
operationId: resumeServiceCalls
```

Rules:

- Requires `Idempotency-Key`.
- Uses `HighImpactActionRequest`.
- Requires `stepUpToken`, `reason`, `impact`, and `recoveryPlan`.
- Success returns `HighImpactActionResponse`.
- Failure responses use shared `ErrorEnvelope`.
- Unauthorized and not-found remain merged through `NotFoundOrDeniedError`.
- Request, success, and failure examples are included.

Also added:

```text
POST /api/v1/workspaces/{workspaceId}/projects/{projectId}/environments/{environment}/services/{serviceId}:resume-new-access
operationId: resumeNewAccess
```

Rules:

- Uses `Operations` tag.
- Requires WorkspaceId, ProjectId, Environment, ServiceId, and `Idempotency-Key`.
- Uses `HighImpactActionRequest`.
- Success returns `HighImpactActionResponse`.
- Declares 200, 401, 404, and 409 responses.
- 401/404 use the existing non-leaking public error responses.
- Request, success, and failure examples are included.

Existing operations remain separate and were not merged:

- `pauseServiceCalls`
- `resumeServiceCalls`
- `stopNewAccess`
- `resumeNewAccess`
- `retireServiceVersion`

## Operations Summary Status Fields

`OperationsSummaryResponse.status` was removed because it mixed deployment health/lifecycle and service-version lifecycle.

`OperationsSummaryResponse` now requires:

- `serviceVersionStatus`, referencing `ServiceVersionStatus`
- `deploymentStatus`, referencing `DeploymentStatus`

The fields include descriptions:

- `serviceVersionStatus`: lifecycle state of the published service version.
- `deploymentStatus`: lifecycle and health state of the current environment deployment.

The summary response still includes `serviceId`, `environment`, `calls`, `errors`, and `p95Ms`.

`scripts/contracts-lint-schemas.mjs` now enforces:

- `OperationsSummaryResponse.status` is forbidden.
- `serviceVersionStatus` is required and must `$ref` `ServiceVersionStatus`.
- `deploymentStatus` is required and must `$ref` `DeploymentStatus`.
- High-impact operation IDs are checked through an exact Set, not a loose regex.
- Existing high-impact request schemas must directly require `stepUpToken`, `reason`, `impact`, and `recoveryPlan` with the approved string constraints.

## Generated Types And Baseline

Generated file:

- `packages/contracts/src/generated/release-ops.ts`

Breaking baseline:

- `packages/contracts/baselines/release-ops.v1.public-surface.json`

Before baseline update, `pnpm --filter @modular-mcp/contracts breaking:check` failed as expected and identified:

- `DeploymentResponse` required fields changed because `stage` is no longer required.
- `DeploymentStatus` removed old enum values `building`, `loading`, and `published`.
- `ServiceReleaseResponse` required fields changed because `status` was added.

For this second review round, before baseline update, `pnpm --filter @modular-mcp/contracts breaking:check` failed as expected and identified:

- Operation surface tracking was missing from the previous control-plane and release-ops baselines.
- `OperationsSummaryResponse` required fields changed.
- `OperationsSummaryResponse.status` was removed.
- `PublishDeploymentRequest` required fields changed.

The breaking-check tool now tracks operationId, method, and path in the public-surface baseline so future operation additions/removals/path changes are detected. The previous baseline had no operation surface, so the first tool-fixed run reported the missing operation surface rather than isolating `resumeNewAccess`; the updated baseline now includes `resumeNewAccess`.

After review-approved semantic correction, generated types and the public-surface baseline were updated to match only this intended pre-release data-model fix.

## Validation Commands

Executed commands during this remediation:

| Command                                                                                                           | Result                                                                                            |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `git status --short`                                                                                              | PASS, confirmed existing uncommitted WP changes.                                                  |
| `./scripts/check-work-package-ready.sh WP-02A`                                                                    | PASS, dependency `WP-01D` was ready for WP-02A remediation work.                                  |
| `pnpm --filter @modular-mcp/contracts breaking:check` before baseline update                                      | Expected FAIL, confirmed public-surface change was detected.                                      |
| `pnpm --filter @modular-mcp/contracts breaking:check` after operation-surface tool fix                            | Expected FAIL, confirmed missing operation baseline plus schema changes.                          |
| `pnpm --filter @modular-mcp/contracts generate:types`                                                             | PASS, regenerated common/control-plane/release-ops/definition types.                              |
| `node scripts/contracts-breaking-check.mjs --write`                                                               | PASS, updated reviewed baselines for release-ops semantic changes and operation surface tracking. |
| `pnpm --filter @modular-mcp/contracts lint:schemas`                                                               | PASS, 89 schemas checked across 3 OpenAPI documents plus registry checks.                         |
| `pnpm --filter @modular-mcp/contracts validate:examples`                                                          | PASS, 4 valid fixtures, 3 invalid fixtures, and 46 operation examples checked.                    |
| `pnpm --filter @modular-mcp/contracts validate:registry`                                                          | PASS, 5 registry schemas, 5 golden fixtures, and 3 negative fixtures checked.                     |
| `pnpm test:contract`                                                                                              | PASS, schema lint, examples, generated types, and baseline are current.                           |
| `pnpm --filter @modular-mcp/domain test`                                                                          | PASS, 35 Domain remediation tests; relevant for API/Domain enum consistency.                      |
| `pnpm --filter @modular-mcp/domain build`                                                                         | PASS.                                                                                             |
| `pnpm verify:affected` first run                                                                                  | FAIL at format after baseline writer refreshed common/control-plane JSON layout.                  |
| `pnpm exec prettier --write packages/contracts/baselines/*.json`                                                  | PASS, normalized baseline formatting.                                                             |
| `pnpm verify:affected` final run                                                                                  | PASS.                                                                                             |
| `pnpm verify`                                                                                                     | PASS.                                                                                             |
| `git diff --check`                                                                                                | PASS, no whitespace errors.                                                                       |
| `rg -n "postgres\|prisma\|drizzle\|temporal\|redis\|opensearch\|opa\|express\|next\|aws-sdk" packages/domain/src` | PASS, no output after removing a local variable-name false positive.                              |

## API Gate

WP-01C remains `IMPLEMENTED_AWAITING_REVIEW`.

API review must explicitly accept:

- Deployment lifecycle states replacing old execution-phase statuses.
- Optional deployment `stage`.
- New `completed` deployment stage.
- New `ServiceVersionStatus`.
- Required `ServiceReleaseResponse.status`.
- New high-impact `resumeServiceCalls` endpoint.
- New high-impact `resumeNewAccess` endpoint.
- `publishDeployment` high-impact fields.
- `OperationsSummaryResponse` split into `serviceVersionStatus` and `deploymentStatus`.
- Operation surface tracking in the breaking-change baseline.

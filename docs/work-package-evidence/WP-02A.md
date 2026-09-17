---
work_package: WP-02A
status: PASS
completed_at: 2026-09-16T10:33:56Z
gate: data
depends_on:
  - WP-01D
---

# WP-02A Evidence

## Review Remediation Scope

This evidence records the WP-02A side of the “WP-01C / WP-02A contract and domain data consistency” review remediation.

Changed files:

- `packages/domain/src/values.ts`
- `packages/domain/src/aggregates.ts`
- `packages/domain/src/state-machines.ts`
- `packages/domain/src/index.ts`
- `packages/domain/src/result.ts`
- `packages/domain/package.json`
- `tests/domain/state-machines.test.ts`
- `tests/domain/contract-conformance.test.ts`
- `docs/work-package-evidence/WP-02A.md`

No database, Web, Temporal, OPA, Redis, OpenSearch, cloud SDK, persistence model, HTTP handler, ErrorEnvelope serializer, production credential, real tenant data, or external write was added.

Because this work package declares `gate: data`, the implementation remains `IMPLEMENTED_AWAITING_REVIEW` until data review signs off. It must not be marked `PASS` by Codex.

## Review Findings Closed

| Finding                                                                                      | Closure                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain accepted IDs that public `OpaqueId` rejects.                                          | Domain now exports and uses `OPAQUE_ID_PATTERN = ^[a-z][a-z0-9]*_[A-Za-z0-9_-]{8,128}$`; tests reject `value_001`, uppercase prefixes, path-like IDs, and short suffixes. |
| Domain used `dev`/`prod` while contracts use canonical environment values.                   | Domain now exports `ENVIRONMENTS = ["development", "test", "production"]`; `dev`, `prod`, and `staging` are rejected.                                                     |
| Revision, SemVer, and immutable version IDs were conflated.                                  | Domain now separates `RevisionValue`, `ExactVersionValue`, and opaque VersionId objects.                                                                                  |
| Revision allowed `0`.                                                                        | Revision constructors now require `Number.isSafeInteger(value) && value >= 1`; transition overflow returns `REVISION_OVERFLOW`.                                           |
| Project-scoped aggregates used naked workspace/project/environment strings or omitted scope. | Project-scoped aggregates now carry `ProjectScope`; platform module versions carry `PlatformScope`.                                                                       |
| State transitions did not verify scope/resource containment.                                 | `transitionState` now checks scope equality and that `resourceIds` includes the target entity ID.                                                                         |
| Service and deployment recovery semantics were missing.                                      | `suspended -> published` and `suspended -> healthy` were added with `release.resume` and `deployment.resume`.                                                             |
| Tests used an all-powerful actor.                                                            | Every legal edge is tested with a minimal allowed role and the exact edge capability, plus role/capability negative cases.                                                |
| Contract and Domain status enums could drift.                                                | Added `tests/domain/contract-conformance.test.ts`, which reads JSON Schema files and compares public enums/patterns to Domain.                                            |

## Canonical Public Semantics

### Environment

Domain canonical environments:

```text
development
test
production
```

These are checked against both:

- `packages/contracts/openapi/control-plane.v1.json#/components/schemas/Environment`
- `packages/contracts/openapi/release-ops.v1.json#/components/schemas/ReleaseEnvironment`

### Opaque ID

Domain Opaque IDs use the exact public schema pattern:

```text
^[a-z][a-z0-9]*_[A-Za-z0-9_-]{8,128}$
```

Examples:

- Accepted: `ws_01HZY8T3M6R7P9K2Q4V5X6Y7Z8`
- Accepted: `prj_01HZY8T3M6R7P9K2Q4V5X6Y7Z8`
- Accepted: `dv_01HZY8T3M6R7P9K2Q4V5X6Y7Z8`
- Rejected: `value_001`
- Rejected: `ABC_12345678`
- Rejected: `../secret`
- Rejected: `ws_short`

### Revision / ExactVersion / VersionId

| Category     | Meaning                                                            | Domain types                                                                  |
| ------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Revision     | Positive safe integer for optimistic concurrency on mutable facts. | `WorkspaceRevision`, `ProjectRevision`, `DraftRevision`, `CredentialRevision` |
| ExactVersion | Exact SemVer string for immutable release/versioned artifacts.     | `ModuleVersion`, `DefinitionVersion`, `CandidateVersion`, `ReleaseVersion`    |
| VersionId    | Opaque ID for immutable fact versions.                             | `DataVersionId`, `PolicyVersionId`                                            |

Second review added `DataSourceRevision` to the Revision category and the public constructor:

```ts
dataSourceRevision(value: number): DomainResult<DataSourceRevision>
```

It reuses the shared revision invariant: `Number.isSafeInteger(value) && value >= 1`.

Removed from public Domain exports:

- `WorkspaceVersion`
- `ProjectVersion`
- SemVer `DataVersion`
- SemVer `AccessPolicyVersion`
- SemVer `CredentialVersion`

No deprecated aliases were kept because these APIs have not been released.

## Aggregate Scope Table

| Aggregate                    | Scope                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| `WorkspaceAggregate`         | Workspace root; no project/environment.                                                                 |
| `ProjectAggregate`           | Belongs to a Workspace; project itself spans environments.                                              |
| `DataSourceAggregate`        | `ProjectScope` with workspace/project/environment; has `revision: DataSourceRevision`; no upload state. |
| `DataVersionAggregate`       | `ProjectScope`; has `state: UploadState`; immutable; no SemVer data version.                            |
| `DraftAggregate`             | `ProjectScope`; has `revision: DraftRevision`; editable by state.                                       |
| `ModuleVersionAggregate`     | `PlatformScope`; P0 module catalog object, no Workspace-private module scope.                           |
| `ServiceDefinitionAggregate` | `ProjectScope`; exact `DefinitionVersion`; digest; immutable.                                           |
| `CandidateAggregate`         | `ProjectScope`; `candidateId`; exact `CandidateVersion`; frozen.                                        |
| `ServiceReleaseAggregate`    | `ProjectScope`; `serviceId`; `serviceVersionId`; exact `ReleaseVersion`.                                |
| `DeploymentAggregate`        | `ProjectScope`; references `serviceVersionId`.                                                          |
| `AccessPolicyAggregate`      | `ProjectScope`; references opaque `policyVersionId`.                                                    |
| `CredentialAggregate`        | `ProjectScope`; references `serviceId` and `accessPolicyId`; has `CredentialRevision`.                  |

Scope types:

- `PlatformScope = { kind: "platform" }`
- `ProjectScope = { kind: "project"; workspaceId; projectId; environment }`
- `DomainScope = PlatformScope | ProjectScope`

## State Tables

PRD wording in WP-02A says “six” critical state machines, while PRD section 9 lists seven. This implementation covers all seven PRD-listed machines.

| Machine         | Legal transitions                                                                                                                                                                                                                                                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Draft           | `editing -> validating -> ready -> building -> built -> submitted`                                                                                                                                                                                                                                                                                 |
| Candidate       | `submitted -> changes_requested`, `submitted -> materials_required`, `submitted -> rejected`, `submitted -> approved`, `submitted -> withdrawn`                                                                                                                                                                                                    |
| Service Version | `approved -> deploying`, `deploying -> published`, `published -> suspended`, `suspended -> published`, `suspended -> retired`                                                                                                                                                                                                                      |
| Deployment      | `provisioning -> healthy`, `provisioning -> blocked`, `healthy -> degraded`, `healthy -> draining`, `degraded -> healthy`, `degraded -> draining`, `degraded -> blocked`, `draining -> suspended`, `draining -> stopped`, `suspended -> healthy`, `suspended -> stopped`                                                                           |
| Upload          | `created -> uploading`, `created -> cancelled`, `created -> expired`, `uploading -> uploaded`, `uploading -> failed`, `uploading -> cancelled`, `uploading -> expired`, `uploaded -> processing`, `uploaded -> failed`, `uploaded -> cancelled`, `uploaded -> expired`, `processing -> completed`, `processing -> partial`, `processing -> failed` |
| Credential      | `active -> rotating`, `active -> revoked`, `active -> expired`, `rotating -> revoked`, `rotating -> expired`                                                                                                                                                                                                                                       |
| Module Version  | `draft -> testing`, `testing -> submitted`, `submitted -> approved`, `submitted -> blocked`, `approved -> deprecated`, `approved -> blocked`                                                                                                                                                                                                       |

All self transitions and all other non-PRD state pairs are rejected.

## Terminal And Retry Semantics

- Candidate terminal states for the current Candidate: `changes_requested`, `materials_required`, `rejected`, `approved`, `withdrawn`. A revised submission creates a new Candidate.
- Upload interruption recovery stays in `uploading`; no self transition is added. `failed` and `partial` retry facts are deferred to later workflow/persistence WPs.
- Credential `active -> rotating` means the old credential enters the rotation window. The new credential is a new `CredentialAggregate` in `active`; old credentials finish through `rotating -> revoked` or `rotating -> expired`. No `rotating -> active` edge is added.
- ModuleVersion `blocked` is terminal for the current version. Unblocking requires a new reviewed version or a later explicit admin workflow.
- Deployment `suspended -> healthy` represents recovery after application/workflow health checks. Domain only expresses the legal business edge.
- ServiceVersion `suspended -> published` represents resuming calls for the released version.

## Transition Guard Rules

`transitionState` checks before mutating:

- `request.from` equals `entity.state`.
- `expectedRevision` is a positive safe integer.
- `expectedRevision` equals `entity.revision`.
- `reason.trim()` is non-empty.
- `impactScope.resourceIds` is non-empty.
- `impactScope.scope` equals `entity.scope`.
- `impactScope.resourceIds` contains `entity.id`.
- State edge is legal.
- Edge requirement exists.
- Actor has at least one allowed role.
- Actor has the exact edge capability.
- `revision + 1` does not exceed `Number.MAX_SAFE_INTEGER`.

Time and IDs come from `DomainPorts`; tests use fixed `ClockPort` and fixed `IdPort`.

## Domain Error Codes And API Mapping Responsibility

`DomainErrorCode` is an internal stable code. HTTP handlers must not serialize it directly.

| Domain code                                                  | Application/API mapping responsibility                                                                                |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `ACTOR_NOT_ALLOWED` / `MISSING_CAPABILITY`                   | Map outward to `AUTHZ_NOT_FOUND_OR_DENIED`; do not leak existence.                                                    |
| `REVISION_CONFLICT`                                          | Map to HTTP 409; public code depends on the endpoint contract.                                                        |
| `INVALID_VALUE` / `MISSING_REASON` / `IMPACT_SCOPE_REQUIRED` | Map to sanitized request validation errors.                                                                           |
| `INVALID_STATE_PRECONDITION` / `INVALID_STATE_TRANSITION`    | Map to state conflict without returning internal state objects or stacks.                                             |
| `SCOPE_MISMATCH` / `RESOURCE_NOT_IN_SCOPE`                   | Treat externally as unauthorized or not found; do not reveal other tenant scope.                                      |
| `REVISION_OVERFLOW`                                          | Treat as internal/state conflict requiring operator investigation, without leaking stack or internal storage details. |

WP-02A does not add HTTP handlers and does not implement `ErrorEnvelope` serialization.

## Validation Commands

Executed commands during this remediation:

| Command                                                                                                           | Result                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `git status --short`                                                                                              | PASS, confirmed existing uncommitted WP changes.                                                             |
| `./scripts/check-work-package-ready.sh WP-02A`                                                                    | PASS, dependency `WP-01D` reported ready.                                                                    |
| `pnpm --filter @modular-mcp/domain test`                                                                          | PASS, 35 tests across `tests/domain/state-machines.test.ts` and `tests/domain/contract-conformance.test.ts`. |
| `pnpm --filter @modular-mcp/domain build`                                                                         | PASS.                                                                                                        |
| `rg -n "postgres\|prisma\|drizzle\|temporal\|redis\|opensearch\|opa\|express\|next\|aws-sdk" packages/domain/src` | PASS, no output after removing a local variable-name false positive.                                         |
| `pnpm --filter @modular-mcp/contracts lint:schemas`                                                               | PASS, 89 schemas checked across 3 OpenAPI documents plus registry checks.                                    |
| `pnpm --filter @modular-mcp/contracts validate:examples`                                                          | PASS, 4 valid fixtures, 3 invalid fixtures, and 46 operation examples checked.                               |
| `pnpm --filter @modular-mcp/contracts validate:registry`                                                          | PASS, 5 registry schemas, 5 golden fixtures, and 3 negative fixtures checked.                                |
| `pnpm test:contract`                                                                                              | PASS.                                                                                                        |
| `pnpm verify:affected` first run                                                                                  | FAIL at format after baseline writer refreshed common/control-plane JSON layout; fixed with Prettier.        |
| `pnpm verify:affected` final run                                                                                  | PASS.                                                                                                        |
| `pnpm verify`                                                                                                     | PASS.                                                                                                        |
| `git diff --check`                                                                                                | PASS, no whitespace errors.                                                                                  |

Second review target tests add:

- `DataSourceRevision` accepts `1` and `Number.MAX_SAFE_INTEGER`.
- `DataSourceRevision` rejects `0`, `-1`, `1.5`, `Number.NaN`, `Number.POSITIVE_INFINITY`, and `Number.MAX_SAFE_INTEGER + 1` with `INVALID_VALUE`.
- `DataSourceAggregate` fixtures use `revision: unwrap(dataSourceRevision(1))` and do not bypass the constructor with a type assertion.

## Contract Conformance Test

`tests/domain/contract-conformance.test.ts` reads OpenAPI JSON files directly and verifies:

- Common `OpaqueId.pattern` equals Domain `OPAQUE_ID_PATTERN`.
- Control-plane `Environment` and release-ops `ReleaseEnvironment` equal Domain `ENVIRONMENTS`.
- Control-plane `DraftStatus` equals Domain Draft states.
- Control-plane `DataVersionStatus` equals Domain Upload states.
- Release-ops `CandidateStatus` equals Domain Candidate states.
- Release-ops `DeploymentStatus` equals Domain Deployment states.
- Release-ops `CredentialStatus` equals Domain Credential states.
- Release-ops `ServiceVersionStatus` equals Domain ServiceVersion states.

The test may read contract JSON files, but `packages/domain/src` imports no contract package, Node `fs`, database, workflow, cache, policy, Web, or cloud SDK dependency.

## Residual Risk

- Role/capability strings are coarse P0 domain requirements. Later application/use-case WPs may map concrete product roles to these capabilities without changing state-machine edges.
- Digest comparison, dependency closure, deployment health checks, and workflow retry attempt modeling remain deferred to later compiler/release/data WPs.

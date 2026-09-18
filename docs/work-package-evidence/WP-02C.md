---
work_package: WP-02C
status: PASS
completed_at: 2026-09-17T06:43:13Z
gate: data
depends_on:
  - WP-02B
---

# WP-02C Evidence

## Scope Delivered

Implemented the release-access operations data model as database migration `0002_release_ops`.

- Module, Definition, Candidate, Test, ServiceVersion, Deployment, Policy, Credential, Usage, Quota, Trace, and Audit persistence tables.
- Platform-scoped Module catalog tables (`modules`, `module_versions`) plus tenant-scoped DefinitionModule references into the platform catalog.
- Tenant-scoped `workspace_id/project_id/environment` keys on WP-02C tenant data tables.
- FORCE RLS policies on all WP-02C tables using the WP-02B `app.workspace_id` and `app.actor_id` session settings.
- Append-only/immutable content triggers and lifecycle-state triggers for ModuleVersion, ServiceDefinition, DefinitionModule, Candidate, TestRun, TestCase, ServiceVersion, Deployment, DeploymentEvent, Credential, PolicyVersion, CredentialSecret, RequestTrace, UsageEvent, and AuditEvent.
- Definition digest and exact version uniqueness; Module exact version uniqueness; ServiceVersion exact version uniqueness; UsageEvent idempotency uniqueness.
- Credential metadata split from hashed secret storage; no plaintext credential column is present.
- Credential, Candidate, ServiceVersion, Deployment, TestRun, and ModuleVersion lifecycle updates require exact revision increments where applicable.
- ModuleVersion, Candidate, ServiceVersion, Deployment, Credential, and TestRun enforce canonical initial state with revision `1`; ordinary inserts cannot create terminal records.
- State-machine coverage now executes full from x to matrices for six machines: 187 combinations, 37 legal transitions, and 150 rejected transitions.
- Candidate SemVer is scoped to its ServiceDefinition/Service lineage, not globally unique across a whole project/environment; different Services may carry the same Candidate version.
- ServiceVersion exact version is bound to the approved Candidate version through a composite FK; `ServiceVersion.version` cannot differ from the referenced approved Candidate `version`.
- Candidate version is not required to equal ServiceDefinition version; Candidate remains closed to its Definition by `definition_id + definition_digest`.
- queued/running TestRun rows must have `report_digest IS NULL`; passed/failed rows are the first states that create an immutable report digest.
- Database enum conformance probes compare Candidate/ServiceVersion/Deployment/Credential states to `release-ops.v1.json` and ModuleVersion states to the frozen Domain state set.
- Public OpaqueId mapping for release-ops UUIDv7 rows is frozen in `packages/database/src/index.ts`.
- Query indexes for service version state, deployment state, policy/credential lookups, request traces, usage events, and audit events.
- Integration fixture rows and negative probes for enum drift, immutable facts, lifecycle edges, composite FK closure, cross-entity mismatch, audit append-only protection, schema scans, OpaqueId mapping, and query index usage.

No HTTP handler, Repository implementation, RBAC/OPA policy, Temporal workflow, Redis/OpenSearch adapter, Web code, production credential, real tenant data, external API write, or destructive infrastructure reset was added.

WP-02C passed the data gate review. The migration shape, RLS coverage,
immutability rules, lifecycle constraints, composite relationship closure,
digest/version constraints, credential secret separation, audit protection,
index coverage, fixtures, and migration lifecycle were reviewed and accepted.

## Changed Files

- `packages/database/migrations/0002_release_ops.up.sql`
- `packages/database/migrations/0002_release_ops.down.sql`
- `packages/database/fixtures/tenant-core.sql`
- `packages/database/scripts/verify-tenant-core.mjs`
- `packages/database/src/index.ts`
- `docs/work-package-evidence/WP-02C.md`

## Migration Head

Current database migration head:

```text
0002_release_ops
```

Package export:

```ts
export const migrationHead = "0002_release_ops";
```

Migration lifecycle verified by integration test:

- Empty database migrate: `applied 0001_tenant_core`, `applied 0002_release_ops`.
- Second migrate: both migrations skipped as already applied.
- Rollback latest: `rolled back 0002_release_ops`.
- Re-migrate: `applied 0002_release_ops`.

## New Tables

| Area                | Tables                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| Module              | `modules`, `module_versions`                                                                      |
| Definition          | `services`, `service_definitions`, `definition_modules`                                           |
| Candidate/Test      | `candidates`, `test_runs`, `test_cases`                                                           |
| Publish/Deploy      | `service_versions`, `deployments`, `deployment_events`                                            |
| Policy/Credential   | `access_policies`, `policy_versions`, `credentials`, `credential_secrets`, `credential_rotations` |
| Runtime/Usage/Audit | `request_traces`, `usage_events`, `quota_buckets`, `audit_events`                                 |

All WP-02C tables have RLS enabled and forced. Tenant data tables are scoped by `workspace_id/project_id/environment`; `modules` and `module_versions` are platform catalog tables with runtime read policy only (`app.current_actor_id() IS NOT NULL`) and no runtime write policy.

## Key Constraints

- `service_definitions`:
  - immutable after insert;
  - unique `(workspace_id, project_id, environment, service_id, version)`;
  - unique `(workspace_id, project_id, environment, digest)`.
- `modules` and `module_versions`:
  - platform-scoped; no `workspace_id/project_id/environment` ownership columns;
  - runtime role can read with actor context but cannot write;
  - module identity is stable through `modules(id, module_name, module_kind)`;
  - `module_versions(module_id, module_name, module_kind)` references `modules(id, module_name, module_kind)`, so parent ID/name/kind cannot be mixed;
  - `module_versions` content (`module_id`, `module_name`, `module_kind`, `version`, artifact digest, signature, created_at) is immutable;
  - initial state is `draft`, revision `1`;
  - lifecycle status follows `draft -> testing -> submitted -> approved -> deprecated/blocked`;
  - `deprecated` and `blocked` are terminal;
  - status updates require `revision = OLD.revision + 1` and a real status change.
- `candidates`:
  - initial status must be `submitted`, revision `1`;
  - `created` and `testing` are not valid database states;
  - `definition_id`, `definition_digest`, exact version, frozen flag, and creation source are immutable;
  - Candidate `version` is not unique across the whole project/environment and different Services can reuse the same SemVer;
  - Candidate `version` is not required to equal ServiceDefinition `version`;
  - `submitted` may transition to `changes_requested`, `materials_required`, `rejected`, `approved`, or `withdrawn`;
  - terminal candidate states reject further updates;
  - status updates require `revision = OLD.revision + 1`;
  - exactly one candidate per definition in this schema version.
- `service_versions`:
  - initial state is `approved`, revision `1`;
  - immutable release content: service, definition, approved candidate, exact version, definition digest, artifact digest, and creation source;
  - unique exact service version;
  - `definition_id + definition_digest + service_id` must reference the same ServiceDefinition;
  - `candidate_id + definition_id + definition_digest + candidate_status='approved' + version` requires an approved Candidate with the same exact version as the ServiceVersion;
  - lifecycle status follows `approved -> deploying`, `deploying -> published`, `published -> suspended`, and `suspended -> published/retired`;
  - `retired` is terminal;
  - status updates require `revision = OLD.revision + 1` and a real status change.
- `deployments`:
  - initial state is `provisioning`, revision `1`;
  - content fields and service/service-version/digest binding are immutable;
  - composite FK binds `(service_version_id, service_id, definition_digest)` to a single ServiceVersion;
  - lifecycle status follows WP-02A Deployment edges exactly;
  - status updates require `revision = OLD.revision + 1` and a real status change;
  - every status update requires a matching deferred DeploymentEvent in the same transaction;
  - `deployment_events` has unique `(workspace_id, project_id, environment, deployment_id, deployment_revision)`;
  - DeploymentEvent `from_status/to_status/deployment_revision` must match a legal edge and the final Deployment state;
  - only one Deployment state change per Deployment is allowed in a single transaction, because deferred event validation requires every event revision/status to match the transaction-final Deployment row.
- `credentials` and `credential_secrets`:
  - initial state is `active`, revision `1`;
  - credentials carry only metadata and public digest;
  - `service_id + access_policy_id` must reference an AccessPolicy belonging to the same Service;
  - status follows `active -> rotating/revoked/expired` and `rotating -> revoked/expired`;
  - `revoked` and `expired` are terminal;
  - every Credential update requires `revision = OLD.revision + 1`;
  - revision-only updates are rejected; non-terminal rows may update `status` or the explicitly allowed `expires_at`;
  - credential secret material is represented by `secret_hash` and `secret_digest`, not plaintext;
  - secret rows are immutable.
- `test_runs`:
  - initial state is `queued`, revision `1`;
  - identity and input fields are immutable;
  - lifecycle status follows `queued -> running/cancelled` and `running -> passed/failed/cancelled`;
  - `passed`, `failed`, and `cancelled` are terminal;
  - queued/running rows must not have `completed_at` or `report_digest`;
  - passed/failed rows require `completed_at` and `report_digest`;
  - cancelled rows require `completed_at` and may leave `report_digest` null;
  - terminal report digests are immutable because terminal TestRun rows reject all updates;
  - status updates require `revision = OLD.revision + 1` and a real status change;
  - TestCase rows remain append-only; no TestRunEvent table is introduced in WP-02C.
- `credential_rotations`:
  - old/new credentials must share the same service, access policy, and subject;
  - cross-service, cross-policy, and cross-subject rotations are rejected by composite FKs.
- `request_traces`, `usage_events`, and `quota_buckets`:
  - `service_id` closes the relationship between ServiceVersion and Credential;
  - a credential from another Service cannot be used with a ServiceVersion, Trace, UsageEvent, or QuotaBucket.
- `usage_events`:
  - immutable after insert;
  - unique idempotency key per tenant/environment.
- `audit_events`:
  - append-only; runtime update/delete is rejected by trigger.

Schema scan result:

```text
PASS schema scan has no secret_plaintext or body columns
```

## Indexes

New indexes include:

- `idx_module_versions_status`
- `idx_service_definitions_digest`
- `idx_candidates_definition_status`
- `idx_test_runs_definition_status`
- `idx_service_versions_status`
- `idx_deployments_status`
- `idx_policy_versions_policy_status`
- `idx_credentials_service_status`
- `idx_request_traces_trace`
- `idx_usage_events_service_time`
- `idx_audit_events_resource_time`

Integration `EXPLAIN` probes confirmed:

- service versions status query uses `idx_service_versions_status`;
- deployments status query uses `idx_deployments_status`;
- request trace query uses `idx_request_traces_trace`;
- usage events service/time query uses `idx_usage_events_service_time`.

## Integration Coverage

`pnpm --filter @modular-mcp/database test:integration` covers:

- all WP-02C tables enable and force RLS;
- missing workspace or actor context returns zero rows for all WP-02C tables;
- database enum conformance:
  - `app.candidate_status` = release-ops `CandidateStatus`;
  - `app.service_version_status` = release-ops `ServiceVersionStatus`;
  - `app.deployment_status` = release-ops `DeploymentStatus`;
  - `app.credential_status` = release-ops `CredentialStatus`;
  - `app.module_version_status` = Domain ModuleVersion states.
- platform Module runtime write rejected;
- ModuleVersion content update rejected;
- ModuleVersion full state matrix covered;
- ModuleVersion terminal rollback rejected;
- ServiceDefinition update rejected;
- Candidate `submitted` insert accepted;
- Candidate `created` and `testing` rejected;
- Candidate self-transition and terminal rollback rejected;
- Candidate full state matrix covered;
- DefinitionModule forged module name/version/digest rejected;
- TestRun Candidate/Definition mismatch rejected;
- non-approved Candidate cannot create ServiceVersion;
- ServiceVersion Candidate/Definition mismatch rejected;
- different Services can each create Candidate version `1.0.0` in the same workspace/project/environment;
- Candidate version can differ from ServiceDefinition version;
- Candidate `9.0.0` cannot create ServiceVersion `8.0.0`;
- Candidate `9.0.0` can create ServiceVersion `9.0.0`;
- Candidate version match with a Candidate ID from another Definition is rejected;
- same Service duplicate ServiceVersion `1.0.0` is rejected;
- ServiceVersion full state matrix covered;
- ServiceVersion revision skip rejected;
- queued TestRun with `report_digest` rejected;
- queued -> running with `report_digest` rejected;
- running TestRun `report_digest`-only update rejected;
- running -> passed without `report_digest` rejected;
- running -> failed without `report_digest` rejected;
- running -> passed with `completed_at + report_digest` accepted;
- running -> failed with `completed_at + report_digest` accepted;
- terminal TestRun `report_digest` update rejected;
- Deployment Service/ServiceVersion mismatch rejected;
- Deployment full state matrix covered;
- Deployment update without matching event rejected;
- DeploymentEvent from/to mismatch rejected;
- DeploymentEvent duplicate revision rejected;
- DeploymentEvent revision/status mismatch rejected;
- Deployment revision-only update rejected;
- Deployment one-state-change-per-transaction rule covered;
- Credential Service/Policy mismatch rejected;
- Credential full state matrix covered;
- Credential revision not increasing rejected;
- Credential revision-only update rejected;
- Credential `expires_at` update with exact revision +1 accepted;
- TestRun full state matrix covered;
- Rotation old/new cross-Service, cross-Policy, and cross-subject rejected;
- Trace, UsageEvent, and QuotaBucket using another Service's Credential rejected;
- duplicate UsageEvent idempotency key rejected;
- AuditEvent update/delete rejected;
- schema scan rejects `secret_plaintext` and `body` columns;
- OpaqueId mapping round-trip, wrong prefix, and non-UUIDv7 probes for Service, Definition, Candidate, ServiceVersion, Deployment, AccessPolicy, PolicyVersion, Credential, Trace, and Audit;
- key status/time/trace/usage query indexes are used.

## State Tables

| Aggregate      | Database states                                                                             | Legal database edges                                                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Candidate      | `submitted`, `changes_requested`, `materials_required`, `rejected`, `approved`, `withdrawn` | `submitted` to any other listed state; all non-`submitted` states are terminal for that Candidate.                                                                                                            |
| ModuleVersion  | `draft`, `testing`, `submitted`, `approved`, `deprecated`, `blocked`                        | `draft -> testing`; `testing -> submitted`; `submitted -> approved/blocked`; `approved -> deprecated/blocked`; `deprecated` and `blocked` terminal.                                                           |
| ServiceVersion | `approved`, `deploying`, `published`, `suspended`, `retired`                                | `approved -> deploying`; `deploying -> published`; `published -> suspended`; `suspended -> published/retired`; `retired` terminal.                                                                            |
| Deployment     | `provisioning`, `healthy`, `degraded`, `draining`, `suspended`, `stopped`, `blocked`        | `provisioning -> healthy/blocked`; `healthy -> degraded/draining`; `degraded -> healthy/draining/blocked`; `draining -> suspended/stopped`; `suspended -> healthy/stopped`; `stopped` and `blocked` terminal. |
| Credential     | `active`, `rotating`, `revoked`, `expired`                                                  | `active -> rotating/revoked/expired`; `rotating -> revoked/expired`; `revoked` and `expired` terminal.                                                                                                        |
| TestRun        | `queued`, `running`, `passed`, `failed`, `cancelled`                                        | `queued -> running/cancelled`; `running -> passed/failed/cancelled`; `passed`, `failed`, and `cancelled` terminal.                                                                                            |

Initial states:

| Aggregate      | Initial state  | Initial revision |
| -------------- | -------------- | ---------------- |
| ModuleVersion  | `draft`        | `1`              |
| Candidate      | `submitted`    | `1`              |
| ServiceVersion | `approved`     | `1`              |
| Deployment     | `provisioning` | `1`              |
| Credential     | `active`       | `1`              |
| TestRun        | `queued`       | `1`              |

Full state matrix coverage:

| Aggregate      | Combinations | Legal successes | Rejections |
| -------------- | ------------:| ---------------:| ----------:|
| ModuleVersion  | 36           | 6               | 30         |
| Candidate      | 36           | 5               | 31         |
| ServiceVersion | 25           | 5               | 20         |
| Deployment     | 49           | 11              | 38         |
| Credential     | 16           | 5               | 11         |
| TestRun        | 25           | 5               | 20         |
| Total          | 187          | 37              | 150        |

## Composite Relationship Closure

| Relationship                                         | Closure mechanism                                                                                                                                                                               |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ModuleVersion -> Module                              | Composite FK `(module_id, module_name, module_kind)` to platform `modules`.                                                                                                                     |
| DefinitionModule -> ModuleVersion                    | Composite FK `(module_version_id, module_name, exact_version, artifact_digest)` to platform `module_versions`.                                                                                  |
| Candidate -> ServiceDefinition                       | Composite FK `(definition_id, definition_digest)` to `service_definitions`.                                                                                                                     |
| TestRun -> Candidate/Definition                      | Composite FK `(candidate_id, definition_id, definition_digest)` to `candidates`; `candidate_id` may be null for Definition-level tests.                                                         |
| ServiceVersion -> ServiceDefinition                  | Composite FK `(definition_id, definition_digest, service_id)` to `service_definitions`.                                                                                                         |
| ServiceVersion -> approved Candidate                 | Composite FK `(candidate_id, definition_id, definition_digest, candidate_status, version)` with `candidate_status='approved'`, binding ServiceVersion exact version to Candidate exact version. |
| Deployment -> ServiceVersion                         | Composite FK `(service_version_id, service_id, definition_digest)` to `service_versions`.                                                                                                       |
| Credential -> AccessPolicy                           | Composite FK `(access_policy_id, service_id)` to `access_policies`.                                                                                                                             |
| CredentialRotation -> old/new Credential             | Composite FKs require identical service, access policy, and subject for old/new credentials.                                                                                                    |
| RequestTrace/UsageEvent -> ServiceVersion/Credential | `service_id` participates in both FKs, binding service version and credential to the same Service.                                                                                              |
| QuotaBucket -> Credential                            | Composite FK `(credential_id, service_id)` to `credentials`.                                                                                                                                    |

## Public ID Mapping

Database rows use internal UUIDv7 primary keys. Public OpaqueIds are encoded as:

```text
<resource-prefix>_<canonical-lowercase-hyphenated-uuid>
```

Rules:

- hyphens are preserved;
- UUID text is normalized to lowercase;
- encoded length is `prefix.length + 1 + 36`;
- decode validates the expected resource prefix before validating UUIDv7 version and RFC variant;
- wrong prefixes do not decode as another resource type;
- `encode(decode(id))` equals the normalized original ID.

Frozen WP-02C prefixes:

| Resource       | Prefix  | Example                                      |
| -------------- | ------- | -------------------------------------------- |
| Service        | `svc`   | `svc_018f0000-0000-7000-8000-000000001001`   |
| Definition     | `def`   | `def_018f0000-0000-7000-8000-000000001201`   |
| Candidate      | `cand`  | `cand_018f0000-0000-7000-8000-000000001301`  |
| ServiceVersion | `sv`    | `sv_018f0000-0000-7000-8000-000000001501`    |
| Deployment     | `dep`   | `dep_018f0000-0000-7000-8000-000000001601`   |
| AccessPolicy   | `ap`    | `ap_018f0000-0000-7000-8000-000000001701`    |
| PolicyVersion  | `pol`   | `pol_018f0000-0000-7000-8000-000000001702`   |
| Credential     | `cred`  | `cred_018f0000-0000-7000-8000-000000001803`  |
| Trace          | `trace` | `trace_018f0000-0000-7000-8000-000000001901` |
| Audit          | `audit` | `audit_018f0000-0000-7000-8000-000000001951` |

The mapping is exported from `packages/database/src/index.ts` through `opaqueIdPrefixes`, `opaqueIdUuidV7Format`, `opaqueIdUuidV7EncodedLengths`, `opaqueIdUuidV7TestVectors`, `encodeOpaqueId()`, and `decodeOpaqueId()`.

## Repository Ports Still Pending

WP-02C only freezes the database model. Later Repository/application work must implement:

- ModuleVersion lookup by exact SemVer and digest.
- ServiceDefinition append/read by digest, version, and ID.
- Candidate/test evidence append and query.
- ServiceVersion publish/read with digest verification.
- Deployment state update with audited DeploymentEvent append.
- AccessPolicy/PolicyVersion read and activation semantics.
- Credential creation, rotation, revocation, and one-time secret presentation.
- RequestTrace and UsageEvent append with idempotency.
- AuditEvent append-only writer.

## Validation Commands

| Command                                                                                                                        | Result | Evidence                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git status --short`                                                                                                           | PASS   | Existing WP-02B/WP-01D work preserved; WP-02C changed only database package and WP-02C evidence.                                                                                            |
| `./scripts/check-work-package-ready.sh WP-02C`                                                                                 | PASS   | Reported dependency `WP-02B` PASS and `READY WP-02C`.                                                                                                                                       |
| `docker compose --env-file .env.example -f infra/compose/compose.yaml -p modular-mcp up -d --wait --wait-timeout 120 postgres` | PASS   | Local Postgres container started and became healthy for integration verification.                                                                                                           |
| `pnpm --filter @modular-mcp/database test:integration`                                                                         | PASS   | Empty migrate, second migrate skip, rollback latest `0002`, re-migrate, fixture load, RLS checks, immutability, uniqueness, credential, usage, audit, schema scan, and index probes passed. |
| `pnpm --filter @modular-mcp/database build`                                                                                    | PASS   | TypeScript package build passed.                                                                                                                                                            |
| `pnpm verify:affected`                                                                                                         | PASS   | Format, lint, typecheck, unit, contract, build, dependency scan, and secret scan passed.                                                                                                    |
| `pnpm verify`                                                                                                                  | PASS   | Full verification passed through `pnpm verify:affected`.                                                                                                                                    |
| `pnpm dependency:scan`                                                                                                         | PASS   | Pinned dependency policy passed.                                                                                                                                                            |
| `pnpm secret:scan`                                                                                                             | PASS   | No unallowlisted secret patterns found.                                                                                                                                                     |
| `pnpm ci:local`                                                                                                                | PASS   | Format, lint, typecheck, unit, contract, build, dependency scan, and secret scan passed.                                                                                                    |
| `git diff --check`                                                                                                             | PASS   | No whitespace errors after final evidence update.                                                                                                                                           |

## Global Constraint Check

- [x] Scope stayed inside `packages/database` and this evidence file.
- [x] No handler, Repository, RBAC/OPA, Temporal, Redis, OpenSearch, Web, Worker, or runtime implementation was added.
- [x] No plaintext Secret, request body field, production Secret, real tenant data, or external service write was added.
- [x] No immutable Definition/Candidate/ServiceVersion behavior was weakened.
- [x] No audit update/delete path was allowed.
- [x] No test was skipped or weakened.

## Human Gate

- Gate: `data`
- Status: `PASS`
- Review conclusion: The release-operations schema, tenant isolation, immutable facts, lifecycle matrices, version and digest relationships, DeploymentEvent consistency, credential secret separation, audit protection, index coverage, fixtures, and migration lifecycle passed data review.
- Residual scope: Repository, HTTP handlers, RBAC/OPA, Temporal workflows, and runtime release behavior remain assigned to downstream work packages.

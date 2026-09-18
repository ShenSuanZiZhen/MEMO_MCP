---
work_package: WP-02B
status: PASS
completed_at: 2026-09-17T03:55:29Z
gate: data
depends_on:
  - WP-02A
---

# WP-02B Evidence

## Scope Delivered

Implemented the first tenant-core PostgreSQL migration for Workspace, Project, membership, Data, and Draft persistence with tenant RLS and integration verification.

Delivered:

- `0001_tenant_core` migration with `up` and `down` SQL.
- `app` schema with UUIDv7 version + RFC variant checks, `timestamptz` `CURRENT_TIMESTAMP` defaults, composite tenant foreign keys, safe-integer revision constraints, ownership/status indexes, and fail-closed RLS policies.
- Contract/domain/database field closure for Workspace, Project, DataSource, DataVersion, Draft, and append-only DraftRevision facts.
- Third-round consistency remediation for revision invariants, DataVersion terminal immutability, DataVersion status/stage combinations, Draft state transitions, and Draft/DraftRevision same-transaction consistency.
- Two-workspace fixture with same-name Project/DataSource/Draft records for cross-tenant negative tests.
- Package-local migration, rollback, and database integration scripts; the migration runner now skips already-applied migrations and rollback defaults to the latest applied migration.
- Runtime metadata exports from `@modular-mcp/database` for migration head, RLS settings, tenant-core tables, and OpaqueId/database ID mapping.

No HTTP handler, application repository implementation, release/credential table, Domain change, Temporal workflow, OPA policy, Redis/OpenSearch adapter, Web code, production credential, real tenant data, external API write, or destructive infrastructure reset was added.

Because this work package declares `gate: data`, the implementation remains `IMPLEMENTED_AWAITING_REVIEW` until data review signs off. Codex must not promote this evidence to `PASS`.

## Changed Files

- `packages/database/migrations/0001_tenant_core.up.sql`
- `packages/database/migrations/0001_tenant_core.down.sql`
- `packages/database/fixtures/tenant-core.sql`
- `packages/database/scripts/database-lib.mjs`
- `packages/database/scripts/migrate.mjs`
- `packages/database/scripts/rollback.mjs`
- `packages/database/scripts/verify-tenant-core.mjs`
- `packages/database/scripts/integration-test.mjs`
- `packages/database/package.json`
- `packages/database/src/index.ts`
- `docs/work-package-evidence/WP-02B.md`

## Migration Head

Current database migration head:

```text
0001_tenant_core
```

Package export:

```ts
export const migrationHead = "0001_tenant_core";
```

Migration commands:

- `pnpm --filter @modular-mcp/database migrate`
- `pnpm --filter @modular-mcp/database rollback`
- `pnpm --filter @modular-mcp/database test:integration`

`migrate` and `rollback` require `DATABASE_URL`. `test:integration` creates a temporary database from `WP02B_ADMIN_DATABASE_URL`, `DATABASE_ADMIN_URL`, or the local WP-00B default `postgresql://mcp_dev:mcp_dev_password@127.0.0.1:15432/postgres`.

Migration runner behavior verified:

- Empty database migrate: `applied 0001_tenant_core`.
- Second migrate: `skipped 0001_tenant_core (already applied)`.
- Rollback: `rolled back 0001_tenant_core`.
- Re-migrate: `applied 0001_tenant_core`.

The runner checks up/down file pairing, migration filename ordering, and the current migration head. Future databases that already have `0001_tenant_core` can apply later migrations without re-running `0001`.

## RLS Session Context

RLS reads these transaction/session settings:

| Setting            | Meaning                                |
| ------------------ | -------------------------------------- |
| `app.workspace_id` | Current authenticated Workspace UUIDv7 |
| `app.actor_id`     | Current authenticated Actor UUIDv7     |

Package export:

```ts
export const rlsSessionSettings = {
  workspaceId: "app.workspace_id",
  actorId: "app.actor_id",
};
```

Repository work in later WPs must set these settings inside every database transaction before tenant-scoped queries. Repository methods must still pass explicit workspace/project/environment filters; RLS is the second defense.

Second-round remediation changed integration tests to use transaction-local settings:

```sql
BEGIN;
SET LOCAL app.workspace_id = '<workspace uuid>';
SET LOCAL app.actor_id = '<actor uuid>';
...
COMMIT;
```

The runtime role used by tests is non-superuser and does not have `BYPASSRLS`.

RLS policies now require both:

- table `workspace_id` or workspace root `id` equals `app.current_workspace_id()`;
- `app.current_actor_id() IS NOT NULL`.

Missing-context results:

| Context                          | Read result                                                        | Write result                           |
| -------------------------------- | ------------------------------------------------------------------ | -------------------------------------- |
| Workspace set, actor missing     | Every tenant-core table returns `0` rows.                          | Insert rejected by RLS policy.         |
| Actor set, workspace missing     | Every tenant-core table returns `0` rows.                          | Insert rejected by RLS policy.         |
| Workspace and actor both missing | Every tenant-core table returns `0` rows.                          | Insert rejected by RLS policy.         |
| Previous transaction had context | Next transaction without settings returns `0`; context not leaked. | N/A; `SET LOCAL` cleared after commit. |

## Contract / Domain / Database Field Closure

| Concept       | Contract / Domain field                                      | Database column(s)                                                                                     |
| ------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Workspace     | `workspaceId`, `kind`, region, revision/status/time facts    | `workspaces.id`, `kind`, `region`, `revision`, `status`, `created_at`, `updated_at`                    |
| Project       | `projectId`, `description`, `defaultRegion`, environment     | `projects.id`, `description`, `default_region`, `default_environment`, `revision`, `status`            |
| DataSource    | kind, sensitivity, rights, version strategy, revision        | `data_sources.kind`, `sensitivity`, `rights`, `version_strategy`, `revision`, `state`                  |
| DataVersion   | upload state, processing stage, digest, completion timestamp | `data_versions.status`, `processing_stage`, nullable `content_digest`, nullable `completed_at`         |
| Draft         | status, current step, revision, creation mode/source         | `drafts.state`, `current_step`, `revision`, `creation_mode`, `template_id`, `source_version_id`        |
| DraftRevision | append-only revision fact                                    | `draft_revisions.workspace_id/project_id/environment/draft_id/revision/document/changed_by/created_at` |

All mutable revisions use `bigint` with:

```text
1 <= revision <= 9007199254740991
```

## Tables And Constraints

Tenant-core tables:

| Table                   | Tenant columns                            | Key constraints                                                                                                                                                                                      |
| ----------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app.workspaces`        | `id`                                      | UUIDv7 version+variant check; kind; revision safe-integer range; exact +1 revision trigger on update; unique slug; UTC timestamps.                                                                   |
| `app.workspace_members` | `workspace_id`, `actor_id`                | Composite PK; FK to workspace; actor UUIDv7 version+variant check.                                                                                                                                   |
| `app.projects`          | `workspace_id`                            | UUIDv7 ID; revision safe-integer range; exact +1 revision trigger on update; default region/environment; unique `(workspace_id, id)` and `(workspace_id, slug)`.                                     |
| `app.project_members`   | `workspace_id`, `project_id`, `actor_id`  | Composite FK to project and workspace member.                                                                                                                                                        |
| `app.data_sources`      | `workspace_id`, `project_id`, environment | Composite project FK; sensitivity/rights/version strategy; unique same-tenant slug; revision exact +1 trigger on update.                                                                             |
| `app.data_versions`     | `workspace_id`, `project_id`, environment | Composite FK to matching tenant/environment data source; exact +1 revision trigger on update; immutable provenance/digest/completion facts; terminal rows immutable; status/stage consistency check. |
| `app.drafts`            | `workspace_id`, `project_id`, environment | Composite project FK; current step; immutable creation source; revision exact +1 trigger; PRD draft state machine trigger; submitted draft lock; deferred matching DraftRevision trigger.            |
| `app.draft_revisions`   | `workspace_id`, `project_id`, environment | Append-only revision facts; unique `(workspace_id, project_id, environment, draft_id, revision)`; current-draft equality; previous-revision requirement; document/changed_by matching.               |

All tenant tables enable and force row-level security. Policies require table `workspace_id` or workspace root `id` to equal `app.current_workspace_id()` and require `app.current_actor_id() IS NOT NULL`.

Environment enum values:

```text
development
test
production
```

### New And Updated Constraints / Triggers

- `app.require_revision_increment()` is attached to `workspaces`, `projects`, `data_sources`, `data_versions`, and `drafts`; every update must set `NEW.revision = OLD.revision + 1`.
- `app.protect_data_version_update()` rejects mutable changes to identity/provenance, written `content_digest`, written `completed_at`, explicit client `updated_at`, illegal Upload state transitions, and any business update to terminal DataVersion rows.
- `app.data_versions` status/stage CHECK freezes:
  - `created`, `uploading`, `uploaded`: `processing_stage = upload`, `completed_at IS NULL`.
  - `processing`: `processing_stage <> completed`, `completed_at IS NULL`.
  - `completed`, `partial`: `processing_stage = completed`, `content_digest IS NOT NULL`, `completed_at IS NOT NULL`.
  - `failed`, `cancelled`, `expired`: terminal failure/abort/expiry facts with `completed_at IS NULL` and `processing_stage <> completed`; digest remains optional and does not mark success.
- `app.protect_draft_update()` enforces `editing -> validating -> ready -> building -> built -> submitted`, permits same-state autosave only with revision +1 before submission, unconditionally rejects every UPDATE once `OLD.state = submitted`, and makes creation source fields immutable before submission.
- `app.protect_draft_revision_row()` makes DraftRevision append-only, requires `NEW.revision` to equal the current Draft revision, requires revision - 1 for revisions above 1, and requires document/changed_by to match the Draft.
- `app.require_matching_draft_revision()` is attached as a `DEFERRABLE INITIALLY DEFERRED` constraint trigger on `app.drafts`; transaction commit fails unless the current Draft row has a matching DraftRevision row.

## Indexes

Indexes added for primary ownership and state/status queries:

- `idx_workspace_members_workspace_role`
- `idx_projects_workspace_status`
- `idx_project_members_project_actor`
- `idx_data_sources_owner_state`
- `idx_data_sources_owner_slug`
- `idx_data_versions_owner_status`
- `idx_data_versions_source_status`
- `idx_drafts_owner_state`
- `idx_draft_revisions_scope_revision`

The integration test runs `EXPLAIN` probes with sequential scans disabled and confirms key queries use:

- `idx_projects_workspace_status`
- `idx_data_versions_owner_status`
- `idx_drafts_owner_state`
- `idx_draft_revisions_scope_revision`

## Fixture Entry

Fixture:

```text
packages/database/fixtures/tenant-core.sql
```

The fixture creates two workspaces with same-name resources:

- Workspace A: `018f0000-0000-7000-8000-000000000001`
- Workspace B: `018f0000-0000-7000-8000-000000000002`
- Both contain Project slug `knowledge-base`.
- Both contain DataSource slug `support-docs`.
- Both contain Draft title `Default Draft`.
- Workspace A also contains a `test` environment DataSource to verify cross-environment DataVersion FK rejection.

All fixture IDs are synthetic UUIDv7-shaped values. No production Secret or real tenant data is present.

## Integration Coverage

`pnpm --filter @modular-mcp/database test:integration` performs:

1. Create a temporary database.
2. Apply `0001_tenant_core.up.sql` to an empty database.
3. Run migrate again and verify it skips already-applied `0001`.
4. Roll back the latest applied migration.
5. Apply `0001_tenant_core.up.sql` again.
6. Create a temporary non-superuser, non-`BYPASSRLS` runtime role and grant table access.
7. Load the two-workspace fixture.
8. Run RLS checks under `SET ROLE <runtime>` with transaction-local `app.workspace_id` and `app.actor_id`.
9. Drop the temporary database and runtime role.

Covered negative cases:

- Workspace A cannot read Workspace B by guessed project ID.
- Workspace A cannot update Workspace B by guessed project ID.
- Workspace A cannot delete Workspace B by guessed project ID.
- Workspace A cannot insert rows carrying Workspace B scope.
- Workspace-only, actor-only, and no-context transactions read zero rows from every tenant table and cannot write.
- `SET LOCAL` tenant context does not leak to the next transaction.
- Cross-tenant and cross-environment DataVersion/DataSource FKs are rejected.
- Revision `0`, negative, unchanged, jump, rollback, and `MAX_SAFE_INTEGER + 1` are rejected where applicable; `MAX_SAFE_INTEGER` can be stored.
- Workspace, Project, DataSource, DataVersion, and Draft updates require exact revision +1.
- DataVersion completed/partial rows require completed stage, digest, and completion time; created/uploading/uploaded rows are upload-stage only and cannot set completion time.
- Failed/cancelled/expired DataVersions are frozen as terminal non-success facts: no `completed_at`, no `completed` stage, optional digest only.
- DataVersion identity/provenance fields, written digest, written completed_at, terminal business fields, and explicit client `updated_at` changes are rejected.
- DataVersion legal `created -> uploading` with revision `1 -> 2` succeeds; the same legal state transition without revision increment fails.
- Draft autosave with same state and exact revision +1 succeeds only when a matching DraftRevision is written in the same transaction.
- Draft state transitions are limited to `editing -> validating -> ready -> building -> built -> submitted`; skipped edges and submitted rollback are rejected.
- Submitted Drafts reject any UPDATE based on `OLD.state = submitted`, including revision-only updates, `updated_by` changes, no-op-looking updates, and attempts that also insert a matching DraftRevision in the same transaction.
- Failed submitted-Draft attack transactions leave the Draft at `state=submitted`, `revision=6`, original `updated_by`, and leave no DraftRevision 7 row.
- Draft `updated_by` must be a valid project member in the same workspace/project scope.
- DraftRevision inserts cannot get ahead of Draft revision, skip a previous revision, mismatch document/changed_by, update/delete existing rows, or duplicate the same scope/draft/revision.
- UUIDv7 checks reject non-version-7 UUIDs, version-7 UUIDs with invalid RFC variant, and non-UUID input.
- Non-UTC session timestamp inserts/updates under `SET LOCAL TIME ZONE 'Asia/Shanghai'` remain close to `clock_timestamp()` and do not show an 8-hour offset.

Third-round reproduction probes:

| Probe                                                                              | Before remediation                                                                            | After remediation                                                                                                                                    |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| DataVersion revision direct jump to `999`                                          | Could bypass missing DataVersion revision trigger.                                            | `PASS completed data version revision jump to 999 is rejected`.                                                                                      |
| Completed DataVersion modifies `completed_at`                                      | Terminal completion timestamp was not separately frozen.                                      | `PASS completed data version completed_at change is rejected`.                                                                                       |
| Contradictory `status=created`, `processing_stage=completed`, completion timestamp | Status/stage relationship was incomplete.                                                     | `PASS created data version cannot use completed processing stage` and `PASS created data version cannot set completed_at`.                           |
| Workspace/Project revision jump to `99`                                            | Missing Workspace/Project revision triggers.                                                  | `PASS workspace revision jump to 99 is rejected`; `PASS project revision jump to 99 is rejected`.                                                    |
| Submitted Draft rolls back to `editing`                                            | Draft submitted terminal semantics only locked document/current_step.                         | `PASS submitted draft cannot transition back to editing`.                                                                                            |
| Draft revision 1 with DraftRevision revision 2                                     | DraftRevision only checked previous revision and did not require equality with current Draft. | `PASS draft revision cannot get ahead of draft`.                                                                                                     |
| Submitted Draft revision-only update plus matching DraftRevision 7                 | Field-list terminal protection could miss revision-only writes.                               | `PASS submitted draft revision-only update with matching revision is rejected`; rollback check confirms no DraftRevision 7.                          |
| Submitted Draft `updated_by` change plus matching DraftRevision 7                  | Field-list terminal protection could miss actor-only mutation with matching history.          | `PASS submitted draft updated_by update with matching revision is rejected`; rollback check confirms Draft remains revision 6 with original updater. |

## ID Mapping

The database stores internal primary keys as UUIDv7. API and Domain expose typed opaque IDs such as `ws_...`, `prj_...`, `usr_...`, `ds_...`, `dv_...`, and `drf_...`.

Frozen mapping rule for WP-02D repositories:

- Format: `<resource-prefix>_<canonical-lowercase-hyphenated-uuid>`.
- Hyphens are preserved.
- UUID text is normalized to lowercase.
- Encoded lengths are exact:
  - `ws_` + UUID = 39 characters.
  - `prj_` + UUID = 40 characters.
  - `usr_` + UUID = 40 characters.
  - `ds_` + UUID = 39 characters.
  - `dv_` + UUID = 39 characters.
  - `drf_` + UUID = 40 characters.
- Decoding validates the expected fixed prefix first, then validates UUIDv7 version nibble and RFC variant nibble.
- A wrong prefix cannot decode as another resource type.
- `encode(decode(id))` must equal the normalized original ID.

Package export:

```ts
export const opaqueIdPrefixes = {
  workspace: "ws",
  project: "prj",
  actor: "usr",
  dataSource: "ds",
  dataVersion: "dv",
  draft: "drf",
};

export const opaqueIdUuidV7Format =
  "<resource-prefix>_<canonical-lowercase-hyphenated-uuid>";

export const opaqueIdUuidV7TestVectors = {
  workspace: "ws_018f0000-0000-7000-8000-000000000001",
  project: "prj_018f0000-0000-7000-8000-000000000201",
  dataSource: "ds_018f0000-0000-7000-8000-000000000301",
};
```

## Validation Commands

| Command                                                                                                                        | Result | Evidence                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git status --short`                                                                                                           | PASS   | Confirmed WP-02B files are modified/untracked and `0001` is still uncommitted, so direct migration correction is allowed.                                                                                       |
| `./scripts/check-work-package-ready.sh WP-02B`                                                                                 | PASS   | Reported dependency `WP-02A` PASS and `READY WP-02B`.                                                                                                                                                           |
| `pg_isready -h 127.0.0.1 -p 15432 -U mcp_dev -d mcp_control`                                                                   | INFO   | Initially reported no response before local Postgres was started.                                                                                                                                               |
| `docker compose --env-file .env.example -f infra/compose/compose.yaml -p modular-mcp up -d --wait --wait-timeout 120 postgres` | PASS   | Local Postgres container started and became healthy.                                                                                                                                                            |
| `pnpm --filter @modular-mcp/database test:integration`                                                                         | PASS   | Empty migrate, second migrate skip, rollback, re-migrate, two-tenant RLS negatives, missing-context fail-closed checks, UUIDv7/UTC/revision/DataVersion/Draft/DraftRevision negatives, and index probes passed. |
| `pnpm --filter @modular-mcp/database build`                                                                                    | PASS   | TypeScript package build passed.                                                                                                                                                                                |
| `pnpm verify:affected`                                                                                                         | PASS   | Format, lint, typecheck, unit, contract, build, dependency scan, and secret scan passed.                                                                                                                        |
| `pnpm verify`                                                                                                                  | PASS   | Full verification passed through `pnpm verify:affected`.                                                                                                                                                        |
| `git diff --check`                                                                                                             | PASS   | No whitespace errors.                                                                                                                                                                                           |
| `docker compose --env-file .env.example -f infra/compose/compose.yaml -p modular-mcp stop postgres`                            | PASS   | Stopped the local Postgres container started for verification; no volume deletion or reset was performed.                                                                                                       |

Notes:

- First Docker attempt was blocked by sandbox Docker-socket permissions; the same command passed with approved escalation.
- Previous round: first database integration attempt was blocked by sandbox localhost TCP permissions; the same command passed with approved escalation.
- Third round: the first database integration attempt reached localhost after escalation but failed because Postgres was not running; the local Postgres compose service was started and the final integration run passed.
- Previous round: an intermediate EXPLAIN probe revealed `idx_data_versions_source_status` could compete with the owner/status index on the tiny fixture; the source index column order was adjusted so owner/status queries use `idx_data_versions_owner_status`.
- Third round: integration output included `skipped 0001_tenant_core (already applied)`, `rolled back 0001_tenant_core`, and final `database integration test passed`.

## Acceptance Criteria Check

- [x] Workspace, Project, member, DataSource, DataVersion, and Draft tenant-core tables exist.
- [x] DraftRevision append-only table exists.
- [x] Business tables use UUIDv7 version + RFC variant checks and UTC-safe `timestamptz` `CURRENT_TIMESTAMP` defaults.
- [x] Tenant tables include `workspace_id`; project-scoped tables include `project_id` and `environment`.
- [x] Foreign keys include tenant columns and do not allow cross-tenant references.
- [x] RLS reads transaction-local `app.workspace_id` and `app.actor_id`; missing either context fails closed.
- [x] RLS is enabled and forced on all eight tenant-core tables.
- [x] Workspace, Project, DataSource, DataVersion, and Draft revision constraints reject zero, negative, unchanged, jump, rollback, and above-max values where applicable.
- [x] Workspace, Project, DataSource, DataVersion, and Draft updates require revision to increment by exactly one.
- [x] DataVersion immutable fields, digest immutability, completed_at immutability, terminal immutability, stage/status consistency, and Upload state transitions are enforced by triggers/constraints.
- [x] Submitted Drafts reject any subsequent UPDATE, including revision-only, `updated_by`, and no-op-looking statements; failed transactions do not leave DraftRevision rows behind.
- [x] Draft and DraftRevision rows must match at commit for scope, draft ID, revision, document, and changed_by.
- [x] Two Workspace same-name fixtures exist.
- [x] Cross-tenant query, update, delete, guessed-ID, and insert checks fail under runtime RLS.
- [x] Cross-environment DataVersion/DataSource FK checks fail.
- [x] Key ownership/status queries are covered by indexes and verified with `EXPLAIN`.
- [x] Empty database migrate, second migrate skip, rollback, and re-migrate passed.
- [x] `pnpm verify` passed.

## Global Constraint Check

- [x] Scope stayed inside `packages/database` plus this evidence file.
- [x] No HTTP API, handler, release/credential table, Domain code, Temporal workflow, OPA policy, Redis/OpenSearch adapter, Web code, or Worker runtime was added.
- [x] No production Secret, real tenant data, or external service write was added.
- [x] No RLS relaxation, shared business table without `workspace_id`, or cross-tenant FK shortcut was introduced.
- [x] No dependency upgrade or ORM framework was added.
- [x] No tests were skipped or weakened.

## Residual Risk

- `test:integration` requires a reachable local PostgreSQL instance compatible with WP-00B defaults and `psql`; CI still runs deterministic non-DB gates through `pnpm verify`.
- Later repository/transaction WPs must set `app.workspace_id` and `app.actor_id` with `SET LOCAL` in every transaction and continue passing explicit tenant scope parameters.
- Project membership authorization is not implemented in WP-02B repository methods because repositories are explicitly deferred; RLS currently enforces workspace isolation, with application/repository methods responsible for role/capability checks in later WPs.

# 

## Human Gate

- Gate: `data`
- Status: `PASS`
- Review conclusion: Tenant schema, RLS isolation, foreign keys, revision invariants, immutable terminal states, index coverage, fixtures, and migration lifecycle have passed data review.

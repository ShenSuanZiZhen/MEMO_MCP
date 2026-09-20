---
work_package: WP-02E
status: PASS
completed_at: 2026-09-18T08:00:25Z
gate: data
depends_on:
  - WP-02D
---

# WP-02E Evidence

## Scope Delivered

Implemented the member-role data contract and PostgreSQL repository support required by WP-03B without rewriting the already-merged `0001` through `0003` migrations.

Delivered:

- Added formal work package `WP-02E 成员角色数据契约与 Repository` with `gate: data` and dependency on `WP-02D`.
- Split member-role enum alignment into expand/migrate/contract migrations:
  - `0004_member_role_alignment`: expands `app.member_role` to accept legacy and new role values.
  - `0005_member_role_data_migration`: migrates `developer -> editor` and `viewer -> observer` in `workspace_members` and `project_members`.
  - `0006_member_role_contract`: contracts `app.member_role` to exactly `owner/admin/editor/publisher/reviewer/observer/operator`.
  - `0007_member_role_repository`: adds membership revisions, append-only audit, and the database role-change function.
- Added `revision bigint NOT NULL DEFAULT 1` to `workspace_members` and `project_members`, constrained to `1..9007199254740991`.
- Added insert triggers requiring `workspace_members.revision` and `project_members.revision` to be exactly `1` on insert; the default is no longer the only guard.
- Added triggers requiring every role/status update to increment revision by exactly one and preventing revision-only changes.
- Split Workspace/Project member update protection so Project membership identity includes immutable `workspace_id`, `project_id`, `actor_id`, and `created_at`; Workspace membership identity remains immutable `workspace_id`, `actor_id`, and `created_at`.
- Added `app.member_role_audit_events` as an append-only audit model for Workspace and Project member-role changes.
- Enabled and forced RLS for member-role audit rows; runtime roles cannot directly insert/update/delete audit rows.
- Added deferred role-change/audit consistency constraints so each committed role change must have exactly one matching audit fact, and each audit fact must correspond to a role change in the same transaction.
- Kept Project member roles project-wide. The member-change scope is `workspace` or `project` and does not carry `environment`.
- Implemented `createPostgresMemberRoleChangeRepository()` and the database function `app.change_member_role_and_record_audit()`.

No production secret, real tenant data, external write operation, cloud SDK, dependency upgrade, or rewrite of `0001` through `0003` was introduced.

Because this work package declares `gate: data`, evidence remains `IMPLEMENTED_AWAITING_REVIEW` until data review signs off.

## Changed Files

- `work-packages/manifest.json`
- `work-packages/WP-02E.md`
- `work-packages/WP-03B.md`
- `packages/database/migrations/0004_member_role_alignment.up.sql`
- `packages/database/migrations/0004_member_role_alignment.down.sql`
- `packages/database/migrations/0005_member_role_data_migration.up.sql`
- `packages/database/migrations/0005_member_role_data_migration.down.sql`
- `packages/database/migrations/0006_member_role_contract.up.sql`
- `packages/database/migrations/0006_member_role_contract.down.sql`
- `packages/database/migrations/0007_member_role_repository.up.sql`
- `packages/database/migrations/0007_member_role_repository.down.sql`
- `packages/database/fixtures/tenant-core.sql`
- `packages/database/scripts/integration-test.mjs`
- `packages/database/scripts/verify-public-api.mjs`
- `packages/database/scripts/verify-tenant-core.mjs`
- `packages/database/src/index.ts`
- `docs/work-package-evidence/WP-02E.md`

## Data Contract

Final persistent member roles:

```text
owner
admin
editor
publisher
reviewer
observer
operator
```

Migration mapping:

```text
developer -> editor
viewer    -> observer
```

Rollback constraints:

- `0006` down restores the expanded enum while preserving data.
- `0005` down refuses if `publisher`, `reviewer`, or `operator` rows exist, so semantics are not silently degraded.
- `0004` down refuses if any new-role rows remain.

The integration lifecycle covers migrate, repeat migrate, rollback latest, and re-migrate. A failed contract migration leaves the expanded enum and data intact.

## Repository Contract

`createPostgresMemberRoleChangeRepository()` decodes `usr_`, `ws_`, and `prj_` opaque IDs before calling PostgreSQL. It rejects malformed inputs as `not_found_or_forbidden`.

The database function is the only runtime role-change write path. Runtime receives SELECT on application tables and scoped DML needed by integration tests, but does not receive direct DML on `app.member_role_audit_events`. The controlled function has `EXECUTE` granted to runtime, has PUBLIC execute revoked, uses a fixed `search_path`, and continues to verify `app.current_workspace_id()` and `app.current_actor_id()` before doing any write.

The database function runs inside one transaction with RLS context set by the adapter. It:

1. Locks the Workspace parent row for Workspace changes or the Project parent row for Project changes.
2. Locks active caller membership and target membership rows with `FOR UPDATE`.
3. Reads `previousRole` from the locked target row.
4. Verifies `p_actor_id`, the RLS actor setting, and the authorization snapshot actor all agree.
5. Validates caller authority from database facts, not only from the application snapshot:
   - Workspace scope: active owner/admin can manage non-owner roles; managing an existing owner or granting owner requires active owner and `manageExistingOwner IS TRUE`.
   - Project scope: caller must have active owner/admin at both Workspace and Project scope; owner changes require owner at both levels and `manageExistingOwner IS TRUE`.
6. Treats `manageExistingOwner = false` and `NULL` as not authorized for owner management.
7. Enforces the last-owner invariant inside the same lock window.
8. Updates role and increments membership revision exactly once.
9. Inserts exactly one audit event in the same transaction.
10. Returns the real database revision.

If audit insertion fails, the role and revision roll back. If role update fails, no audit row is written.

Audit rows include actor, target actor, scope, previous role, next role, membership revision, and occurred-at timestamp. Workspace audit rows have `project_id IS NULL`; Project audit rows carry the concrete Project ID.

## Role Audit Consistency

Database invariants added in `0007_member_role_repository`:

- WorkspaceMember initial revision is fixed at `1`; ProjectMember initial revision is fixed at `1`.
- ProjectMember `project_id` is an immutable identity field. Attempts to move a membership row to another Project are rejected whether or not the caller also increments revision.
- `workspace_member_role_change_requires_audit` and `project_member_role_change_requires_audit` are deferred constraint triggers. On commit, any `role` change must have exactly one matching audit row for scope, workspace, project shape, target actor, previous role, next role, and new membership revision.
- `member_role_audit_insert_matches_membership` is a deferred constraint trigger. It verifies audit rows are written by the controlled function, actor matches current context, current membership role/revision match the audit, and the same transaction recorded the exact role-change requirement.
- Transaction-local role-change requirements are represented by deterministic local settings generated from scope, workspace, project, target actor, previous role, next role, and revision.
- Unique audit facts are enforced by partial unique indexes:
  - Workspace: `(workspace_id, target_actor_id, membership_revision)` where `scope = 'workspace'`.
  - Project: `(workspace_id, project_id, target_actor_id, membership_revision)` where `scope = 'project'`.
- Status-only updates do not create role audit facts. They remain revision-guarded membership changes but are not represented as role-change audit events in this WP.

## Repository Return Validation

`createPostgresMemberRoleChangeRepository()` now validates the database function result before `COMMIT`:

- exactly one row is required;
- `kind` must be `changed`, `not_found_or_forbidden`, or `last_owner_conflict`;
- `changed` requires valid previous/next `MemberRbacRole`, requested `nextRole`, and a safe positive revision;
- denied/conflict rows must not carry role or revision data;
- malformed rows, unknown kinds, empty/multiple rows, invalid roles, and unsafe revisions roll back before commit;
- `COMMIT` failure attempts rollback;
- rollback/release cleanup failures do not mask the primary query/validation error.

## Validation

Commands executed during this remediation:

| Command                                                | Result    |
| ------------------------------------------------------ | --------- |
| `./scripts/check-work-package-ready.sh WP-02E`         | succeeded |
| `pnpm --filter @modular-mcp/database test:integration` | succeeded |
| `pnpm --filter @modular-mcp/database build`            | succeeded |
| `pnpm verify:affected`                                 | succeeded |
| `pnpm verify`                                          | succeeded |
| `pnpm dependency:scan`                                 | succeeded |
| `pnpm secret:scan`                                     | succeeded |
| `git diff --check`                                     | succeeded |

Data integration assertions include:

- `0001` through `0003` historical `developer/viewer` data migrates to `editor/observer`.
- Workspace and Project memberships can store all seven final roles.
- `developer` and `viewer` are rejected after contract.
- Migration lifecycle covers migrate, repeat migrate, rollback latest, and re-migrate.
- Down migration refuses when `publisher/reviewer/operator` rows exist.
- Failed enum contract does not leave a half-migrated schema.
- Concurrent demotion of two owners permits at most one success and leaves at least one owner.
- Admin attempts to modify existing owners are all rejected and produce no audit.
- Audit insert failure rolls back role and revision.
- Role update failure produces no audit.
- Cross-Workspace/Project guessed IDs return same-shape rejection and leave data unchanged.
- Workspace and Project changes each generate correct audit rows.
- Existing Workspace and Project members receive revision `1` when `0007` adds the column.
- Explicit WorkspaceMember/ProjectMember insert with `revision = 1` succeeds.
- Explicit WorkspaceMember/ProjectMember insert with `revision = 0`, `2`, or `99` is rejected with `member initial revision must be 1`.
- ProjectMember `project_id` update to another Project is rejected with `member identity fields are immutable` both with unchanged revision and with `revision + 1`.
- Failed ProjectMember `project_id` updates leave original `project_id`, role, status, and revision unchanged.
- ProjectMember `workspace_id`, `actor_id`, and `created_at` identity updates continue to be rejected.
- Legal ProjectMember status update still succeeds only with exact `revision + 1`.
- Revision jump, rollback, and unchanged role update attempts are rejected.
- Direct role update with correct revision but no audit is rejected at commit.
- Audit rows with wrong previous role, wrong next role, wrong membership revision, wrong project shape, duplicate membership revision, or no same-transaction role change are rejected.
- Runtime direct audit INSERT/UPDATE/DELETE is rejected by the minimal privilege model.
- Observer/editor/publisher/reviewer/operator cannot manage existing owners even when the snapshot claims `manageExistingOwner=true`.
- Workspace admin cannot modify existing owners; `manageExistingOwner=NULL` cannot manage owners.
- Inactive callers are rejected.
- Project role changes require sufficient Workspace and Project authority; Workspace admin + Project observer and Workspace observer + Project owner are both rejected.
- A valid owner can modify a non-last owner.

Public API probes include:

- malformed `changed` row: no commit, rollback;
- invalid previous/next role: no commit;
- invalid revision: no commit;
- multiple rows: no commit;
- empty rows: no commit;
- denied/conflict carrying role or revision data: no commit;
- commit failure: rollback attempted;
- query error plus release error: query error preserved;
- valid changed/denied/conflict: one commit and no rollback.

## Gate

- Gate: `data`
- Status: `PASS`
- Required next action: data review of enum lifecycle, membership revision invariants, audit model, RLS behavior, and PostgreSQL repository transaction semantics.

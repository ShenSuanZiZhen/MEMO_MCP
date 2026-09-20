---
work_package: WP-03B
status: PASS
completed_at: 2026-09-18T08:00:25Z
gate: security
depends_on:
  - WP-03A
  - WP-02E
---

# WP-03B Evidence

## Scope Delivered

Implemented control-plane Workspace/Project RBAC primitives, explicit endpoint capability enforcement, and member-role change authorization semantics. Database role-contract and PostgreSQL repository work has been split into `WP-02E 成员角色数据契约与 Repository`.

Delivered in WP-03B:

- `packages/authz` publishes the seven frozen `RbacRole` values: `owner`, `admin`, `editor`, `publisher`, `reviewer`, `observer`, and `operator`.
- `ActorRole` now equals `RbacRole`; legacy `maintainer`, `auditor`, and `system` memberships returned by the ordinary tenant resolver fail closed as `invalid_actor_membership`.
- `system` cannot enter ordinary `ActorContext` construction and therefore cannot implicitly obtain `workspace.manage`, publish, or pause capabilities.
- Control-plane authorization remains default-deny and returns the same `not_found_or_forbidden` result for missing scope, missing membership, and insufficient capability.
- Project authorization keeps the stricter overlay behavior: requested capability must be present in both the Workspace membership and the matching Project membership.
- `apps/control-api` requires explicit capability registration for endpoints and denies unknown or unmarked routes with the same 404 envelope.
- `changeMemberRole()` validates `targetActorId` and `nextRole` at runtime before calling the repository.
- `changeMemberRole()` uses an explicit role-grant policy and a single atomic repository port with an authorization snapshot.
- The role-grant decision carries `actorId`, scope, `nextRole`, and `manageExistingOwner`.
- Only an effective owner receives `manageExistingOwner: true`; admin cannot grant `owner` and cannot modify an existing owner.
- Defensive repository-result validation returns stable dependency failure when returned roles or revision are inconsistent.
- Tightened target-member privileges take effect only after the next authentication/resolver pass; no authorization cache was added.

No data-plane policy, arbitrary expression permissions, production secret, real tenant data, external write operation, OPA policy, Redis/OpenSearch adapter, cloud SDK, commit, or push was added.

Because this work package declares `gate: security`, evidence remains `IMPLEMENTED_AWAITING_REVIEW` until security review signs off. Since WP-03B now depends on WP-02E, security sign-off must wait for the WP-02E data gate.

## Changed Files

- `work-packages/WP-03B.md`
- `work-packages/manifest.json`
- `packages/authz/src/index.ts`
- `apps/control-api/src/index.ts`
- `tests/authz/rbac.test.ts`
- `tests/authz/oidc-actor-context.test.ts`
- `tests/control-api/rbac-middleware.test.ts`
- `docs/work-package-evidence/WP-03B.md`

WP-03B also depends on `docs/work-package-evidence/WP-02E.md` for the database role contract and real PostgreSQL repository evidence.

## Role Grant Policy

Grant policy is explicit and default-deny:

- Workspace owner may grant or revoke any role, including `owner`.
- Workspace admin may grant ordinary non-owner roles only when those roles do not exceed the caller's effective capabilities.
- Workspace admin may not grant `owner`.
- Workspace admin may not modify a target member whose locked current role is `owner`; the repository enforces this with the `manageExistingOwner` snapshot after locking the target row.
- Project owner/admin follow the same explicit policy under Project scope.
- Possessing `project.member.manage` alone is insufficient to grant arbitrary roles.
- `editor`, `publisher`, `reviewer`, `observer`, and `operator` cannot change member roles.
- Self-escalation is denied because the same role grant and effective-capability checks apply to the caller as a target.

The test matrix covers caller role by previous role by next role by Workspace/Project scope, including admin ordinary-member edits, admin owner edits, owner non-last-owner demotion, last-owner conflict, and equal-shape denial responses.

## Atomic Port

`changeMemberRole()` depends on the single port:

```ts
changeMemberRoleAndRecordAudit(input): Promise<
  | {
      kind: "changed";
      previousRole: RbacRole;
      nextRole: RbacRole;
      revision: number;
    }
  | { kind: "not_found_or_forbidden" }
  | { kind: "last_owner_conflict" }
>;
```

Concrete repositories must perform target membership locking, previous-role read, owner-management checks, last-owner checks, role update, revision increment, and audit insert in one database transaction. The real PostgreSQL implementation and data evidence live in WP-02E.

WP-03B maps all denied/missing/disallowed cases to the same response:

```json
{
  "status": 404,
  "body": {
    "error": {
      "code": "NOT_FOUND_OR_FORBIDDEN"
    }
  }
}
```

Unexpected repository exceptions map to:

```json
{
  "status": 503,
  "body": {
    "error": {
      "code": "DEPENDENCY_UNAVAILABLE",
      "category": "identity_dependency_unavailable"
    }
  }
}
```

Raw database errors, SQL, stack traces, subject, token, and object IDs are not placed in responses.

## WP-02E Linkage

The database role gap is no longer listed as residual risk in WP-03B. It is a formal data-gate package:

- Work package: `WP-02E 成员角色数据契约与 Repository`
- Evidence: `docs/work-package-evidence/WP-02E.md`
- Migration versions: `0004_member_role_alignment`, `0005_member_role_data_migration`, `0006_member_role_contract`, and `0007_member_role_repository`
- Final persistent roles: `owner/admin/editor/publisher/reviewer/observer/operator`

WP-03B must remain in `IMPLEMENTED_AWAITING_REVIEW` while WP-02E remains in data review.

## Validation

Commands executed during this remediation:

| Command                                         | Result    |
| ----------------------------------------------- | --------- |
| `pnpm vitest run tests/authz tests/control-api` | succeeded |
| `pnpm --filter @modular-mcp/authz build`        | succeeded |
| `pnpm --filter @modular-mcp/control-api build`  | succeeded |

Focused negative cases covered:

- `admin -> owner` is denied.
- Admin modifying existing `owner -> observer` is denied.
- Admin modifying existing `owner -> admin` is denied.
- Unknown role `superadmin` is denied before repository/audit calls.
- Invalid `targetActorId` is denied before repository/audit calls.
- Missing target member is same-shape 404.
- Audit failure rolls back in the atomic repository contract.
- Role write failure produces no audit in the atomic repository contract.
- A downgraded member's next re-authenticated write request is denied, while read-only observer capability remains allowed.
- Legacy `maintainer`, `auditor`, and `system` memberships are rejected as `invalid_actor_membership`.

## Acceptance Criteria Check

- [x] Permission matrix covers all seven RBAC roles.
- [x] Workspace/Project role overlay requires capability presence in both layers.
- [x] Endpoint capability registration is explicit.
- [x] Unknown or unmarked endpoints default deny.
- [x] Role changes use one atomic repository port.
- [x] Runtime validation rejects invalid target actor IDs and unknown roles before repository calls.
- [x] Explicit grant policy rejects admin owner grants, admin edits of existing owners, ordinary role edits, and self-escalation.
- [x] Repository changed results are defensively validated.
- [x] Tightened roles take effect on the target member's next authenticated request.
- [x] Legacy tenant membership roles fail closed.
- [x] Security review completed.
- [x] WP-02E data review completed.

## Gate

- Gate: `security`
- Status: `PASS`
- Required next action: security review after WP-02E data review approves the persistent role contract and real PostgreSQL repository.

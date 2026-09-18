---
work_package: WP-02D
status: PASS
completed_at: 2026-09-17T09:45:00Z
gate: data
depends_on:
  - WP-02C
---

# WP-02D Evidence

## Scope Delivered

Implemented the repository support base for tenant-scoped transactions,
idempotency, outbox storasge, publisher leasing, and consumer dedupe in
`packages/database`.

This WP does not implement concrete Definition, Candidate, Deployment,
Credential, or other domain aggregate repositories. The exported factory is
therefore named `createRepositorySupportAdapters()`. Concrete aggregate
repositories remain downstream work from the WP-02C "Repository Ports Still
Pending" list.

No HTTP handler, external broker, Redis fact source, Temporal workflow, OPA
policy, or runtime application use case was added.

## Changed Files

- `packages/database/package.json`
- `packages/database/migrations/0003_repository_outbox.up.sql`
- `packages/database/migrations/0003_repository_outbox.down.sql`
- `packages/database/src/index.ts`
- `packages/database/src/public-api-typecheck.ts`
- `packages/database/scripts/verify-public-api.mjs`
- `packages/database/scripts/verify-tenant-core.mjs`
- `docs/work-package-evidence/WP-02D.md`

Existing WP-02B/WP-02C uncommitted work was preserved and not reset.

## Migration Lifecycle

Migration head remains:

```ts
export const migrationHead = "0003_repository_outbox";
```

`pnpm --filter @modular-mcp/database test:integration` verified:

- empty database migrate: applied `0001_tenant_core`, `0002_release_ops`,
  `0003_repository_outbox`;
- repeated migrate: skipped all three already-applied migrations;
- rollback latest: rolled back `0003_repository_outbox`;
- re-migrate: skipped `0001`/`0002` and applied `0003_repository_outbox`.

## Idempotency

`app.idempotency_records` is protected by
`app.protect_idempotency_record_change()`:

- immutable after write: `workspace_id`, `project_id`, `environment`,
  `operation`, `idempotency_key`, `request_digest`, `created_at`;
- allowed state edge: `started -> completed`;
- `started` records always have `response_digest`, `resource_type`,
  `resource_id`, and `completed_at` set to null;
- `completed` is terminal;
- completion fields become immutable after completion:
  `response_digest`, `resource_type`, `resource_id`, `completed_at`;
- DELETE is always rejected;
- `resource_type` and `resource_id` must both be null or both non-null.
- INSERT is fail-closed: direct insert must start as `started` and may not
  provide completion fields.

Decision table:

| Case                                              | Result                                                            |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| first insert                                      | `{ kind: "acquired" }`                                            |
| same digest, existing `started` row lock acquired | `{ kind: "acquired" }`                                            |
| same digest, existing `completed`                 | `{ kind: "completed", responseDigest, resourceType, resourceId }` |
| same key with different request digest            | rejected                                                          |
| completed again with identical result             | succeeds without mutation                                         |
| completed again with different response/resource  | rejected                                                          |

The TypeScript public shape is:

```ts
type IdempotencyDecision =
  | { readonly kind: "acquired" }
  | {
      readonly kind: "completed";
      readonly responseDigest: string;
      readonly resourceType: string | null;
      readonly resourceId: string | null;
    };
```

## Outbox

`app.outbox_events` stores immutable logical event content plus controlled
publisher metadata. `logical_event_key` is derived from aggregate identity and
is not accepted as TypeScript repository input.

Immutable after insert:

- `id`
- `workspace_id`, `project_id`, `environment`
- `aggregate_type`, `aggregate_id`, `aggregate_revision`
- `event_type`
- `event_version`
- `logical_event_key`
- `payload`
- `idempotency_key`, `request_digest`
- `occurred_at`

Publisher metadata allowed before publish:

- `publish_attempts`
- `last_attempt_at`
- `claim_token`
- `claimed_by`
- `claim_expires_at`
- `available_at`
- `published_at`

Published events are immutable. DELETE is rejected before and after publish.

`event_version` is the event payload schema version. Aggregate concurrency uses
`aggregate_revision`; the two are intentionally separate.

Logical event key:

```text
<aggregate-type>:<aggregate-id>:<aggregate-revision>:<event-type>
```

The database enforces this with `outbox_logical_event_key_check` and an INSERT
trigger. Repository `append()` computes the same value inside its INSERT from
`aggregateType`, `aggregateId`, `aggregateRevision`, and `eventType`.

The uniqueness scope is:

```text
(workspace_id, project_id, environment, logical_event_key)
```

`idempotency_key` and `request_digest` must both be null or both set. Background
events without client idempotency still require deterministic
`logical_event_key`.

Outbox INSERT is fail-closed:

- `publish_attempts = 0`;
- `last_attempt_at IS NULL`;
- `claim_token IS NULL`;
- `claimed_by IS NULL`;
- `claim_expires_at IS NULL`;
- `published_at IS NULL`.

## Claim/Lease

Outbox claim functions now filter by complete project/environment scope:

- `workspace_id` from transaction RLS context;
- `project_id`;
- `environment`;
- `published_at IS NULL`;
- `available_at <= CURRENT_TIMESTAMP`;
- unclaimed or expired lease.

API:

- `claim(batchSize, publisherId, leaseSeconds)`
- `markPublished(eventId, claimToken)`
- `releaseOrRetry(eventId, claimToken, availableAt)`
- `consumeOnce(consumerName, eventId)`

Claim/ack table:

| Case                                     | Result                                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| unclaimed pending event                  | claimed with new `claim_token`, `publish_attempts + 1`, `claimed_by`, `claim_expires_at` |
| second publisher before lease expiry     | not claimed                                                                              |
| lease expired                            | can claim again, attempts increments and token changes                                   |
| stale token ack                          | rejected                                                                                 |
| current token ack                        | sets `published_at`                                                                      |
| repeated current-token ack after publish | idempotent, no timestamp/content rewrite                                                 |
| published event                          | not claimable                                                                            |

`consumeOnce()` uses `transaction.context.scope` in TypeScript and
`app.current_workspace_id()` in SQL. It does not trust event-provided
workspace/project/environment.

## Transaction Contract

The transaction API now distinguishes a provider from a pinned physical
connection:

```ts
interface TransactionConnectionProvider {
  connect(): Promise<PinnedTransactionConnection>;
}

interface PinnedTransactionConnection extends SqlExecutor {
  release(): void | Promise<void>;
}
```

`withTenantTransaction(provider, context, work)`:

- acquires one pinned client;
- runs `BEGIN`;
- sets transaction-local `app.workspace_id` and `app.actor_id`;
- executes callback SQL on the same client;
- runs `COMMIT` on success or `ROLLBACK` on failure;
- always releases the client;
- preserves callback errors over rollback/release cleanup errors.
- if `BEGIN` fails, no rollback is attempted but the pinned connection is still
  released.

Build-time public API probes verify success order, `BEGIN` failure release,
`set_config` failure rollback, callback failure rollback, `COMMIT` failure
rollback, rollback/release cleanup errors preserving the primary error,
post-success release failure reporting, missing scope rejection, and
compile-time failure when project/environment scope is omitted.

## Security Negative Probes

Integration test results for added probes:

| Probe                                                        | Result                                                                                               |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| direct completed idempotency insert                          | rejected: `idempotency records must start as started`                                                |
| direct started idempotency insert with resource              | rejected: `idempotency records must start as started`                                                |
| started idempotency resource prewrite update                 | rejected: `started idempotency completion fields are immutable`                                      |
| failed started prewrite rollback check                       | record remained `started` and `response_digest/resource_type/resource_id/completed_at` were all null |
| started idempotency legal completion after rejected prewrite | succeeds and stores response/resource/completed timestamp                                            |
| modify `idempotency_records.request_digest`                  | rejected: `idempotency identity is immutable`                                                        |
| modify idempotency operation/key/scope                       | rejected: `idempotency identity is immutable`                                                        |
| delete started idempotency record                            | rejected: `idempotency records are append-only`                                                      |
| delete completed idempotency record                          | rejected: `idempotency records are append-only`                                                      |
| completed with different response digest                     | rejected: `completed idempotency record result mismatch`                                             |
| completed with different resource                            | rejected: `completed idempotency record result mismatch`                                             |
| same completed result again                                  | succeeds, record unchanged                                                                           |
| forged outbox logical event key                              | rejected: `outbox logical event key must match aggregate identity`                                   |
| same logical outbox event repeated with changed key          | rejected: `outbox logical event key must match aggregate identity`                                   |
| direct pre-claimed outbox insert                             | rejected: `outbox events must start unclaimed and unpublished`                                       |
| direct pre-published outbox insert                           | rejected: `outbox events must start unclaimed and unpublished`                                       |
| update outbox payload                                        | rejected: `outbox event content is immutable`                                                        |
| update outbox aggregate/event/scope/request digest           | rejected: `outbox event content is immutable`                                                        |
| delete unpublished outbox event                              | rejected: `outbox events are append-only`                                                            |
| delete published outbox event                                | rejected: `outbox events are append-only`                                                            |
| update published outbox event                                | rejected: `published outbox event is immutable`                                                      |
| duplicate logical key with null idempotency                  | rejected by unique constraint                                                                        |
| duplicate logical key with different idempotency key         | rejected by unique constraint                                                                        |
| idempotency key without request digest                       | rejected: `outbox_idempotency_pair_check`                                                            |
| request digest without idempotency key                       | rejected: `outbox_idempotency_pair_check`                                                            |
| same workspace, different project claim                      | returns zero events                                                                                  |
| same workspace, different project markPublished              | rejected: `outbox event not found in current scope`                                                  |
| same workspace, different project consume                    | rejected: `outbox event not found in current scope`                                                  |
| same project, wrong environment claim                        | returns zero events                                                                                  |
| same project, wrong environment markPublished                | rejected: `outbox event not found in current scope`                                                  |

Concurrency probes:

- 25 concurrent same-key workers created one audit fact, one outbox event, and
  one completed idempotency row.
- Two concurrent publishers claimed a pending event only once.
- Lease expiry allowed a second claim with attempts `1 -> 2` and a new token.
- First stale token ack was rejected; current token ack succeeded.

## Validation Commands

| Command                                                | Result | Evidence                                                                                                                                                                            |
| ------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git status --short`                                   | PASS   | Existing uncommitted WP work observed and preserved.                                                                                                                                |
| `./scripts/check-work-package-ready.sh WP-02D`         | PASS   | Reported dependency `WP-02C` PASS and `READY WP-02D`.                                                                                                                               |
| `./scripts/infra.sh up postgres`                       | PASS   | Local Docker test dependencies started; no external service writes.                                                                                                                 |
| `pnpm --filter @modular-mcp/database test:integration` | PASS   | Empty migrate, repeated migrate skip, rollback `0003`, re-migrate, RLS, state matrix `187/37/150`, idempotency, outbox scope, claim/lease/token, and consumer dedupe probes passed. |
| `pnpm --filter @modular-mcp/database build`            | PASS   | `tsc --build` plus `scripts/verify-public-api.mjs` passed.                                                                                                                          |
| `pnpm verify:affected`                                 | PASS   | Local CI reproduction passed.                                                                                                                                                       |
| `pnpm verify`                                          | PASS   | Invoked `verify:affected`; local CI reproduction passed.                                                                                                                            |
| `pnpm dependency:scan`                                 | PASS   | Pinned dependency policy passed.                                                                                                                                                    |
| `pnpm secret:scan`                                     | PASS   | No unallowlisted secret patterns found.                                                                                                                                             |
| `pnpm ci:local`                                        | PASS   | Format, lint, typecheck, unit, contract, build, dependency scan, and secret scan passed.                                                                                            |
| `git diff --check`                                     | PASS   | No whitespace errors.                                                                                                                                                               |
| `git status --short`                                   | PASS   | Confirmed uncommitted work remains; no commit was created.                                                                                                                          |
| `git diff --stat`                                      | PASS   | Reviewed final tracked diff stat; untracked WP evidence/database files remain present.                                                                                              |

## Global Constraint Check

- [x] Scope stayed inside `packages/database`, database integration tests, and
  
      this evidence file.
- [x] No HTTP handler, external broker, Redis fact source, Temporal workflow,
  
      OPA policy, Web code, or Worker runtime was added.
- [x] `0001`/`0002` semantics were not changed.
- [x] Repository support methods use transaction context for scope.
- [x] RLS context is set transaction-locally.
- [x] Outbox facts, completion, and business writes are verified in the same
  
      transaction.
- [x] No production Secret, real tenant data, or external write was added.

## Human Gate

- Gate: `data`
- Status: `PASS`
- Reviewer: `Codex Data Gate Expert Review`
- Reviewed at: `2026-09-18T02:11:51Z`
- Review conclusion: Repository support schema、tenant-scoped transaction、
  idempotency retry/replay、deterministic outbox identity、publisher lease/token、
  consumer dedupe、RLS scope isolation 和集成测试充分性均通过评审；未发现阻断问题。

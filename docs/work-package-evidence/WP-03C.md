---
work_package: WP-03C
status: PASS
updated_at: 2026-09-20T05:00:21Z
gate: security
depends_on:
  - WP-03B
---

# WP-03C Evidence

## Scope Delivered

Implemented the sixth security-gate minimal remediation for high-impact step-up execution.

Delivered:

- `controlPlaneCapabilities` is runtime-frozen with `Object.freeze()`.
- `highImpactActionCapabilityMatrix` is exported and runtime-frozen.
- `capabilityForHighImpactAction()` reads only the frozen action matrix.
- All six current high-impact actions require Project scope with workspace ID, project ID, and environment.
- Workspace-only scope is rejected before verifier and repository calls.
- Verifier, authorizer, and repository dependency outputs are decoded from `unknown` at runtime and fail closed on malformed objects, getters, and proxies.
- Authorizer `allow: true` decisions must be exactly bound to the verified actor, Project scope, and expected capability.
- Repository input uses trusted actor/scope/capability values reconstructed after step-up validation, not raw authorizer-returned references.
- Repository `authorization` snapshot is reconstructed and frozen, including a frozen Project scope copy.
- Execution `now()` is total/fail-closed for thrown clocks and invalid dates.
- Concurrency coverage proves the same verified intent is consumed once.

No real MFA provider, IdP integration, authentication-factor storage, production secret, external write, commit, push, reset, checkout, clean, `packages/module-sdk`, WP-04C, database, or multipart-upload product change was made.

## Changed WP-03C Files

- `packages/authz/src/index.ts`
- `apps/control-api/src/index.ts`
- `tests/authz/rbac.test.ts`
- `tests/control-api/step-up-action.test.ts`
- `docs/work-package-evidence/WP-03C.md`

## Frozen Capability And Action Policy

Runtime-frozen public policy:

- `controlPlaneCapabilities`
- `highImpactActionCapabilityMatrix`

Action mapping:

| Action                   | Capability               | Scope policy | Role policy                           |
| ------------------------ | ------------------------ | ------------ | ------------------------------------- |
| `deployment.publish`     | `deployment.publish`     | Project only | owner/admin/publisher                 |
| `deployment.pause`       | `deployment.pause`       | Project only | owner/admin/publisher                 |
| `credential.revoke`      | `credential.revoke`      | Project only | owner-only pending human confirmation |
| `service_version.retire` | `service_version.retire` | Project only | owner-only pending human confirmation |
| `scope.expand.data`      | `scope.expand.data`      | Project only | owner-only pending human confirmation |
| `scope.expand.output`    | `scope.expand.output`    | Project only | owner-only pending human confirmation |

Tests prove the public capability tables are frozen, mutation attempts throw `TypeError`, and failed tampering does not allow publisher to revoke credentials, retire service versions, or expand scopes.

## Trusted Step-Up And Authorization Chain

Execution path:

1. Validate action, Project scope, target, reason, request ID, and opaque `stepUpToken`.
2. Reject workspace-only scope before verifier or repository calls.
3. Call `StepUpIntentVerifier.verifyStepUpIntentToken(stepUpToken)`.
4. Runtime-decode verifier output.
5. Revalidate actor/action/scope/target/revision/freshness binding.
6. Copy and freeze verified scope/target before repository use.
7. Reauthorize current `ActorContext`.
8. Runtime-decode authorizer output.
9. Require authorizer `allow: true` to match:
   - `decision.actorId === actorContext.actorId`;
   - `decision.actorId === verified claims.actorId`;
   - `decision.scope` exactly equals the verified Project scope;
   - `decision.capability === highImpactActionCapabilityMatrix[action]`;
   - capability is a known `ControlPlaneCapability`;
   - no extra fields exist on the decision or nested scope.
10. Reconstruct trusted actor ID, Project scope, required capability, and frozen authorization snapshot.
11. Call the atomic repository port.
12. Runtime-decode repository output.

Raw `stepUpToken`, authentication factors, verifier internals, claims objects, authorizer raw results, stacks, and raw dependency errors are not included in responses or audit records.

## Runtime Decoders

Verifier decoder requirements:

- result must be a non-null object and not an array;
- `kind` must be exactly `verified`, `invalid`, `expired`, or `dependency_unavailable`;
- non-verified results may only contain `kind`;
- `verified` results must contain only `kind` and non-null `claims`;
- claims must contain exactly `intentId`, `actorId`, `action`, `scope`, `target`, `authenticatedAt`, `issuedAt`, and `expiresAt`;
- nested scope and target structures are copied through total runtime decoders.

Authorizer decoder requirements:

- result must be a non-null object and not an array;
- `allow: false` may only contain `allow` and `reason`;
- `allow: true` may only contain `allow`, `actorId`, `scope`, and `capability`;
- scope must be an exact Project scope with no extra fields;
- capability must be known and then exactly equal to the expected high-impact action capability;
- malformed objects, extra fields, unknown capability, binding mismatches, and throwing getters/proxies map to `DEPENDENCY_UNAVAILABLE`.

Repository decoder requirements:

- result must be a non-null object and not an array;
- `kind` must be exactly `executed`, `authorization_changed`, `intent_expired`, `intent_replayed`, `not_found_or_forbidden`, or `target_revision_conflict`;
- non-executed results may only contain `kind`;
- only `executed` may carry `targetRevision`;
- `targetRevision` must be a safe integer and exactly `expectedRevision + 1`.

All decoder `Object.keys`, property reads, nested scope/target reads, and Proxy/getter interactions are exception-protected.

## Atomic Repository Contract

The port remains:

```ts
executeHighImpactActionAndRecordAudit(input): Promise<
  | { kind: "executed"; targetRevision: number }
  | { kind: "authorization_changed" }
  | { kind: "intent_expired" }
  | { kind: "intent_replayed" }
  | { kind: "not_found_or_forbidden" }
  | { kind: "target_revision_conflict" }
>;
```

Repository input carries verified intent ID, intent expiry, trusted actor ID, action, frozen verified Project scope including environment, frozen target, required capability, request ID, reason, occurred-at timestamp, and a frozen authorization snapshot.

Concrete repositories must complete the following in one atomic transaction:

1. Use the transaction clock to re-check intent expiry.
2. Re-read and verify current actor membership/capability.
3. Lock and check target plus expected revision.
4. Consume the unique intent ID once.
5. Execute the state change.
6. Insert immutable audit.
7. Roll back intent consumption, target change, and audit if any step fails.

This WP defines the port and transaction-test substitute only. It does not claim a concrete PostgreSQL implementation.

## Negative Coverage

Automated tests cover:

- hand-constructed `StepUpIntentClaims` cannot bypass token verification;
- malformed, unknown, forged, expired, and dependency-failed tokens;
- malformed verifier outputs including `undefined`, `null`, arrays, strings, unknown kind, missing claims, `claims: null`, missing action/scope/target/time, extra forged factor structure, nested scope/target getters, and nested scope Proxy failure;
- actor, action, workspace, project, environment, target kind, target ID, and target revision mismatch;
- workspace-only scope rejected before verifier/repository;
- cross-project and cross-environment intents rejected without repository side effects;
- transaction-time expiry;
- authorization revoked after initial check;
- action failure and audit failure do not consume intent, do not write audit, and allow a later valid retry;
- replayed intent rejected;
- target revision drift rejected;
- all six high-impact actions across role/capability matrix in Project scope;
- missing dual Workspace/Project capability rejected;
- unknown action, missing scope, wrong target kind, invalid target revision;
- malformed repository outputs including missing `kind`, unknown `kind`, no `targetRevision`, unchanged, skipped, fractional, negative, `Infinity`, `NaN`, and unsafe revisions;
- `now()` throw and invalid date;
- authorizer throw, malformed allow/deny results, extra fields, unknown capability, missing actor/scope/capability, wrong actor, wrong workspace, wrong project, wrong environment, workspace scope, wrong capability, nested sensitive scope field, and throwing actor/scope/capability/nested scope getters;
- explicit regression where a structurally valid authorizer allow result binds to the wrong actor, project, and capability but cannot execute;
- `credential.revoke` with authorizer returning `deployment.pause` or `project.read` cannot execute;
- concurrent execution: 20 requests using one verified intent produced exactly 1 success, 19 replay rejections, target revision incremented once, 1 audit, and 1 consumed intent;
- Repository cannot mutate frozen authorization actor ID, scope, or capability;
- raw `stepUpToken` is absent from audit JSON and repository input JSON.

## Validation Results

Commands executed for this remediation:

| Command                                         | Result                                                                                                                                       |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `./scripts/check-work-package-ready.sh WP-03C`  | succeeded: dependency `WP-03B` accepted and `READY WP-03C`                                                                                   |
| `pnpm vitest run tests/authz tests/control-api` | succeeded: 8 files, 84 tests                                                                                                                 |
| `pnpm --filter @modular-mcp/authz build`        | succeeded                                                                                                                                    |
| `pnpm --filter @modular-mcp/control-api build`  | succeeded                                                                                                                                    |
| `pnpm verify:affected`                          | succeeded on final rerun: format, lint, typecheck, unit tests 19 files / 261 tests, contract checks, build, dependency scan, and secret scan |
| `pnpm dependency:scan`                          | succeeded                                                                                                                                    |
| `pnpm secret:scan`                              | succeeded                                                                                                                                    |
| `git diff --check`                              | succeeded                                                                                                                                    |
| `git status --short`                            | dirty worktree includes WP-03C changes plus existing uncommitted work from other work packages; no commit or push was performed              |

## Gate

- Gate: `security`
- Status: `PASS`
- Security review passed. The step-up verifier boundary, exact actor/action/project-scope/target/revision binding, frozen authorization snapshot, fail-closed dependency decoders, action capability policy, replay protection, current-membership reauthorization, atomic intent/action/audit contract, and revision handling satisfy the WP-03C acceptance criteria. All required validation and security-negative tests passed.

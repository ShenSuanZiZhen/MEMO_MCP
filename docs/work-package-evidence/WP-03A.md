---
work_package: WP-03A
status: PASS
completed_at: 2026-09-18T02:35:07Z
gate: security
depends_on:
  - WP-02B
---

# WP-03A Evidence

## Scope Delivered

Implemented OIDC token verification, a development-only local IdP fixture, and an unforgeable ActorContext construction path.

Delivered:

- `packages/authz` OIDC verifier for RS256 JWTs, validating signature, `issuer`, `audience`, `env`, `exp`, `nbf`, and `sub`; second-round remediation makes the verifier total/fail-closed for malformed, oversized, unsupported-algorithm, unknown-kid, invalid clock-skew, and unsafe-time inputs.
- ActorContext construction now derives actor/workspace roles and capabilities only from a verified identity plus `ActorMembershipResolver`; token/header role and workspace claims are ignored.
- ActorContext is nominally branded with a non-exported `unique symbol`; `buildActorContext` is no longer public API, and `control-api` imports the single `ActorContext` type from `@modular-mcp/authz`.
- Membership resolver/authenticator exceptions are mapped to `identity_dependency_unavailable` without leaking original exception messages, stacks, tokens, subjects, or database details.
- Development IdP fixture with ephemeral RSA keys and signed dev tokens; enabling it outside `development`, configuring non-development token environments, or overriding registered/reserved JWT claims fails closed.
- Control API authentication middleware entry that accepts only `Authorization: Bearer ...`, returns stable `UNAUTHENTICATED` categories, catches authenticator exceptions, and logs only the auth failure category.
- Unit tests cover forged signatures, wrong issuer, wrong audience, missing/invalid subject, `alg=none`, wrong algorithm, unknown kid, expired token, not-yet-valid token, unsafe `exp`/`nbf`, oversized token, environment mismatch, role/workspace injection, resolver throw, valid ActorContext stability, missing membership, malformed auth header, dev-IdP environment failures, reserved claim override, and the compile-time ActorContext construction negative.

No OAuth MCP client, enterprise IdP connector, database repository implementation, production secret, real tenant data, external write operation, schema migration, Domain package change, or RLS change was added.

Because this work package declares `gate: security`, Codex leaves the evidence status as `IMPLEMENTED_AWAITING_REVIEW` until security review signs off.

## Changed Files

- `packages/authz/src/index.ts`
- `packages/authz/src/actor-context-typecheck.ts`
- `apps/control-api/package.json`
- `apps/control-api/src/index.ts`
- `apps/control-api/tsconfig.json`
- `pnpm-lock.yaml`
- `tests/authz/oidc-actor-context.test.ts`
- `tests/control-api/auth-middleware.test.ts`
- `docs/work-package-evidence/WP-03A.md`

## Middleware Entry

Control API auth middleware entry:

```ts
import { createControlApiAuthMiddleware } from "./apps/control-api/src/index.js";

const middleware = createControlApiAuthMiddleware(authenticator, logger);
const result = await middleware({ headers: { authorization: "Bearer <jwt>" } });
```

The middleware depends on this structural interface:

```ts
interface BearerTokenAuthenticator {
  authenticateBearerToken(token: string): Promise<ControlApiAuthResult>;
}
```

`packages/authz` provides the matching implementation through:

```ts
const authenticator = createOidcActorAuthenticator(
  oidcVerifierConfig,
  membershipResolver,
);
```

Only the `authorization` / `Authorization` header is read. Workspace, project, role, and capability headers are not trusted.

## ActorContext Schema

`packages/authz` exports the only `ActorContext` type, with schema version `authz.actor-context.v1` plus a non-exported unique-symbol brand:

```ts
interface ActorContext {
  readonly [privateActorContextBrand]: true;
  readonly schemaVersion: "authz.actor-context.v1";
  readonly actorId: string;
  readonly identity: {
    readonly issuer: string;
    readonly subject: string;
  };
  readonly environment: "development" | "test" | "production";
  readonly workspaces: readonly {
    readonly workspaceId: string;
    readonly roles: readonly ActorRole[];
    readonly capabilities: readonly string[];
  }[];
}
```

Construction rule:

1. Verify OIDC token signature and claims.
2. Resolve memberships by verified `{ issuer, subject, audience, environment }`.
3. Validate WP-02B-compatible opaque `usr_...` actor IDs and `ws_...` workspace IDs.
4. Sort/deduplicate roles, capabilities, and workspaces for deterministic output.
5. Freeze the returned context.

The stable RLS handoff fields remain opaque public IDs at the API/auth boundary:

- `ActorContext.actorId` is a public opaque `usr_...` actor ID.
- Each `ActorContext.workspaces[].workspaceId` is a public opaque `ws_...` workspace ID.
- Before setting PostgreSQL RLS session settings, downstream repository code must decode these opaque IDs with the WP-02B frozen mapping to internal UUIDv7 values.
- Do not pass the literal `usr_...` or `ws_...` strings to `app.actor_id` / `app.workspace_id`; PostgreSQL settings expect the internal UUIDv7 values used by the RLS policies.

## Dev Token Usage

Development-only local IdP fixture:

```ts
const devIdp = createDevelopmentIdentityProvider({
  enabled: true,
  runtimeEnvironment: "development",
  issuer: "http://127.0.0.1:8787/dev-idp",
  audience: "modular-mcp-control-api",
  environment: "development",
});

const token = devIdp.issueToken({ subject: "person@example.com" });
```

Verifier wiring:

```ts
const authenticator = createOidcActorAuthenticator(
  {
    issuer: devIdp.issuer,
    audience: devIdp.audience,
    environment: devIdp.environment,
    jwks: devIdp.jwks,
  },
  membershipResolver,
);
```

The fixture generates an ephemeral RSA keypair at process startup and exports only public JWKS. It stores no committed private key. `createDevelopmentIdentityProvider({ enabled: true, runtimeEnvironment: "production" })` throws before issuing tokens; any non-development runtime fails the same way. The fixture can only issue `environment: "development"` tokens and rejects `additionalClaims` that attempt to override registered JWT claims such as `iss`, `aud`, `sub`, `env`, `iat`, `nbf`, `exp`, or `jti`.

## Validation Commands

| Command                                         | Result | Evidence                                                                                                                 |
| ----------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| `git status --short`                            | PASS   | Baseline was clean before WP-03A edits; final changed files stayed within allowed authz/control-api/test/evidence scope. |
| `./scripts/check-work-package-ready.sh WP-03A`  | PASS   | Reported dependency `WP-02B` PASS and `READY WP-03A`.                                                                    |
| `pnpm vitest run tests/authz tests/control-api` | PASS   | 24 focused auth tests passed.                                                                                            |
| `pnpm --filter @modular-mcp/authz build`        | PASS   | Strict TypeScript build passed for authz.                                                                                |
| `pnpm --filter @modular-mcp/control-api build`  | PASS   | Strict TypeScript build passed for control-api.                                                                          |
| `pnpm verify:affected`                          | PASS   | Format, lint, typecheck, unit tests, contract checks, build, dependency scan, and secret scan passed.                    |
| `pnpm dependency:scan`                          | PASS   | Workspace dependency from control-api to authz and lockfile metadata comply with pinned/workspace dependency policy.     |
| `pnpm secret:scan`                              | PASS   | No unallowlisted secret patterns found.                                                                                  |
| `git diff --check`                              | PASS   | No whitespace errors.                                                                                                    |

## Acceptance Criteria Check

- [x] Signature, issuer, audience, expiration, not-before, subject, and environment are validated.
- [x] Forged signature, wrong audience, expired token, not-yet-valid token, and environment mismatch are rejected.
- [x] Wrong issuer, missing/invalid subject, `alg=none`, wrong algorithm, unknown kid, oversized token, and unsafe `exp`/`nbf` are rejected without throwing.
- [x] Invalid clock skew fails closed.
- [x] ActorContext is constructed only from verified identity and membership lookup.
- [x] ActorContext has a private nominal brand; manual construction is covered by compile-time negative testing.
- [x] Membership resolver/authenticator exceptions map to `identity_dependency_unavailable`.
- [x] Role/workspace injection through token claims or request headers does not affect ActorContext.
- [x] Valid token produces stable deterministic ActorContext.
- [x] Development IdP is local-only, can only issue development tokens, and rejects protected registered claim overrides.
- [x] Logs and middleware errors expose only actorId-eligible context or auth error category; no token, subject, header role, or workspace header is logged.
- [x] `pnpm verify:affected` passed.
- [x] Security gate review completed.

## Global Constraint Check

- [x] Scope stayed inside `packages/authz`, `apps/control-api`, tests, and this evidence file.
- [x] No production Secret, real tenant data, external write operation, or enterprise IdP call was added.
- [x] No client-provided workspace/project/role is trusted.
- [x] No database schema, RLS policy, Definition canonicalization, Domain package, Temporal, OPA, Redis, OpenSearch, or cloud SDK change was made.
- [x] No third-party dependency was added or upgraded; `control-api` now has a workspace dependency on `@modular-mcp/authz` to reuse the branded ActorContext type.
- [x] No tests were skipped, weakened, or mocked around the core auth rules.

## Residual Risk

- The IdP integration is intentionally local/fixture-only; a real enterprise OIDC discovery/JWKS refresh adapter remains out of scope.
- Membership resolution is represented by an interface for downstream repository/application wiring; WP-03A does not implement database membership queries.
- Control API middleware is framework-agnostic because the current `control-api` app has no HTTP server framework yet.

## Human Gate

- Gate: `security`
- Status: PASS
- Required next action: security review signs off token validation, ActorContext construction, dev IdP fail-closed behavior, and logging behavior before evidence status changes.

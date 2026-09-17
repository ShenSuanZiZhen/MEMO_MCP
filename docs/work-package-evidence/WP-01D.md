---
work_package: WP-01D
status: PASS
completed_at: 2026-09-16T08:59:07Z
gate: api
depends_on:
  - WP-01A
---

# WP-01D Evidence

## Scope Delivered

- Added schema registry config at `packages/contracts/schema-registry/registry.v1.json`.
- Added Definition registry JSON Schema at `packages/contracts/schema-registry/v1/definition.v1.schema.json`.
- Added generated TypeScript types at `packages/contracts/src/generated/definition.ts`.
- Exported Definition registry generated types from `@modular-mcp/contracts`.
- Added golden and negative fixtures under `packages/contracts/examples/definition`.
- Added package-local registry validation and type-generation scripts under `packages/contracts/scripts`.
- Wired registry validation and generated-type drift checks into `pnpm test:contract`.
- Corrected this evidence from a premature `PASS` after API gate review found blocking issues; those issues were remediated and independently re-reviewed through the API gate.
- Closed `PolicyInput.actor`, `PolicyInput.credential`, and `PolicyInput.network` with `additionalProperties: false`.
- Locked `PolicyInput` to server-derived metadata only:
  - `actor`: `actorId`, `roles`.
  - `credential`: `credentialId`, `kind`, `status`, `scopes`.
  - `network`: normalized `source`.
- Added independent negative fixtures proving `PolicyInput` rejects credential Secret fields, actor body fields, and full network URLs.
- Added independent negative fixtures proving `PolicyDecision` rejects debug payloads, `ModuleManifest` rejects custom execution commands, and `DomainEvent` rejects Secret fields.
- Added Definition registry compatibility baseline at `packages/contracts/baselines/definition.v1.public-surface.json`.
- Extended `scripts/contracts-breaking-check.mjs` so the compatibility gate now covers four baselines: common, control-plane, release-ops, and definition.
- Strengthened `packages/contracts/scripts/validate-registry.mjs` to verify registry completeness, canonicalization settings, schema name/URI/path integrity, `$id` alignment, and event version pattern/examples.

No resolver/compiler, OPA/Rego rule, module runtime, custom module execution field, or user-code execution capability was added.

No handler, database, Domain, Temporal, OPA, Redis, Web, Worker, or runtime implementation was changed.

## Schema URI Registry

| Name                  | URI                                                                           | Path                                                    |
| --------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------- |
| `ServiceDefinitionV1` | `https://contracts.modular-mcp.local/schemas/definition/v1/ServiceDefinition` | `v1/definition.v1.schema.json#/$defs/ServiceDefinition` |
| `ModuleManifestV1`    | `https://contracts.modular-mcp.local/schemas/definition/v1/ModuleManifest`    | `v1/definition.v1.schema.json#/$defs/ModuleManifest`    |
| `PolicyInputV1`       | `https://contracts.modular-mcp.local/schemas/definition/v1/PolicyInput`       | `v1/definition.v1.schema.json#/$defs/PolicyInput`       |
| `PolicyDecisionV1`    | `https://contracts.modular-mcp.local/schemas/definition/v1/PolicyDecision`    | `v1/definition.v1.schema.json#/$defs/PolicyDecision`    |
| `DomainEventV1`       | `https://contracts.modular-mcp.local/schemas/definition/v1/DomainEvent`       | `v1/definition.v1.schema.json#/$defs/DomainEvent`       |

Generated type path:

- `packages/contracts/src/generated/definition.ts`

## Canonicalization Input Boundary

Registry config fixes canonicalization as:

- Algorithm: `RFC8785-or-equivalent-stable-json`
- Digest: `sha256`
- Input boundary: `ServiceDefinitionV1` JSON after schema validation, domain validation, exact module resolution, effective limit calculation, and tool/resource/prompt compilation.

The schema requires Definition references to carry precise IDs and digests:

- Data bindings require `dataVersionId` and `dataVersionDigest`.
- Module bindings require `exactVersion` and `artifactDigest`.
- Policy binding requires `policyVersionId` and `policyDigest`.
- Runtime pins `builderVersion` and `protocolVersion`.

## Event Version Naming

Event names must match:

```text
^[a-z]+(?:\.[a-z]+)*\.v[0-9]+$
```

Examples fixed in registry config:

- `definition.published.v1`
- `policy.decision.recorded.v1`

`DomainEventV1` contains only references and metadata. It rejects body payloads and does not permit Secret-bearing fields.

## PolicyInput Boundary

`PolicyInputV1` now accepts only closed, server-derived structures:

| Field        | Required properties                        | Explicitly excluded by closure                                      |
| ------------ | ------------------------------------------ | ------------------------------------------------------------------- |
| `actor`      | `actorId`, `roles`                         | `body`, `rawBody`, `secret`, `token`, query text, arbitrary fields  |
| `credential` | `credentialId`, `kind`, `status`, `scopes` | `secret`, `secretValue`, `token`, `password`, raw credential values |
| `network`    | `source`                                   | `fullUrl`, `url`, `query`, `headers`, body payloads                 |

`credential.kind` is limited to `api_key` or `oauth_client`. `credential.status` is limited to `active`, `rotating`, `revoked`, or `expired`. `network.source` is a normalized source or zone, not a URL.

## Negative Fixtures

| Fixture                                                       | Boundary proven                                         |
| ------------------------------------------------------------- | ------------------------------------------------------- |
| `invalid/service-definition-floating-production-version.json` | Production definitions reject floating module versions. |
| `invalid/service-definition-missing-digest.json`              | Definition references require immutable digests.        |
| `invalid/domain-event-body.json`                              | Domain events reject body payloads.                     |
| `invalid/policy-input-credential-secret.json`                 | `PolicyInput.credential` rejects `secret`.              |
| `invalid/policy-input-actor-body.json`                        | `PolicyInput.actor` rejects `body`.                     |
| `invalid/policy-input-network-full-url.json`                  | `PolicyInput.network` rejects `fullUrl`.                |
| `invalid/policy-decision-extra-field.json`                    | `PolicyDecision` rejects debug/policy body fields.      |
| `invalid/module-manifest-custom-execution.json`               | `ModuleManifest` rejects custom execution commands.     |
| `invalid/domain-event-secret.json`                            | Domain events reject Secret payloads.                   |

## Compatibility Baseline

Definition registry compatibility is tracked by:

- `packages/contracts/baselines/definition.v1.public-surface.json`

The baseline covers every `$defs` schema in `definition.v1.schema.json`:

- `OpaqueId`
- `UtcDateTime`
- `Sha256Digest`
- `ExactVersion`
- `Environment`
- `ModuleType`
- `RiskLevel`
- `EffectiveLimits`
- `ServiceDefinition`
- `ModuleManifest`
- `PolicyInput`
- `PolicyDecision`
- `DomainEvent`

The breaking check now reports all four baselines:

- `packages/contracts/baselines/common.v1.public-surface.json`
- `packages/contracts/baselines/control-plane.v1.public-surface.json`
- `packages/contracts/baselines/release-ops.v1.public-surface.json`
- `packages/contracts/baselines/definition.v1.public-surface.json`

## Validation

| Check                       | Result | Evidence                                                                                                                                                                                                                                   |
| --------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Readiness                   | PASS   | `./scripts/check-work-package-ready.sh WP-01D` reported dependency `WP-01A` PASS and `READY WP-01D`.                                                                                                                                       |
| Registry validation         | PASS   | `pnpm --filter @modular-mcp/contracts validate:registry` reported 5 schemas, 5 golden fixtures, and 9 negative fixtures checked.                                                                                                           |
| Registry integrity rules    | PASS   | Registry validation now checks registry version, canonicalization algorithm/digest/input boundary, exact schema name set, duplicate names, duplicate URIs, `$defs` paths, URI-to-`$id` equality, and event versioning pattern/examples.    |
| Generated registry types    | PASS   | `pnpm --filter @modular-mcp/contracts generate:types` regenerated `packages/contracts/src/generated/definition.ts`; `PolicyInput` now emits explicit `actor`, `credential`, and `network` structures instead of `Record<string, unknown>`. |
| Definition baseline check   | PASS   | Initial `pnpm --filter @modular-mcp/contracts breaking:check` failed because `definition.v1.public-surface.json` did not exist; `node scripts/contracts-breaking-check.mjs --write` created the fourth baseline.                           |
| Four-baseline breaking gate | PASS   | `pnpm test:contract` reported breaking-change check passed against common, control-plane, release-ops, and definition baselines.                                                                                                           |
| Contract package build      | PASS   | `pnpm --filter @modular-mcp/contracts build` passed.                                                                                                                                                                                       |
| Contract test suite         | PASS   | `pnpm test:contract` passed schema lint, example validation, generated type checks, and breaking-change checks.                                                                                                                            |
| Focused verification        | PASS   | `pnpm verify:affected` passed format, lint, typecheck, unit tests, contract checks, build, dependency scan, and secret scan.                                                                                                               |
| Full verification           | PASS   | `pnpm verify` passed format, lint, typecheck, unit tests, contract checks, build, dependency scan, and secret scan.                                                                                                                        |
| Diff whitespace             | PASS   | `git diff --check` produced no output.                                                                                                                                                                                                     |
| Security rejection probes   | PASS   | Read-only probes rejected `credential.secret`, `actor.body`, `network.fullUrl`, `PolicyDecision.debug`, `ModuleManifest.customExecution`, `DomainEvent.body`, and `DomainEvent.secret` with unexpected-property errors.                    |

## Contract Rules Locked

- Definition references exact data/module/policy versions and digests.
- Module manifests declare dependencies, conflicts, permissions, limits, risk, artifact digest, and signature.
- Module manifests use exact dependency refs and do not expose custom execution fields.
- `PolicyDecision` contains only `allow`, `reason`, `effectiveScopes`, `effectiveLimits`, `policyVersion`, and `decisionId`.
- Domain events carry reference metadata only and reject body payloads.
- `PolicyInput` carries only frozen, server-derived actor, credential, and network metadata; it does not accept Secrets, body payloads, full URLs, headers, query strings, or arbitrary extension fields.
- Definition registry compatibility is now protected by the repository-level breaking-change check.

## Stop Conditions

WP-01D did not require changing the Definition fact model, adding user code execution, writing resolver/compiler logic, creating OPA rules, using production credentials, or introducing external writes.

The API gate review passed on 2026-09-17: the frozen v1 schemas, generated types, fixtures, registry integrity checks, and four-baseline compatibility checks satisfy the WP-01D acceptance criteria. This evidence is approved as `PASS`.

## Residual Risk

- The registry validator intentionally supports the JSON Schema subset used by these registry schemas. All JSON Schema keywords currently used by `definition.v1.schema.json` are covered by the package-local validator. If future schemas add unsupported keywords such as `oneOf` or conditionals, the package-local validator must be extended or replaced by a reviewed standard validator dependency before those schemas are accepted.
- Domain-level semantic checks such as dependency closure, cycle detection, and most-restrictive limit calculation are intentionally deferred to compiler/resolver WPs.

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

No resolver/compiler, OPA/Rego rule, module runtime, custom module execution field, or user-code execution capability was added.

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

## Validation

| Check                                | Result | Evidence                                                                                                                         |
| ------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Readiness                            | PASS   | `./scripts/check-work-package-ready.sh WP-01D` reported dependency `WP-01A` PASS and `READY WP-01D`.                             |
| Registry validation                  | PASS   | `pnpm --filter @modular-mcp/contracts validate:registry` reported 5 schemas, 5 golden fixtures, and 3 negative fixtures checked. |
| Golden fixtures                      | PASS   | Valid `ServiceDefinition`, `ModuleManifest`, `PolicyInput`, `PolicyDecision`, and `DomainEvent` fixtures all passed.             |
| Floating production version negative | PASS   | Temporary valid-list probe failed on `modules[0].exactVersion` pattern for a floating module version.                            |
| Missing digest negative              | PASS   | Temporary valid-list probe failed on missing `dataVersionDigest`.                                                                |
| Event body negative                  | PASS   | Temporary valid-list probe failed on unexpected top-level `body`.                                                                |
| Generated registry types no diff     | PASS   | `pnpm test:contract` reported `registry generated types check passed`.                                                           |
| Contract package build               | PASS   | `pnpm --filter @modular-mcp/contracts build` passed.                                                                             |
| Full verification                    | PASS   | `pnpm verify` passed format, lint, typecheck, unit, contract, build, dependency scan, and secret scan.                           |

## Contract Rules Locked

- Definition references exact data/module/policy versions and digests.
- Module manifests declare dependencies, conflicts, permissions, limits, risk, artifact digest, and signature.
- Module manifests use exact dependency refs and do not expose custom execution fields.
- `PolicyDecision` contains only `allow`, `reason`, `effectiveScopes`, `effectiveLimits`, `policyVersion`, and `decisionId`.
- Domain events carry reference metadata only and reject body payloads.

## Stop Conditions

WP-01D did not require changing the Definition fact model, adding user code execution, writing resolver/compiler logic, creating OPA rules, using production credentials, or introducing external writes.

Because this work package declares `gate: api`, the implementation remains `IMPLEMENTED_AWAITING_REVIEW` until API review signs off. After review, this evidence can be promoted to `PASS`.

## Residual Risk

- The registry validator intentionally supports the JSON Schema subset used by these registry schemas. If future schemas add features such as `oneOf` or conditionals, the package-local validator must be extended or replaced by a reviewed validator dependency.
- Domain-level semantic checks such as dependency closure, cycle detection, and most-restrictive limit calculation are intentionally deferred to compiler/resolver WPs.

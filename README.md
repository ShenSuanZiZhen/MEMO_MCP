# Modular MCP Suite

This repository uses a pnpm monorepo for the P0 Modular MCP build and operations platform.

## Bootstrap

```bash
corepack enable
corepack prepare pnpm@12.4.1 --activate
pnpm install --frozen-lockfile
pnpm verify
```

No production secrets are required for the WP-00A workspace baseline.

## Root Commands

- `pnpm ci:local` reproduces the CI quality gate locally in the enforced order: format, lint, typecheck, unit, contract, build, dependency scan, secret scan.
- `pnpm ci:cache-key` prints the lockfile-derived dependency cache key used to prove cache invalidation when `pnpm-lock.yaml` changes.
- `pnpm lint` checks workspace metadata and boundary conventions.
- `pnpm typecheck` runs TypeScript strict project references.
- `pnpm test` and `pnpm test:unit` run the architecture test suite.
- `pnpm test:contract` checks contract-test scaffolding and reserved contract package boundaries.
- `pnpm build` builds every workspace package and app that exposes a build script.
- `pnpm dependency:scan` checks pinned dependency policy, lockfile presence, and reviewed pnpm build-script allowlists.
- `pnpm secret:scan` blocks unallowlisted secret patterns across repository text files.
- `pnpm verify:affected` runs the same local verification chain used by the first work packages.
- `pnpm verify` runs the full root verification chain.
- `pnpm infra:up` starts local PostgreSQL, Redis, MinIO, OpenSearch, Temporal, OPA, and OTel.
- `pnpm infra:smoke` checks deterministic local dependency health.
- `pnpm infra:down` stops local dependencies without deleting volumes.
- `pnpm infra:reset -- --confirm project-volumes` deletes only this Compose project's local volumes.

See [infra/compose/README.md](infra/compose/README.md) for ports and service details.

## CI and Security Gates

GitHub Actions runs `.github/workflows/ci.yml` on pull requests and pushes to `main`. The job installs dependencies with `pnpm install --frozen-lockfile`, caches pnpm data from `pnpm-lock.yaml`, and has no `continue-on-error` steps.

The CI and `pnpm ci:local` order is intentionally fixed:

1. `pnpm format`
2. `pnpm lint`
3. `pnpm typecheck`
4. `pnpm test:unit`
5. `pnpm test:contract`
6. `pnpm build`
7. `pnpm dependency:scan`
8. `pnpm secret:scan`

Fake secrets in fixtures require a narrow exception in `.secret-scan-allowlist.json`. Each exception must identify the file path, scanner pattern, and SHA-256 of the synthetic value; never add broad path ignores or disable a pattern to make tests pass.

## Directory Boundaries

- `apps/*` contains deployable application skeletons only.
- `packages/domain` must stay pure and must not import apps or infrastructure packages.
- `packages/database`, `packages/data-access`, `packages/observability`, and future infrastructure adapters implement ports outside the domain layer.
- `packages/contracts` is reserved for OpenAPI, JSON Schema, events, and shared error contracts.

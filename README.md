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

- `pnpm lint` checks workspace metadata and boundary conventions.
- `pnpm typecheck` runs TypeScript strict project references.
- `pnpm test` runs the architecture test suite.
- `pnpm build` builds every workspace package and app that exposes a build script.
- `pnpm verify:affected` runs the same local verification chain used by the first work packages.
- `pnpm verify` runs the full root verification chain.

## Directory Boundaries

- `apps/*` contains deployable application skeletons only.
- `packages/domain` must stay pure and must not import apps or infrastructure packages.
- `packages/database`, `packages/data-access`, `packages/observability`, and future infrastructure adapters implement ports outside the domain layer.
- `packages/contracts` is reserved for OpenAPI, JSON Schema, events, and shared error contracts.

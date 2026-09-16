# Repository Guidance

- Read `work-packages/00_全局开发约束.md`, the target `work-packages/WP-*.md`, and dependency evidence before changing files.
- Work package scope wins over convenience refactors; do not edit product code for CI-only or evidence-only packages.
- Keep `packages/domain` independent from apps, database, Temporal, OPA, Redis, OpenSearch, cloud SDKs, and other infrastructure adapters.
- Use `pnpm ci:local` to reproduce CI locally. It runs format, lint, typecheck, unit tests, contract checks, build, dependency scan, then secret scan.
- Use `pnpm verify:affected` for focused changes and `pnpm verify` for shared baseline or milestone changes.
- Use `pnpm dependency:scan` and `pnpm secret:scan` when touching dependency metadata, fixtures, CI, scripts, docs, or environment examples.
- Secret scan exceptions must be exact-path, exact-pattern, and SHA-256 based in `.secret-scan-allowlist.json`; do not weaken repository-wide scanning to allow fixtures.
- Do not add production secrets, real tenant data, or external write operations to local tests.
- Stop and ask before using organization tokens, contacting production services, weakening a quality/security gate, or expanding a work package beyond its stated scope.

# Repository Guidance

- Follow `work-packages/00_全局开发约束.md` before changing code.
- Work package scope wins over convenience refactors.
- Keep `packages/domain` independent from apps, database, Temporal, OPA, Redis, OpenSearch, cloud SDKs, and other infrastructure adapters.
- Use `pnpm verify:affected` for focused changes and `pnpm verify` for shared baseline or milestone changes.
- Do not add production secrets, real tenant data, or external write operations to local tests.

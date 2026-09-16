# Common API Contract Primitives

WP-01A freezes the v1 common primitives shared by control-plane OpenAPI documents, domain events, and MCP-facing contract surfaces.

## Schema URIs

The source of truth is `packages/contracts/openapi/common.v1.json`, an OpenAPI 3.1 document with JSON Schema 2020-12 components.

Published component `$id` values use:

```text
https://contracts.modular-mcp.local/schemas/common/v1/<SchemaName>
```

Current schemas:

- `OpaqueId`
- `UtcDateTime`
- `RequestId`
- `TraceId`
- `Cursor`
- `CursorPaginationRequest`
- `PageInfo`
- `CursorPage`
- `JobStatus`
- `AcceptedJobResponse`
- `Job`
- `ErrorCode`
- `ErrorCategory`
- `ErrorDetails`
- `Error`
- `ErrorEnvelope`
- `DomainEventEnvelope`

## Generation and Checks

- Generate TypeScript types: `pnpm --filter @modular-mcp/contracts generate:types`
- Check generated types are current: `node scripts/contracts-generate-types.mjs`
- Lint schemas: `pnpm --filter @modular-mcp/contracts lint:schemas`
- Validate positive and negative examples: `pnpm --filter @modular-mcp/contracts validate:examples`
- Check breaking changes: `pnpm --filter @modular-mcp/contracts breaking:check`
- Run the full contract gate: `pnpm test:contract`

Generated TypeScript lives in `packages/contracts/src/generated/common.ts` and is exported by `@modular-mcp/contracts`.

## Version Rules

- Path major version remains `/api/v1` for compatible changes.
- Schema IDs remain under `/schemas/common/v1/` for compatible changes.
- Removing schemas, removing properties, changing property types or formats, changing required fields, relaxing UTC timestamp requirements, or removing enum values is breaking.
- Adding optional properties may be compatible when examples and generated types are updated.
- Adding required properties to an existing schema is breaking and requires a new major schema version or an explicitly reviewed compatibility plan.
- Existing event types include their own suffix, such as `data.version.completed.v1`; new event payload schemas must preserve the common `DomainEventEnvelope`.

## Error Code Additions

Every new error code must:

1. Use one of the approved categories: `AUTHN`, `AUTHZ`, `DATA`, `MODULE`, `DEFINITION`, `TEST`, `DEPLOY`, `QUOTA`, or `DEPENDENCY`.
2. Use a code prefix matching the category, for example `QUOTA_EXCEEDED`.
3. Include `message`, `requestId`, `retryable`, and `nextAction` in the `ErrorEnvelope`.
4. Avoid stack traces, raw bodies, full URLs, queries, credentials, secrets, and internal causes in `details`.
5. Add at least one valid example or update an existing scenario example.
6. Run `pnpm test:contract` and `pnpm verify`.

Authorization failures and missing resources must continue to use merged outward-facing semantics so callers cannot infer whether a resource exists.

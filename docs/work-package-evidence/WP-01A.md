---
work_package: WP-01A
status: PASS
completed_at: 2026-09-16T07:08:36Z
gate: api
depends_on:
  - WP-00A
---

# WP-01A Evidence

## Scope Delivered

- Added OpenAPI 3.1 / JSON Schema 2020-12 common contract primitives in `packages/contracts/openapi/common.v1.json`.
- Added generated TypeScript types in `packages/contracts/src/generated/common.ts`.
- Exported generated common types from `@modular-mcp/contracts`.
- Added valid and invalid contract examples for accepted jobs, cursor pages, domain event envelopes, and error envelopes.
- Added schema lint, example validation, generated-type drift check, and breaking-change baseline scripts.
- Added API contract documentation in `docs/api/common-contracts.md`.

No concrete business endpoints, handlers, database models, migrations, or product API fields were introduced.

## Schema URIs

Source of truth:

- `packages/contracts/openapi/common.v1.json`

Schema IDs use:

```text
https://contracts.modular-mcp.local/schemas/common/v1/<SchemaName>
```

Schemas delivered:

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

## Generation Entry

- Generate TypeScript: `pnpm --filter @modular-mcp/contracts generate:types`
- Check generated types: `node scripts/contracts-generate-types.mjs`
- Full contract gate: `pnpm test:contract`
- Full repository gate: `pnpm verify`

Generated output:

- `packages/contracts/src/generated/common.ts`

Breaking-change baseline:

- `packages/contracts/baselines/common.v1.public-surface.json`

## Version Rules

- Compatible API changes stay on path major version `/api/v1`.
- Compatible common schema changes stay under `/schemas/common/v1/`.
- Removing schemas, removing properties, changing property types or formats, changing required fields, relaxing UTC timestamp rules, or removing enum values is breaking.
- Adding a required field to an existing schema is breaking.
- Adding optional fields can be compatible after examples, generated types, docs, and the breaking baseline are reviewed.
- Event names keep their own suffix such as `data.version.completed.v1`; event payloads continue to use `DomainEventEnvelope`.

## Error Code Addition Flow

1. Choose one approved category: `AUTHN`, `AUTHZ`, `DATA`, `MODULE`, `DEFINITION`, `TEST`, `DEPLOY`, `QUOTA`, or `DEPENDENCY`.
2. Add an error code whose prefix matches the category.
3. Preserve `message`, `requestId`, `retryable`, and `nextAction` in every error envelope.
4. Keep `details` sanitized: no stack, internal cause, raw body, full URL, query text, credentials, or secrets.
5. Add or update examples.
6. Run `pnpm test:contract` and `pnpm verify`.

Authorization-denied and not-found outcomes remain merged externally to avoid resource-existence disclosure.

## Validation

| Check                           | Result | Evidence                                                                                               |
| ------------------------------- | ------ | ------------------------------------------------------------------------------------------------------ |
| Readiness                       | PASS   | `./scripts/check-work-package-ready.sh WP-01A` reported dependency `WP-00A` PASS and `READY WP-01A`.   |
| Schema lint                     | PASS   | `pnpm test:contract` reported `schema lint passed: 17 common schemas checked`.                         |
| Example validation              | PASS   | `pnpm test:contract` reported `4 valid and 3 invalid fixtures checked`.                                |
| Generated types no diff         | PASS   | `pnpm test:contract` reported `generated types check passed`.                                          |
| Breaking-change check           | PASS   | `pnpm test:contract` passed against `packages/contracts/baselines/common.v1.public-surface.json`.      |
| Missing required field negative | PASS   | A temporary valid-list probe using the missing-`requestId` fixture failed validation.                  |
| Illegal time negative           | PASS   | A temporary valid-list probe using a non-UTC timestamp fixture failed validation.                      |
| Internal stack negative         | PASS   | A temporary valid-list probe using a stack-bearing error details fixture failed validation.            |
| Contract package build          | PASS   | `pnpm --filter @modular-mcp/contracts build` passed.                                                   |
| Full verification               | PASS   | `pnpm verify` passed format, lint, typecheck, unit, contract, build, dependency scan, and secret scan. |

## Stop Conditions

WP-01A did not require concrete business fields, endpoint decisions, handler implementation, database models, production credentials, external writes, or changes that conflict with PRD error semantics.

Because this work package declares `gate: api`, the implementation remains `IMPLEMENTED_AWAITING_REVIEW` until API review signs off. After review, this evidence can be promoted to `PASS`.

## Residual Risk

- The local schema validator intentionally covers the JSON Schema subset used by these common primitives. Future schema features may require extending `scripts/contracts-lib.mjs` or adopting a reviewed validator dependency.
- The breaking-change checker prevents known public-surface breakages but still requires API review for compatibility decisions such as new optional fields or new error codes.

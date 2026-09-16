# Local Infrastructure

WP-00B provides Docker Compose orchestration for local P0 dependencies only. It does not create cloud resources and binds published ports to `127.0.0.1` by default.

## Commands

```bash
pnpm infra:up
pnpm infra:status
pnpm infra:smoke
pnpm infra:down
pnpm infra:reset -- --confirm project-volumes
```

`infra:reset` removes only volumes owned by the configured Compose project. The default project name is `modular-mcp`; override it in `.env` or `.env.example` with `MCP_COMPOSE_PROJECT`.

## Services

| Service       | Port variable            | Default           |
| ------------- | ------------------------ | ----------------- |
| PostgreSQL    | `MCP_POSTGRES_PORT`      | `127.0.0.1:15432` |
| Redis         | `MCP_REDIS_PORT`         | `127.0.0.1:16379` |
| MinIO API     | `MCP_MINIO_API_PORT`     | `127.0.0.1:19000` |
| MinIO Console | `MCP_MINIO_CONSOLE_PORT` | `127.0.0.1:19001` |
| OpenSearch    | `MCP_OPENSEARCH_PORT`    | `127.0.0.1:19200` |
| Temporal      | `MCP_TEMPORAL_PORT`      | `127.0.0.1:17233` |
| OPA           | `MCP_OPA_PORT`           | `127.0.0.1:18181` |
| OTel gRPC     | `MCP_OTEL_GRPC_PORT`     | `127.0.0.1:14317` |
| OTel HTTP     | `MCP_OTEL_HTTP_PORT`     | `127.0.0.1:14318` |
| OTel health   | `MCP_OTEL_HEALTH_PORT`   | `127.0.0.1:13133` |

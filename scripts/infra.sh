#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${MCP_INFRA_ENV_FILE:-$ROOT_DIR/.env}"
DEFAULT_ENV_FILE="$ROOT_DIR/.env.example"
COMPOSE_FILE="$ROOT_DIR/infra/compose/compose.yaml"

if [[ ! -f "$ENV_FILE" ]]; then
  ENV_FILE="$DEFAULT_ENV_FILE"
fi

# shellcheck source=/dev/null
source "$ENV_FILE"

PROJECT_NAME="${MCP_COMPOSE_PROJECT:-modular-mcp}"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" -p "$PROJECT_NAME")

usage() {
  cat <<'EOF'
Usage: scripts/infra.sh <up|down|reset|status|smoke> [options]

Commands:
  up       Start local dependencies and wait for health checks.
  down     Stop local dependencies without deleting volumes.
  reset    Stop local dependencies and delete only this Compose project's volumes.
           Requires: --confirm project-volumes
  status   Show Compose service status.
  smoke    Verify dependency health through deterministic checks.
EOF
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

compose() {
  "${COMPOSE[@]}" "$@"
}

http_ok() {
  local label="$1"
  local url="$2"
  curl -fsS "$url" >/dev/null
  printf 'PASS  %s\n' "$label"
}

exec_ok() {
  local label="$1"
  shift
  compose exec -T "$@" >/dev/null
  printf 'PASS  %s\n' "$label"
}

run_ok() {
  local label="$1"
  shift
  compose run --rm --no-deps "$@" >/dev/null
  printf 'PASS  %s\n' "$label"
}

smoke() {
  require_command curl

  exec_ok "postgres accepts connections" postgres pg_isready -U "${POSTGRES_USER:-mcp_dev}" -d "${POSTGRES_DB:-mcp_control}"
  exec_ok "redis responds to PING" redis redis-cli ping
  http_ok "minio health endpoint" "http://127.0.0.1:${MCP_MINIO_API_PORT:-19000}/minio/health/live"
  run_ok "minio bucket exists" --entrypoint /bin/sh minio-init -c "mc alias set local http://minio:9000 '${MINIO_ROOT_USER:-mcp_dev_minio}' '${MINIO_ROOT_PASSWORD:-mcp_dev_minio_password}' >/dev/null && mc ls 'local/${MINIO_BUCKET:-mcp-dev-artifacts}'"
  http_ok "opensearch cluster health" "http://127.0.0.1:${MCP_OPENSEARCH_PORT:-19200}/_cluster/health?wait_for_status=yellow&timeout=5s"
  http_ok "opensearch synthetic index exists" "http://127.0.0.1:${MCP_OPENSEARCH_PORT:-19200}/${OPENSEARCH_INDEX:-mcp-dev-smoke}"
  compose exec -T temporal /bin/sh -c 'temporal operator cluster health --address "$(hostname -i):7233"' >/dev/null
  printf 'PASS  %s\n' "temporal cluster health"
  http_ok "opa health endpoint" "http://127.0.0.1:${MCP_OPA_PORT:-18181}/health"
  http_ok "otel collector health endpoint" "http://127.0.0.1:${MCP_OTEL_HEALTH_PORT:-13133}/"
}

command="${1:-}"
case "$command" in
  up)
    services=(postgres redis minio opensearch temporal opa otel)
    compose up -d --wait --wait-timeout 300 "${services[@]}"
    compose run --rm --no-deps minio-init
    compose run --rm --no-deps opensearch-init
    ;;
  down)
    compose down
    ;;
  reset)
    shift
    if [[ "${1:-}" == "--" ]]; then
      shift
    fi
    if [[ "${1:-}" != "--confirm" || "${2:-}" != "project-volumes" ]]; then
      cat >&2 <<EOF
Refusing to reset local infrastructure.
This command deletes only Docker volumes owned by Compose project '$PROJECT_NAME':
  ${PROJECT_NAME}_postgres-data
  ${PROJECT_NAME}_redis-data
  ${PROJECT_NAME}_minio-data
  ${PROJECT_NAME}_opensearch-data

Run: pnpm infra:reset -- --confirm project-volumes
EOF
      exit 2
    fi
    compose down -v --remove-orphans
    ;;
  status)
    compose ps
    ;;
  smoke)
    smoke
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

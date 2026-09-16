---
work_package: WP-00B
status: PASS
baseline: "4807f7f; existing modified file before WP-00B: docs/work-package-evidence/WP-00A.md"
completed_at: "2026-09-15T10:24:37Z"
---

# WP-00B 完成证据

## 实现结果

已提供 Docker Compose 本地基础设施编排，能够一键启动 P0 依赖 PostgreSQL、Redis、MinIO、OpenSearch、Temporal、OPA 和 OpenTelemetry Collector。所有默认发布端口绑定到 `127.0.0.1`，凭证均为 `.env.example` 中的合成开发值。启动流程会在核心服务健康后初始化 MinIO bucket 和 OpenSearch synthetic index。

## 变更文件

- `.env.example`：本地端口、合成开发账号和初始化资源名。
- `infra/compose/compose.yaml`：固定镜像版本、loopback 端口、volumes、healthcheck 和 init profiles。
- `infra/compose/postgres/init/00-temporal-databases.sql`：Temporal 本地数据库初始化。
- `infra/compose/temporal/dynamicconfig/development-sql.yaml`：Temporal 本地空 dynamic config。
- `infra/compose/otel/otel-collector.yaml`：OTLP receiver、batch processor、debug exporter 和 health extension。
- `infra/compose/opa/policies/health.rego`：OPA 本地健康策略。
- `infra/compose/README.md`：本地基础设施命令、端口和 reset 说明。
- `scripts/infra.sh`：`up/down/reset/status/smoke` 命令实现。
- `package.json`：新增根 `infra:*` scripts，并收窄 format 范围避免跨 WP evidence 文件互相影响。
- `README.md`：新增本地基础设施命令索引。
- `docs/work-package-evidence/WP-00B.md`：本 evidence。

## 服务、端口和健康检查

| 服务           | Compose service | 镜像                                               | 默认端口                            | 默认账号类型                       | 健康检查                                          |
| -------------- | --------------- | -------------------------------------------------- | ----------------------------------- | ---------------------------------- | ------------------------------------------------- |
| PostgreSQL     | `postgres`      | `postgres:16.4-alpine`                             | `127.0.0.1:15432`                   | 合成开发账号 `mcp_dev`             | `pg_isready`                                      |
| Redis          | `redis`         | `redis:7.4.0-alpine`                               | `127.0.0.1:16379`                   | 本地无认证                         | `redis-cli ping`                                  |
| MinIO API      | `minio`         | `quay.io/minio/minio:RELEASE.2024-08-26T15-33-07Z` | `127.0.0.1:19000`                   | 合成开发 root 用户 `mcp_dev_minio` | `mc ready local`；smoke 使用 `/minio/health/live` |
| MinIO Console  | `minio`         | 同上                                               | `127.0.0.1:19001`                   | 同上                               | 同上                                              |
| OpenSearch     | `opensearch`    | `opensearchproject/opensearch:2.17.1`              | `127.0.0.1:19200`                   | 本地 security plugin disabled      | `/_cluster/health?wait_for_status=yellow`         |
| Temporal       | `temporal`      | `temporalio/auto-setup:1.25.2`                     | `127.0.0.1:17233`                   | 本地默认 namespace                 | `temporal operator cluster health`                |
| OPA            | `opa`           | `openpolicyagent/opa:0.68.0`                       | `127.0.0.1:18181`                   | 本地无认证                         | `/health`；Compose 同时 eval 本地 policy          |
| OTel Collector | `otel`          | `otel/opentelemetry-collector-contrib:0.107.0`     | `127.0.0.1:14317`, `14318`, `13133` | 本地无认证                         | health extension `:13133`                         |

注：`openpolicyagent/opa:0.68.0` 在本机 arm64 Docker Desktop 上通过显式 `platform: linux/amd64` 运行。

## 初始化资源

- MinIO bucket：`mcp-dev-artifacts`，访问策略为 private。
- OpenSearch index：`mcp-dev-smoke`，1 shard、0 replica，包含 `workspace_id` 和 `created_at` synthetic mapping。
- PostgreSQL databases：`mcp_control`、`temporal`、`temporal_visibility`。

## Reset 影响

`pnpm infra:reset` 默认拒绝执行，并输出将删除的范围。只有运行 `pnpm infra:reset -- --confirm project-volumes` 才会执行 `docker compose down -v --remove-orphans`。

确认 reset 删除的项目 volumes：

- `modular-mcp_postgres-data`
- `modular-mcp_redis-data`
- `modular-mcp_minio-data`
- `modular-mcp_opensearch-data`

reset 后 `docker volume ls --format '{{.Name}}' | grep '^modular-mcp_'` 无输出；未使用非 project volume 删除命令。

## 契约和衔接

- 新增根命令：`pnpm infra:up`、`pnpm infra:down`、`pnpm infra:reset`、`pnpm infra:status`、`pnpm infra:smoke`。
- 新增本地环境变量见 `.env.example`，均为开发默认值；无生产 Secret。
- 下游本地集成包可依赖上述 loopback 端口和 `pnpm infra:smoke`。
- 未新增业务 API、Schema、事件、migration、应用代码或云资源。

## 验证记录

| 命令                                                                                                 | 结果 | 关键输出                                                                                                  |
| ---------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------- |
| `./scripts/check-work-package-ready.sh WP-00B`                                                       | PASS | `PASS dependency WP-00A`; `READY WP-00B`                                                                  |
| `docker compose --env-file .env.example -f infra/compose/compose.yaml -p modular-mcp config --quiet` | PASS | no output                                                                                                 |
| `pnpm infra:up`                                                                                      | PASS | 7 core services healthy; MinIO bucket initialized; OpenSearch index initialized                           |
| `pnpm infra:smoke`                                                                                   | PASS | Postgres、Redis、MinIO、OpenSearch、Temporal、OPA、OTel all `PASS`                                        |
| `down/up persistence probe`                                                                          | PASS | Postgres/Redis/MinIO/OpenSearch synthetic sentinel values survived `pnpm infra:down` then `pnpm infra:up` |
| `pnpm infra:reset`                                                                                   | PASS | exits 2 and refuses without `--confirm project-volumes`                                                   |
| `pnpm infra:reset -- --confirm project-volumes`                                                      | PASS | removed only `modular-mcp_*` project volumes                                                              |
| `reset -> pnpm infra:up -> pnpm infra:smoke`                                                         | PASS | clean volumes recreated and all services passed smoke                                                     |
| `pnpm format`                                                                                        | PASS | `All matched files use Prettier code style!`                                                              |
| `pnpm verify:affected`                                                                               | PASS | lint、typecheck、architecture test、build all passed                                                      |

## 验收标准核对

- [x] 编排 PostgreSQL、Redis、MinIO、OpenSearch、Temporal、OPA、OTel。
- [x] 固定镜像版本、volume、healthcheck 和可配置端口。
- [x] 提供 `infra:up/down/reset/status/smoke`。
- [x] reset 需要明确确认范围，确认后只清理项目 volumes。
- [x] 使用合成开发密钥和 bucket/index 初始化。
- [x] `docker compose ... config --quiet`、`pnpm infra:up`、`pnpm infra:smoke` PASS。
- [x] down/up 后持久数据存在；reset 后项目 volumes 被清理。
- [x] `pnpm verify:affected` PASS。

## 全局约束核对

- [x] 未创建云资源。
- [x] 未放入真实凭证、真实客户数据或生产 Secret。
- [x] 未实现业务服务、业务 API、数据库表或页面。
- [x] 默认端口仅绑定 loopback。
- [x] 未修改应用代码或放宽安全/租户/关闭式拒绝约束。

## 风险和遗留项

- OPA 固定镜像在 arm64 主机上使用 `linux/amd64` 平台；本机 Docker Desktop 可运行，若组织要求全镜像原生 arm64，应后续评审更换 OPA 镜像来源或版本。
- 依赖 Docker daemon、镜像 registry 访问和本机可用端口；端口均可通过 `.env` 覆盖。

## 人工评审

- 门禁：`none`
- 结论：`not-required`

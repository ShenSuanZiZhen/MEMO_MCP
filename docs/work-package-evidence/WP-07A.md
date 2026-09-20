---
work_package: WP-07A
status: PASS
baseline: "51f3f2a; workspace was dirty before WP-07A and pre-existing changes were preserved"
completed_at: "2026-09-20T01:58:00Z"
gate: none
depends_on:
  - WP-03B
  - WP-02D
---

# WP-07A 完成证据

## 实现结果

实现了受租户隔离的 multipart 上传创建、短时签名、分片确认、完成、取消和过期恢复入口。

可观察行为：

- 每个上传操作都通过 `draft.edit` 做 Workspace/Project overlay 权限检查；跨 workspace/project 或缺少权限返回同形 404。
- `createMultipartUpload()` 强制单文件 100 MiB、单 draft 20 文件、单 draft 500 MiB 总量上限；对象 key 由服务端生成，客户端不能传 bucket/key。
- `signMultipartUploadPart()` 只为指定 `objectKey + uploadId + partNumber` 生成短时 `PUT` URL，默认 15 分钟。
- `confirmMultipartUploadPart()` 通过 storage port 读取服务端已上传 part 元数据，并拒绝篡改 key、part、size、checksum。
- `completeMultipartUpload()` 使用服务端确认的 part 列表和 storage complete 结果，重复 complete 返回同一已完成结果。
- `abortMultipartUpload()` 对取消幂等；已完成上传不能再取消。
- `recoverMultipartUpload()` 对已过期但仍存在有效 part 的上传延长会话并保留成功 part；无有效 part 明确拒绝。

未实现文件解析、扫描、公开读 URL、客户端指定 bucket/key、原文件下载或 P1 数据处理工作流。

## 变更文件

- `apps/control-api/src/index.ts`：新增 multipart 上传 use-case、storage port、S3/MinIO SigV4 adapter 和错误信封。
- `packages/database/migrations/0008_upload_multipart.up.sql` / `down.sql`：新增 `app.multipart_uploads`、`app.multipart_upload_parts`、RLS、不可变/append-only 触发器和索引。
- `packages/database/src/index.ts`：新增 upload opaque ID 映射、multipart upload repository、repository support factory 出口，migration head 更新为 `0008_upload_multipart`。
- `packages/database/scripts/integration-test.mjs`：授予 runtime role 新表权限。
- `packages/database/scripts/verify-public-api.mjs`：新增 multipart repository public API probe。
- `packages/database/scripts/verify-tenant-core.mjs`：将新表纳入 RLS 表清单，并增加 multipart 上传插入、完成、跨租户不可见、key 不可变和 part append-only 集成验证。
- `tests/control-api/upload-multipart.test.ts`：新增 create/sign/confirm/complete/abort/recover、权限和篡改拒绝用例。

## 契约和衔接

Control API use-case/port：

- `createMultipartUpload`
- `signMultipartUploadPart`
- `confirmMultipartUploadPart`
- `completeMultipartUpload`
- `abortMultipartUpload`
- `recoverMultipartUpload`
- `MultipartUploadRepository`
- `MultipartObjectStoragePort`
- `createS3MultipartObjectStoragePort`

对象 key 格式：

```text
workspace/<workspaceId>/project/<projectId>/environment/<environment>/draft/<draftId>/upload/<uploadId>/source.bin
```

上传状态：

```text
uploading -> uploaded | cancelled
```

过期恢复不把 `data_versions` 置为终态 `expired`，以便有效 part 可恢复；过期判断在 upload use-case/repository 层执行。后续 WP-07B/07C 可在完成上传后继续 quarantine、扫描和持久化工作流。

数据库新增表：

- `app.multipart_uploads`
- `app.multipart_upload_parts`

测试 fixture：

- 固定 synthetic IDs：`upl_018f0000-0000-7000-8000-000000000601`、`dv_018f0000-0000-7000-8000-000000000701`
- synthetic checksum：`sha256:aaaaaaaa...`、`sha256:bbbbbbbb...`
- MinIO smoke object prefix：`wp07a-smoke/<timestamp>/source.bin`

无新增生产 Secret、真实租户数据、环境变量或外部写生产服务。

## 验证记录

| 命令 | 结果 | 关键输出 |
| --- | --- | --- |
| `./scripts/check-work-package-ready.sh WP-07A` | PASS | `READY WP-07A`; dependencies `WP-03B`/`WP-02D` PASS |
| `pnpm vitest run tests/control-api/upload-multipart.test.ts tests/control-api/rbac-middleware.test.ts` | PASS | 18 tests passed |
| `pnpm --filter @modular-mcp/database build` | PASS | `database public API verification passed` |
| `pnpm --filter @modular-mcp/database test:integration` | PASS | migration `0008_upload_multipart` applied/rolled back/reapplied; `PASS multipart upload rules`; tenant-core verification passed |
| `pnpm infra:up` | PASS | MinIO bucket `mcp-dev-artifacts` initialized private |
| MinIO multipart smoke via `createS3MultipartObjectStoragePort` | PASS | created multipart upload, presigned PUT uploaded 1 part, listed 1 part, completed with server checksum |
| `pnpm verify:affected` | PASS | format, lint, typecheck, 219 unit tests, contract checks, build, dependency scan, secret scan all passed |

## 验收标准核对

- [x] 支持 multipart 创建、签名、分片确认、完成、取消和恢复。
- [x] 中断恢复不重复成功分片。
- [x] 同 part 签名重试结果稳定；重复 complete 返回相同已完成结果。
- [x] 跨 workspace/project、改 key、改 part、改 size、改 checksum 均拒绝。
- [x] 对象 key 服务端生成且包含 workspace/project/environment/draft/upload 隔离维度。
- [x] 签名 URL 短时且只写指定 part。
- [x] 每次上传操作都做权限检查。
- [x] MinIO smoke 和 `pnpm verify:affected` PASS。

## 全局约束核对

- [x] 未实现解析、扫描、公开读 URL、原文件下载、任意 SQL、用户脚本或外部生产写操作。
- [x] 未放宽租户、安全、不可变、RLS 或关闭式拒绝约束。
- [x] 未修改已合并迁移；新增 `0008_upload_multipart` expand migration。
- [x] 未升级依赖或加入云 SDK；S3/MinIO adapter 使用 Node 标准库和 `fetch`。
- [x] 测试未跳过、未弱化断言、未扩大超时。

## 风险和遗留项

- WP-07A 只完成 multipart 上传边界；quarantine、malware scan、magic-byte 类型识别和处理工作流属于 WP-07B/WP-07C。
- S3 adapter 当前只暴露 multipart 所需的写入签名、list/complete/abort 能力；不提供读 URL。

## 人工评审

- 门禁：`none`
- 结论：`not-required`

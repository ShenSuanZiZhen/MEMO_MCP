import assert from "node:assert/strict";
import {
  createIdempotencyRepository,
  createMultipartUploadRepository,
  createOutboxRepository,
  createPostgresMemberRoleChangeRepository,
  createRepositorySupportAdapters,
  pinnedTransactionConnectionBrand,
  withTenantTransaction,
} from "../dist/index.js";

const scope = {
  workspaceId: "018f0000-0000-7000-8000-000000000001",
  projectId: "018f0000-0000-7000-8000-000000000201",
  environment: "production",
};
const context = {
  scope,
  actorId: "018f0000-0000-7000-8000-000000000101",
};

await assertTransactionLifecycle();
await assertTransactionBeginFailureReleasesConnection();
await assertTransactionSetConfigFailureRollsBack();
await assertTransactionRollbackPreservesOriginalError();
await assertTransactionCommitFailureRollsBack();
await assertRollbackFailureDoesNotMaskPrimaryError();
await assertReleaseFailureDoesNotMaskPrimaryError();
await assertReleaseFailureAfterSuccessIsReported();
await assertTransactionRequiresFullContext();
await assertIdempotencyRepositoryMapping();
await assertOutboxRepositoryMapping();
await assertMultipartUploadRepositoryMapping();
await assertMemberRoleChangeRepositoryMapping();
await assertMemberRoleChangeRepositoryPreCommitValidation();
assertRepositorySupportFactory();

console.log("database public API verification passed");

function createMockConnection(rowsBySql = new Map(), behavior = {}) {
  const calls = [];
  const connection = {
    [pinnedTransactionConnectionBrand]: true,
    calls,
    released: false,
    async query(sql, params = []) {
      const normalizedSql = normalizeSql(sql);
      calls.push({ sql: normalizedSql, params });
      const failure = behavior.failures?.find(({ match }) =>
        normalizedSql.includes(match),
      );
      if (failure) {
        throw failure.error;
      }
      const matcher = [...rowsBySql.entries()].find(([needle]) =>
        normalizedSql.includes(needle),
      );
      const rows = matcher ? matcher[1] : [];
      return { rows, rowCount: rows.length };
    },
    async release() {
      this.released = true;
      calls.push({ sql: "RELEASE", params: [] });
      if (behavior.releaseError) {
        throw behavior.releaseError;
      }
    },
  };
  return connection;
}

function createProvider(connection) {
  return {
    async connect() {
      return connection;
    },
  };
}

function createTransaction(rowsBySql = new Map()) {
  const connection = createMockConnection(rowsBySql);
  return {
    connection,
    transaction: {
      context,
      query: (sql, params) => connection.query(sql, params),
    },
  };
}

async function assertTransactionLifecycle() {
  const connection = createMockConnection();
  const result = await withTenantTransaction(
    createProvider(connection),
    context,
    async (transaction) => {
      await transaction.query("SELECT 42", ["inside"]);
      return "ok";
    },
  );
  assert.equal(result, "ok");
  assert.deepEqual(
    connection.calls.map((call) => call.sql),
    [
      "BEGIN",
      "SELECT set_config($1, $2, true), set_config($3, $4, true)",
      "SELECT 42",
      "COMMIT",
      "RELEASE",
    ],
  );
  assert.deepEqual(connection.calls[1].params, [
    "app.workspace_id",
    scope.workspaceId,
    "app.actor_id",
    context.actorId,
  ]);
}

async function assertTransactionRollbackPreservesOriginalError() {
  const connection = createMockConnection();
  const original = new Error("callback failed");
  await assert.rejects(
    () =>
      withTenantTransaction(createProvider(connection), context, async () => {
        throw original;
      }),
    (error) => error === original,
  );
  assert(connection.calls.some((call) => call.sql === "ROLLBACK"));
  assert(!connection.calls.some((call) => call.sql === "COMMIT"));
  assert(connection.released);
}

async function assertTransactionBeginFailureReleasesConnection() {
  const beginError = new Error("begin failed");
  const connection = createMockConnection(new Map(), {
    failures: [{ match: "BEGIN", error: beginError }],
  });
  await assert.rejects(
    () =>
      withTenantTransaction(createProvider(connection), context, async () => {
        throw new Error("callback should not run");
      }),
    (error) => error === beginError,
  );
  assert.deepEqual(
    connection.calls.map((call) => call.sql),
    ["BEGIN", "RELEASE"],
  );
}

async function assertTransactionSetConfigFailureRollsBack() {
  const setConfigError = new Error("set_config failed");
  const connection = createMockConnection(new Map(), {
    failures: [{ match: "set_config", error: setConfigError }],
  });
  await assert.rejects(
    () =>
      withTenantTransaction(createProvider(connection), context, async () => {
        throw new Error("callback should not run");
      }),
    (error) => error === setConfigError,
  );
  assert.deepEqual(
    connection.calls.map((call) => call.sql),
    [
      "BEGIN",
      "SELECT set_config($1, $2, true), set_config($3, $4, true)",
      "ROLLBACK",
      "RELEASE",
    ],
  );
}

async function assertTransactionCommitFailureRollsBack() {
  const commitError = new Error("commit failed");
  const connection = createMockConnection(new Map(), {
    failures: [{ match: "COMMIT", error: commitError }],
  });
  await assert.rejects(
    () =>
      withTenantTransaction(createProvider(connection), context, async () => {
        await connection.query("SELECT business");
      }),
    (error) => error === commitError,
  );
  assert.deepEqual(
    connection.calls.map((call) => call.sql),
    [
      "BEGIN",
      "SELECT set_config($1, $2, true), set_config($3, $4, true)",
      "SELECT business",
      "COMMIT",
      "ROLLBACK",
      "RELEASE",
    ],
  );
}

async function assertRollbackFailureDoesNotMaskPrimaryError() {
  const original = new Error("callback failed");
  const connection = createMockConnection(new Map(), {
    failures: [{ match: "ROLLBACK", error: new Error("rollback failed") }],
  });
  await assert.rejects(
    () =>
      withTenantTransaction(createProvider(connection), context, async () => {
        throw original;
      }),
    (error) => error === original,
  );
  assert(connection.calls.some((call) => call.sql === "ROLLBACK"));
  assert(connection.released);
}

async function assertReleaseFailureDoesNotMaskPrimaryError() {
  const original = new Error("callback failed");
  const connection = createMockConnection(new Map(), {
    releaseError: new Error("release failed"),
  });
  await assert.rejects(
    () =>
      withTenantTransaction(createProvider(connection), context, async () => {
        throw original;
      }),
    (error) => error === original,
  );
  assert(connection.released);
}

async function assertReleaseFailureAfterSuccessIsReported() {
  const releaseError = new Error("release failed");
  const connection = createMockConnection(new Map(), { releaseError });
  await assert.rejects(
    () =>
      withTenantTransaction(createProvider(connection), context, async () => {
        await connection.query("SELECT business");
      }),
    (error) => error === releaseError,
  );
  assert.deepEqual(
    connection.calls.map((call) => call.sql),
    [
      "BEGIN",
      "SELECT set_config($1, $2, true), set_config($3, $4, true)",
      "SELECT business",
      "COMMIT",
      "RELEASE",
    ],
  );
}

async function assertTransactionRequiresFullContext() {
  const connection = createMockConnection();
  await assert.rejects(
    () =>
      withTenantTransaction(
        createProvider(connection),
        {
          scope: {
            workspaceId: scope.workspaceId,
            projectId: "",
            environment: scope.environment,
          },
          actorId: context.actorId,
        },
        async () => undefined,
      ),
    /projectId is required/,
  );
  await assert.rejects(
    () =>
      withTenantTransaction(
        createProvider(connection),
        {
          scope: {
            workspaceId: scope.workspaceId,
            projectId: scope.projectId,
            environment: "staging",
          },
          actorId: context.actorId,
        },
        async () => undefined,
      ),
    /environment must be development, test, or production/,
  );
}

async function assertIdempotencyRepositoryMapping() {
  const { connection, transaction } = createTransaction(
    new Map([
      [
        "app.ensure_idempotency_key",
        [
          {
            kind: "completed",
            response_digest: "sha256:response",
            resource_type: "audit",
            resource_id: "018f0000-0000-7000-8000-000000001951",
          },
        ],
      ],
    ]),
  );
  const repository = createIdempotencyRepository(transaction);
  const decision = await repository.ensure({
    operation: "publishDeployment",
    idempotencyKey: "idem-key",
    requestDigest: "sha256:request",
  });
  assert.deepEqual(decision, {
    kind: "completed",
    responseDigest: "sha256:response",
    resourceType: "audit",
    resourceId: "018f0000-0000-7000-8000-000000001951",
  });
  assert.deepEqual(connection.calls[0].params.slice(0, 6), [
    scope.workspaceId,
    scope.projectId,
    scope.environment,
    "publishDeployment",
    "idem-key",
    "sha256:request",
  ]);

  await repository.complete({
    operation: "publishDeployment",
    idempotencyKey: "idem-key",
    requestDigest: "sha256:request",
    responseDigest: "sha256:response",
    resourceType: "audit",
    resourceId: "018f0000-0000-7000-8000-000000001951",
  });
  assert(connection.calls[1].sql.includes("app.complete_idempotency_key"));
}

async function assertOutboxRepositoryMapping() {
  const { connection, transaction } = createTransaction(
    new Map([
      [
        "app.claim_outbox_events",
        [
          {
            id: "018f0000-0000-7000-8000-000000002001",
            workspace_id: scope.workspaceId,
            project_id: scope.projectId,
            environment: scope.environment,
            aggregate_type: "audit",
            aggregate_id: "018f0000-0000-7000-8000-000000001951",
            aggregate_revision: 1,
            event_type: "audit.created",
            event_version: 1,
            logical_event_key:
              "audit:018f0000-0000-7000-8000-000000001951:1:audit.created",
            payload: { ok: true },
            publish_attempts: 1,
            claim_token: "018f0000-0000-7000-8000-000000002101",
            claimed_by: "publisher-a",
            claim_expires_at: "2026-09-17T00:00:00.000Z",
          },
        ],
      ],
      ["app.consume_outbox_event", [{ consumed: true }]],
    ]),
  );
  const repository = createOutboxRepository(transaction);
  await repository.append({
    id: "018f0000-0000-7000-8000-000000002001",
    aggregateType: "audit",
    aggregateId: "018f0000-0000-7000-8000-000000001951",
    aggregateRevision: 1,
    eventType: "audit.created",
    eventVersion: 1,
    payload: { ok: true },
    idempotencyKey: "idem-key",
    requestDigest: "sha256:request",
  });
  assert.deepEqual(connection.calls[0].params.slice(1, 5), [
    scope.workspaceId,
    scope.projectId,
    scope.environment,
    "audit",
  ]);
  assert.equal(connection.calls[0].params.length, 12);
  assert(
    !connection.calls[0].params.includes(
      "audit:018f0000-0000-7000-8000-000000001951:1:audit.created",
    ),
  );

  const claimed = await repository.claim(5, "publisher-a", 30);
  assert.equal(claimed.length, 1);
  assert.deepEqual(connection.calls[1].params, [
    scope.projectId,
    scope.environment,
    5,
    "publisher-a",
    30,
  ]);

  await repository.markPublished(claimed[0].id, claimed[0].claim_token);
  assert.deepEqual(connection.calls[2].params, [
    scope.projectId,
    scope.environment,
    claimed[0].id,
    claimed[0].claim_token,
  ]);

  await repository.releaseOrRetry(
    claimed[0].id,
    claimed[0].claim_token,
    "2026-09-17T00:01:00.000Z",
  );
  assert.deepEqual(connection.calls[3].params.slice(0, 4), [
    scope.projectId,
    scope.environment,
    claimed[0].id,
    claimed[0].claim_token,
  ]);

  const consumed = await repository.consumeOnce("consumer-a", claimed[0].id);
  assert.equal(consumed, true);
  assert.deepEqual(connection.calls[4].params, [
    "consumer-a",
    claimed[0].id,
    scope.projectId,
    scope.environment,
  ]);
}

async function assertMultipartUploadRepositoryMapping() {
  const uploadUuid = "018f0000-0000-7000-8000-000000000601";
  const { connection, transaction } = createTransaction(
    new Map([
      [
        "FROM app.multipart_uploads",
        [
          {
            id: uploadUuid,
            draft_id: "018f0000-0000-7000-8000-000000000501",
            data_source_id: "018f0000-0000-7000-8000-000000000301",
            data_version_id: "018f0000-0000-7000-8000-000000000401",
            status: "uploading",
            object_key:
              "workspace/ws_018f0000-0000-7000-8000-000000000001/project/prj_018f0000-0000-7000-8000-000000000201/environment/production/draft/drf_018f0000-0000-7000-8000-000000000501/upload/upl_018f0000-0000-7000-8000-000000000601/source.bin",
            storage_upload_id: "minio-upload-id",
            declared_file_name: "guide.pdf",
            declared_size_bytes: 12,
            server_size_bytes: null,
            server_checksum_sha256: null,
            expires_at: "2026-09-20T01:00:00.000Z",
            revision: 1,
          },
        ],
      ],
      [
        "FROM app.multipart_upload_parts",
        [
          {
            part_number: 1,
            size_bytes: 12,
            checksum_sha256:
              "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            etag: "etag-1",
            confirmed_at: "2026-09-20T00:00:00.000Z",
          },
        ],
      ],
    ]),
  );
  const repository = createMultipartUploadRepository(transaction);
  const result = await repository.getActive({
    scope: {
      workspaceId: "ws_018f0000-0000-7000-8000-000000000001",
      projectId: "prj_018f0000-0000-7000-8000-000000000201",
      environment: "production",
    },
    uploadId: `upl_${uploadUuid}`,
    now: "2026-09-20T00:30:00.000Z",
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.uploadId, `upl_${uploadUuid}`);
  assert.equal(result.value.parts[0].partNumber, 1);
  assert.deepEqual(connection.calls[0].params, [
    scope.workspaceId,
    scope.projectId,
    scope.environment,
    uploadUuid,
  ]);
}

async function assertMemberRoleChangeRepositoryMapping() {
  const workspaceUuid = "018f0000-0000-7000-8000-000000000001";
  const projectUuid = "018f0000-0000-7000-8000-000000000201";
  const actorUuid = "018f0000-0000-7000-8000-000000000101";
  const targetUuid = "018f0000-0000-7000-8000-000000000103";
  const connection = createMockConnection(
    new Map([
      [
        "app.change_member_role_and_record_audit",
        [
          {
            kind: "changed",
            previous_role: "editor",
            next_role: "observer",
            revision: "2",
          },
        ],
      ],
    ]),
  );
  const repository = createPostgresMemberRoleChangeRepository(
    createProvider(connection),
  );

  const result = await repository.changeMemberRoleAndRecordAudit({
    actorId: `usr_${actorUuid}`,
    targetActorId: `usr_${targetUuid}`,
    scope: {
      kind: "project",
      workspaceId: `ws_${workspaceUuid}`,
      projectId: `prj_${projectUuid}`,
    },
    nextRole: "observer",
    authorization: {
      actorId: `usr_${actorUuid}`,
      scope: {
        kind: "project",
        workspaceId: `ws_${workspaceUuid}`,
        projectId: `prj_${projectUuid}`,
      },
      nextRole: "observer",
      manageExistingOwner: false,
    },
    occurredAt: "2026-09-18T00:00:00.000Z",
  });

  assert.deepEqual(result, {
    kind: "changed",
    previousRole: "editor",
    nextRole: "observer",
    revision: 2,
  });
  assert.deepEqual(
    connection.calls.map((call) => call.sql),
    [
      "BEGIN",
      "SELECT set_config($1, $2, true), set_config($3, $4, true)",
      "SELECT kind, previous_role::text AS previous_role, next_role::text AS next_role, revision FROM app.change_member_role_and_record_audit( $1::app.member_role_change_scope, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::app.member_role, $7::boolean, $8::timestamptz, $9::uuid )",
      "COMMIT",
      "RELEASE",
    ],
  );
  assert.deepEqual(connection.calls[1].params, [
    "app.workspace_id",
    workspaceUuid,
    "app.actor_id",
    actorUuid,
  ]);
  assert.deepEqual(connection.calls[2].params.slice(0, 8), [
    "project",
    workspaceUuid,
    projectUuid,
    actorUuid,
    targetUuid,
    "observer",
    false,
    "2026-09-18T00:00:00.000Z",
  ]);
  assert.equal(typeof connection.calls[2].params[8], "string");
}

async function assertMemberRoleChangeRepositoryPreCommitValidation() {
  const invalidCases = [
    {
      label: "malformed changed row",
      rows: [
        {
          kind: "changed",
          previous_role: "synthetic-invalid",
          next_role: "observer",
          revision: "2",
        },
      ],
      message: /invalid result/,
    },
    {
      label: "illegal next role",
      rows: [
        {
          kind: "changed",
          previous_role: "editor",
          next_role: "synthetic-invalid",
          revision: "2",
        },
      ],
      message: /invalid result/,
    },
    {
      label: "unsafe revision",
      rows: [
        {
          kind: "changed",
          previous_role: "editor",
          next_role: "observer",
          revision: "9007199254740992",
        },
      ],
      message: /invalid result/,
    },
    {
      label: "multi row result",
      rows: [
        {
          kind: "changed",
          previous_role: "editor",
          next_role: "observer",
          revision: "2",
        },
        {
          kind: "changed",
          previous_role: "editor",
          next_role: "observer",
          revision: "3",
        },
      ],
      message: /invalid row count/,
    },
    {
      label: "empty result",
      rows: [],
      message: /invalid row count/,
    },
    {
      label: "denied with data fields",
      rows: [
        {
          kind: "not_found_or_forbidden",
          previous_role: "editor",
          next_role: null,
          revision: null,
        },
      ],
      message: /denied result returned data fields/,
    },
    {
      label: "conflict with data fields",
      rows: [
        {
          kind: "last_owner_conflict",
          previous_role: null,
          next_role: "owner",
          revision: null,
        },
      ],
      message: /conflict result returned data fields/,
    },
    {
      label: "unknown kind",
      rows: [
        {
          kind: "synthetic",
          previous_role: null,
          next_role: null,
          revision: null,
        },
      ],
      message: /unknown result kind/,
    },
  ];

  for (const testCase of invalidCases) {
    const connection = memberRoleConnection(testCase.rows);
    const repository = createPostgresMemberRoleChangeRepository(
      createProvider(connection),
    );
    await assert.rejects(
      () => repository.changeMemberRoleAndRecordAudit(memberRoleInput()),
      testCase.message,
      testCase.label,
    );
    assert(!connection.calls.some((call) => call.sql === "COMMIT"));
    assert(connection.calls.some((call) => call.sql === "ROLLBACK"));
  }

  const commitError = new Error("synthetic commit failed");
  const commitFailure = memberRoleConnection(
    [
      {
        kind: "changed",
        previous_role: "editor",
        next_role: "observer",
        revision: "2",
      },
    ],
    { failures: [{ match: "COMMIT", error: commitError }] },
  );
  await assert.rejects(
    () =>
      createPostgresMemberRoleChangeRepository(
        createProvider(commitFailure),
      ).changeMemberRoleAndRecordAudit(memberRoleInput()),
    (error) => error === commitError,
  );
  assert(commitFailure.calls.some((call) => call.sql === "ROLLBACK"));

  const queryError = new Error("synthetic query failed");
  const queryAndReleaseFailure = createMockConnection(new Map(), {
    failures: [
      {
        match: "app.change_member_role_and_record_audit",
        error: queryError,
      },
    ],
    releaseError: new Error("synthetic release failed"),
  });
  await assert.rejects(
    () =>
      createPostgresMemberRoleChangeRepository(
        createProvider(queryAndReleaseFailure),
      ).changeMemberRoleAndRecordAudit(memberRoleInput()),
    (error) => error === queryError,
  );
  assert(queryAndReleaseFailure.calls.some((call) => call.sql === "ROLLBACK"));

  for (const rows of [
    [
      {
        kind: "changed",
        previous_role: "editor",
        next_role: "observer",
        revision: "2",
      },
    ],
    [
      {
        kind: "not_found_or_forbidden",
        previous_role: null,
        next_role: null,
        revision: null,
      },
    ],
    [
      {
        kind: "last_owner_conflict",
        previous_role: null,
        next_role: null,
        revision: null,
      },
    ],
  ]) {
    const connection = memberRoleConnection(rows);
    await createPostgresMemberRoleChangeRepository(
      createProvider(connection),
    ).changeMemberRoleAndRecordAudit(memberRoleInput());
    assert.equal(
      connection.calls.filter((call) => call.sql === "COMMIT").length,
      1,
    );
    assert(!connection.calls.some((call) => call.sql === "ROLLBACK"));
  }
}

function memberRoleConnection(rows, behavior) {
  return createMockConnection(
    new Map([["app.change_member_role_and_record_audit", rows]]),
    behavior,
  );
}

function memberRoleInput() {
  const workspaceUuid = "018f0000-0000-7000-8000-000000000001";
  const actorUuid = "018f0000-0000-7000-8000-000000000101";
  const targetUuid = "018f0000-0000-7000-8000-000000000103";
  return {
    actorId: `usr_${actorUuid}`,
    targetActorId: `usr_${targetUuid}`,
    scope: {
      kind: "workspace",
      workspaceId: `ws_${workspaceUuid}`,
    },
    nextRole: "observer",
    authorization: {
      actorId: `usr_${actorUuid}`,
      scope: {
        kind: "workspace",
        workspaceId: `ws_${workspaceUuid}`,
      },
      nextRole: "observer",
      manageExistingOwner: false,
    },
    occurredAt: "2026-09-18T00:00:00.000Z",
  };
}

function assertRepositorySupportFactory() {
  const { transaction } = createTransaction();
  const adapters = createRepositorySupportAdapters(transaction);
  assert.equal(typeof adapters.idempotency.ensure, "function");
  assert.equal(typeof adapters.outbox.claim, "function");
  assert.equal(typeof adapters.multipartUploads.create, "function");
}

function normalizeSql(sql) {
  return sql.trim().replace(/\s+/g, " ");
}

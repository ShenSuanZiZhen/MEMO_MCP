import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import {
  applySqlFile,
  databaseUrlFromEnv,
  execSql,
  fixturesDir,
  packageRoot,
  queryScalar,
  quoteIdentifier,
} from "./database-lib.mjs";

const workspaceA = "018f0000-0000-7000-8000-000000000001";
const workspaceB = "018f0000-0000-7000-8000-000000000002";
const actorA = "018f0000-0000-7000-8000-000000000101";
const actorB = "018f0000-0000-7000-8000-000000000102";
const actorC = "018f0000-0000-7000-8000-000000000103";
const projectA = "018f0000-0000-7000-8000-000000000201";
const projectB = "018f0000-0000-7000-8000-000000000202";
const dataSourceA = "018f0000-0000-7000-8000-000000000301";
const dataSourceB = "018f0000-0000-7000-8000-000000000302";
const dataSourceATest = "018f0000-0000-7000-8000-000000000303";
const draftA = "018f0000-0000-7000-8000-000000000501";
const draftB = "018f0000-0000-7000-8000-000000000502";
const serviceA = "018f0000-0000-7000-8000-000000001001";
const moduleVersionA = "018f0000-0000-7000-8000-000000001101";
const definitionA = "018f0000-0000-7000-8000-000000001201";
const candidateA = "018f0000-0000-7000-8000-000000001301";
const serviceVersionA = "018f0000-0000-7000-8000-000000001501";
const deploymentA = "018f0000-0000-7000-8000-000000001601";
const accessPolicyA = "018f0000-0000-7000-8000-000000001701";
const credentialA = "018f0000-0000-7000-8000-000000001803";
const releaseOpsSchemaPath = join(
  packageRoot,
  "..",
  "contracts",
  "openapi",
  "release-ops.v1.json",
);
const maxSafeInteger = "9007199254740991";
const aboveMaxSafeInteger = "9007199254740992";
let uuidCounter = 100000;
let digestCounter = 2000;
let releaseCounter = 10;
const matrixStats = {
  total: 0,
  allowed: 0,
  rejected: 0,
};
const uuidV7ForTest =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const tenantTables = [
  "workspaces",
  "workspace_members",
  "projects",
  "project_members",
  "data_sources",
  "data_versions",
  "drafts",
  "draft_revisions",
  "services",
  "service_definitions",
  "definition_modules",
  "candidates",
  "test_runs",
  "test_cases",
  "service_versions",
  "deployments",
  "deployment_events",
  "access_policies",
  "policy_versions",
  "credentials",
  "credential_secrets",
  "credential_rotations",
  "request_traces",
  "usage_events",
  "quota_buckets",
  "audit_events",
  "idempotency_records",
  "outbox_events",
  "outbox_consumptions",
];

const platformTables = ["modules", "module_versions"];

const databaseUrl = databaseUrlFromEnv();
const runtimeRole = process.env.WP02B_RUNTIME_ROLE;
if (!runtimeRole) {
  throw new Error("WP02B_RUNTIME_ROLE is required");
}

applySqlFile(databaseUrl, join(fixturesDir, "tenant-core.sql"));

assertRlsEnabledAndForced();
assertTenantTableCounts();
assertMissingContextFailsClosed();
assertTransactionLocalContextDoesNotLeak();
assertCrossTenantIsolation();
assertTenantForeignKeys();
assertRevisionRules();
assertDataVersionRules();
assertReleaseOpsRulesV2();
await assertRepositoryOutboxRules();
assertUtcTimestamps();
assertUuidV7Rules();
assertOpaqueIdMapping();
assertIndexes();

console.log("tenant-core database verification passed");

function runtimePrefix() {
  return `SET ROLE ${quoteIdentifier(runtimeRole)};`;
}

function scopedBlock({ workspaceId, actorId, sql, timeZone }) {
  const settings = [];
  if (timeZone) {
    settings.push(`SET LOCAL TIME ZONE '${timeZone}';`);
  }
  if (workspaceId) {
    settings.push(`SET LOCAL app.workspace_id = '${workspaceId}';`);
  }
  if (actorId) {
    settings.push(`SET LOCAL app.actor_id = '${actorId}';`);
  }
  return `
    ${runtimePrefix()}
    BEGIN;
    ${settings.join("\n")}
    ${sql}
    COMMIT;
  `;
}

function scopedScalar({ workspaceId, actorId, sql, timeZone }) {
  return queryScalar(
    databaseUrl,
    scopedBlock({ workspaceId, actorId, sql, timeZone }),
  );
}

function scopedCommand({
  workspaceId,
  actorId,
  sql,
  timeZone,
  allowFailure = false,
}) {
  return execSql(
    databaseUrl,
    scopedBlock({ workspaceId, actorId, sql, timeZone }),
    { allowFailure },
  );
}

function adminCommand(sql, allowFailure = false) {
  return execSql(databaseUrl, sql, { allowFailure });
}

function assertRlsEnabledAndForced() {
  const result = queryScalar(
    databaseUrl,
    `
      SELECT count(*)
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app'
        AND c.relname = ANY(ARRAY[${tenantTables.map((table) => `'${table}'`).join(", ")}])
        AND c.relrowsecurity
        AND c.relforcerowsecurity
    `,
  );
  assertEquals(
    "all tenant tables enable and force RLS",
    result,
    `${tenantTables.length}`,
  );
  const platformResult = queryScalar(
    databaseUrl,
    `
      SELECT count(*)
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app'
        AND c.relname = ANY(ARRAY[${platformTables.map((table) => `'${table}'`).join(", ")}])
        AND c.relrowsecurity
        AND c.relforcerowsecurity
    `,
  );
  assertEquals(
    "all platform tables enable and force RLS",
    platformResult,
    `${platformTables.length}`,
  );
}

function assertTenantTableCounts() {
  assertEquals(
    "workspace A same-name project count",
    scopedScalar({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: "SELECT count(*) FROM app.projects WHERE slug = 'knowledge-base';",
    }),
    "1",
  );
  assertEquals(
    "workspace B same-name project count",
    scopedScalar({
      workspaceId: workspaceB,
      actorId: actorB,
      sql: "SELECT count(*) FROM app.projects WHERE slug = 'knowledge-base';",
    }),
    "1",
  );
  assertEquals(
    "workspace A same-name data source count",
    scopedScalar({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: "SELECT count(*) FROM app.data_sources WHERE slug = 'support-docs' AND environment = 'production';",
    }),
    "1",
  );
  assertEquals(
    "workspace B same-name data source count",
    scopedScalar({
      workspaceId: workspaceB,
      actorId: actorB,
      sql: "SELECT count(*) FROM app.data_sources WHERE slug = 'support-docs' AND environment = 'production';",
    }),
    "1",
  );
  assertEquals(
    "workspace A same-name draft count",
    scopedScalar({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: "SELECT count(*) FROM app.drafts WHERE title = 'Default Draft';",
    }),
    "1",
  );
  assertEquals(
    "workspace B same-name draft count",
    scopedScalar({
      workspaceId: workspaceB,
      actorId: actorB,
      sql: "SELECT count(*) FROM app.drafts WHERE title = 'Default Draft';",
    }),
    "1",
  );
  assertEquals(
    "workspace A service version count",
    scopedScalar({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `SELECT count(*) FROM app.service_versions WHERE service_id = '${serviceA}';`,
    }),
    "1",
  );
  assertEquals(
    "workspace A credential count",
    scopedScalar({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `SELECT count(*) FROM app.credentials WHERE id = '${credentialA}';`,
    }),
    "1",
  );
}

function assertMissingContextFailsClosed() {
  for (const context of [
    { label: "workspace without actor", workspaceId: workspaceA },
    { label: "actor without workspace", actorId: actorA },
    { label: "no workspace and no actor" },
  ]) {
    for (const table of tenantTables) {
      assertEquals(
        `${context.label} reads zero rows from ${table}`,
        scopedScalar({
          workspaceId: context.workspaceId,
          actorId: context.actorId,
          sql: `SELECT count(*) FROM app.${table};`,
        }),
        "0",
      );
    }

    const insertWorkspaceId =
      context.workspaceId ?? "018f0000-0000-7000-8000-000000000901";
    expectFailure(
      `${context.label} cannot write tenant rows`,
      scopedCommand({
        workspaceId: context.workspaceId,
        actorId: context.actorId,
        sql: `
          INSERT INTO app.workspaces (
            id,
            slug,
            kind,
            revision,
            display_name,
            region
          )
          VALUES (
            '${insertWorkspaceId}',
            'blocked-write-${context.label.replaceAll(" ", "-")}',
            'team',
            1,
            'Blocked Write',
            'us-east-1'
          );
        `,
        allowFailure: true,
      }),
      "violates row-level security policy",
    );
  }
}

function assertTransactionLocalContextDoesNotLeak() {
  const output = queryScalar(
    databaseUrl,
    `
      ${runtimePrefix()}
      BEGIN;
      SET LOCAL app.workspace_id = '${workspaceA}';
      SET LOCAL app.actor_id = '${actorA}';
      SELECT count(*) FROM app.projects;
      COMMIT;
      BEGIN;
      SELECT count(*) FROM app.projects;
      COMMIT;
    `,
  );
  assertEquals("SET LOCAL context does not leak after COMMIT", output, "1\n0");
}

function assertCrossTenantIsolation() {
  assertEquals(
    "workspace A cannot read workspace B guessed project ID",
    scopedScalar({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `SELECT count(*) FROM app.projects WHERE id = '${projectB}';`,
    }),
    "0",
  );
  assertEquals(
    "workspace A cannot update workspace B guessed project ID",
    scopedScalar({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        WITH updated AS (
          UPDATE app.projects
          SET display_name = 'Blocked Update'
          WHERE id = '${projectB}'
          RETURNING 1
        )
        SELECT count(*) FROM updated;
      `,
    }),
    "0",
  );
  assertEquals(
    "workspace A cannot delete workspace B guessed project ID",
    scopedScalar({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        WITH deleted AS (
          DELETE FROM app.projects
          WHERE id = '${projectB}'
          RETURNING 1
        )
        SELECT count(*) FROM deleted;
      `,
    }),
    "0",
  );
  expectFailure(
    "workspace A cannot insert workspace B data source",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        INSERT INTO app.data_sources (
          id,
          workspace_id,
          project_id,
          environment,
          slug,
          display_name,
          kind,
          sensitivity,
          rights,
          version_strategy,
          state,
          revision,
          created_by
        )
        VALUES (
          '018f0000-0000-7000-8000-000000000701',
          '${workspaceB}',
          '${projectB}',
          'production',
          'blocked-insert',
          'Blocked Insert',
          'file_upload',
          'internal',
          'synthetic_fixture_rights',
          'fixed',
          'active',
          1,
          '${actorB}'
        );
      `,
      allowFailure: true,
    }),
    "violates row-level security policy",
  );
}

function assertTenantForeignKeys() {
  expectFailure(
    "cross-tenant data version/data source FK is rejected",
    insertDataVersion({
      id: "018f0000-0000-7000-8000-000000000601",
      workspaceId: workspaceA,
      projectId: projectA,
      environment: "production",
      dataSourceId: dataSourceB,
      status: "completed",
      processingStage: "completed",
      revision: "1",
      contentDigest:
        "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      createdBy: actorA,
      completedAt: "CURRENT_TIMESTAMP",
      allowFailure: true,
    }),
    "violates foreign key constraint",
  );
  expectFailure(
    "cross-environment data version/data source FK is rejected",
    insertDataVersion({
      id: "018f0000-0000-7000-8000-000000000602",
      workspaceId: workspaceA,
      projectId: projectA,
      environment: "production",
      dataSourceId: dataSourceATest,
      status: "completed",
      processingStage: "completed",
      revision: "1",
      contentDigest:
        "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      createdBy: actorA,
      completedAt: "CURRENT_TIMESTAMP",
      allowFailure: true,
    }),
    "violates foreign key constraint",
  );
}

function assertRevisionRules() {
  for (const [label, revision] of [
    ["workspace revision zero", "0"],
    ["workspace revision negative", "-1"],
    ["workspace revision above max safe integer", aboveMaxSafeInteger],
  ]) {
    expectFailure(
      `${label} is rejected`,
      adminCommand(
        `
          INSERT INTO app.workspaces (
            id,
            slug,
            kind,
            revision,
            display_name,
            region
          )
          VALUES (
            '${nextUuid()}',
            'bad-workspace-revision-${revision.replace("-", "neg")}',
            'team',
            ${revision},
            'Bad Workspace Revision',
            'us-east-1'
          );
        `,
        true,
      ),
      "violates check constraint",
    );
  }

  expectFailure(
    "workspace revision jump to 99 is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `UPDATE app.workspaces SET revision = 99 WHERE id = '${workspaceA}';`,
      allowFailure: true,
    }),
    "revision must increment by exactly 1",
  );
  scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: `UPDATE app.workspaces SET revision = 2 WHERE id = '${workspaceA}';`,
  });
  console.log("PASS workspace revision exact +1 update succeeds");
  expectFailure(
    "workspace revision rollback is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `UPDATE app.workspaces SET revision = 1 WHERE id = '${workspaceA}';`,
      allowFailure: true,
    }),
    "revision must increment by exactly 1",
  );

  expectFailure(
    "project revision jump to 99 is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `UPDATE app.projects SET revision = 99 WHERE id = '${projectA}';`,
      allowFailure: true,
    }),
    "revision must increment by exactly 1",
  );
  scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: `UPDATE app.projects SET revision = 2 WHERE id = '${projectA}';`,
  });
  console.log("PASS project revision exact +1 update succeeds");
  expectFailure(
    "project revision unchanged is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `UPDATE app.projects SET revision = 2 WHERE id = '${projectA}';`,
      allowFailure: true,
    }),
    "revision must increment by exactly 1",
  );

  for (const [label, revision] of [
    ["data source revision zero", "0"],
    ["data source revision negative", "-1"],
    ["data source revision above max safe integer", aboveMaxSafeInteger],
  ]) {
    expectFailure(
      `${label} is rejected`,
      insertDataSource({
        id: nextUuid(),
        slug: `bad-revision-${revision.replace("-", "neg")}`,
        revision,
        allowFailure: true,
      }),
      "violates check constraint",
    );
  }

  insertDataSource({
    id: "018f0000-0000-7000-8000-000000000711",
    slug: "max-safe-revision",
    revision: maxSafeInteger,
  });
  console.log("PASS MAX_SAFE_INTEGER revision can be stored");
  expectFailure(
    "revision beyond MAX_SAFE_INTEGER is rejected on update",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.data_sources
        SET revision = ${aboveMaxSafeInteger}
        WHERE id = '018f0000-0000-7000-8000-000000000711';
      `,
      allowFailure: true,
    }),
    "violates check constraint",
  );

  expectFailure(
    "data source revision jump is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `UPDATE app.data_sources SET revision = 3 WHERE id = '${dataSourceA}';`,
      allowFailure: true,
    }),
    "revision must increment by exactly 1",
  );
  scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: `UPDATE app.data_sources SET revision = 2 WHERE id = '${dataSourceA}';`,
  });
  console.log("PASS data source revision exact +1 update succeeds");
  expectFailure(
    "data source revision rollback is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `UPDATE app.data_sources SET revision = 1 WHERE id = '${dataSourceA}';`,
      allowFailure: true,
    }),
    "revision must increment by exactly 1",
  );

  for (const [label, revision] of [
    ["draft revision zero", "0"],
    ["draft revision negative", "-1"],
    ["draft revision above max safe integer", aboveMaxSafeInteger],
  ]) {
    expectFailure(
      `${label} is rejected`,
      insertDraft({
        id: nextUuid(),
        title: `Bad Draft ${revision}`,
        revision,
        allowFailure: true,
      }),
      "violates check constraint",
    );
  }

  expectFailure(
    "draft revision jump is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `UPDATE app.drafts SET revision = 3 WHERE id = '${draftA}';`,
      allowFailure: true,
    }),
    "revision must increment by exactly 1",
  );

  const draftRevisionProbe = "018f0000-0000-7000-8000-000000000721";
  createDraftWithRevision({
    id: draftRevisionProbe,
    title: "Revision Probe Draft",
    document: '{"goal":"revision probe"}',
  });
  scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: `
      UPDATE app.drafts
      SET
        revision = 2,
        document = '{"goal":"revision probe","autosaved":true}'
      WHERE id = '${draftRevisionProbe}';
      INSERT INTO app.draft_revisions (
        workspace_id,
        project_id,
        environment,
        draft_id,
        revision,
        document,
        changed_by
      )
      VALUES (
        '${workspaceA}',
        '${projectA}',
        'production',
        '${draftRevisionProbe}',
        2,
        '{"goal":"revision probe","autosaved":true}',
        '${actorA}'
      );
    `,
  });
  console.log(
    "PASS draft revision exact +1 update with matching history succeeds",
  );
  expectFailure(
    "draft revision rollback is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `UPDATE app.drafts SET revision = 1 WHERE id = '${draftRevisionProbe}';`,
      allowFailure: true,
    }),
    "revision must increment by exactly 1",
  );
  expectFailure(
    "draft revision cannot get ahead of draft",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        INSERT INTO app.draft_revisions (
          workspace_id,
          project_id,
          environment,
          draft_id,
          revision,
          document,
          changed_by
        )
        VALUES (
          '${workspaceA}',
          '${projectA}',
          'production',
          '${draftA}',
          2,
          '{"goal":"support lookup"}',
          '${actorA}'
        );
      `,
      allowFailure: true,
    }),
    "draft revision must equal current draft revision",
  );

  const draftMissingRevision = "018f0000-0000-7000-8000-000000000722";
  createDraftWithRevision({
    id: draftMissingRevision,
    title: "Missing Revision Draft",
    document: '{"goal":"missing revision"}',
  });
  expectFailure(
    "draft update without matching draft revision is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.drafts
        SET
          revision = 2,
          document = '{"goal":"missing revision","autosaved":true}'
        WHERE id = '${draftMissingRevision}';
      `,
      allowFailure: true,
    }),
    "draft must have matching draft revision before commit",
  );

  const draftDocumentMismatch = "018f0000-0000-7000-8000-000000000723";
  createDraftWithRevision({
    id: draftDocumentMismatch,
    title: "Document Mismatch Draft",
    document: '{"goal":"document mismatch"}',
  });
  expectFailure(
    "draft revision document mismatch is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.drafts
        SET
          revision = 2,
          document = '{"goal":"document mismatch","autosaved":true}'
        WHERE id = '${draftDocumentMismatch}';
        INSERT INTO app.draft_revisions (
          workspace_id,
          project_id,
          environment,
          draft_id,
          revision,
          document,
          changed_by
        )
        VALUES (
          '${workspaceA}',
          '${projectA}',
          'production',
          '${draftDocumentMismatch}',
          2,
          '{"goal":"different"}',
          '${actorA}'
        );
      `,
      allowFailure: true,
    }),
    "draft revision document must match draft document",
  );

  const draftChangedByMismatch = "018f0000-0000-7000-8000-000000000724";
  createDraftWithRevision({
    id: draftChangedByMismatch,
    title: "Changed By Mismatch Draft",
    document: '{"goal":"changed by mismatch"}',
  });
  expectFailure(
    "draft revision changed_by mismatch is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.drafts
        SET
          revision = 2,
          document = '{"goal":"changed by mismatch","autosaved":true}'
        WHERE id = '${draftChangedByMismatch}';
        INSERT INTO app.draft_revisions (
          workspace_id,
          project_id,
          environment,
          draft_id,
          revision,
          document,
          changed_by
        )
        VALUES (
          '${workspaceA}',
          '${projectA}',
          'production',
          '${draftChangedByMismatch}',
          2,
          '{"goal":"changed by mismatch","autosaved":true}',
          '${actorC}'
        );
      `,
      allowFailure: true,
    }),
    "draft revision changed_by must match draft updated_by",
  );

  const draftInvalidUpdater = "018f0000-0000-7000-8000-000000000727";
  createDraftWithRevision({
    id: draftInvalidUpdater,
    title: "Invalid Updater Draft",
    document: '{"goal":"invalid updater"}',
  });
  expectFailure(
    "draft updated_by must be a project member in scope",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.drafts
        SET
          revision = 2,
          updated_by = '${actorB}',
          document = '{"goal":"invalid updater","autosaved":true}'
        WHERE id = '${draftInvalidUpdater}';
        INSERT INTO app.draft_revisions (
          workspace_id,
          project_id,
          environment,
          draft_id,
          revision,
          document,
          changed_by
        )
        VALUES (
          '${workspaceA}',
          '${projectA}',
          'production',
          '${draftInvalidUpdater}',
          2,
          '{"goal":"invalid updater","autosaved":true}',
          '${actorB}'
        );
      `,
      allowFailure: true,
    }),
    "violates foreign key constraint",
  );

  expectFailure(
    "draft revisions are unique per scope/draft/revision",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        INSERT INTO app.draft_revisions (
          workspace_id,
          project_id,
          environment,
          draft_id,
          revision,
          document,
          changed_by
        )
        VALUES (
          '${workspaceA}',
          '${projectA}',
          'production',
          '${draftRevisionProbe}',
          2,
          '{"goal":"revision probe","autosaved":true}',
          '${actorA}'
        );
      `,
      allowFailure: true,
    }),
    "duplicate key value violates unique constraint",
  );

  const draftInvalidStateProbe = "018f0000-0000-7000-8000-000000000726";
  createDraftWithRevision({
    id: draftInvalidStateProbe,
    title: "Invalid State Probe Draft",
    document: '{"goal":"invalid state probe"}',
  });
  expectFailure(
    "draft cannot skip from editing to ready",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.drafts
        SET state = 'ready', revision = 2
        WHERE id = '${draftInvalidStateProbe}';
      `,
      allowFailure: true,
    }),
    "invalid draft state transition",
  );

  const draftSubmittedProbe = "018f0000-0000-7000-8000-000000000725";
  createDraftWithRevision({
    id: draftSubmittedProbe,
    title: "Submitted Probe Draft",
    document: '{"goal":"submitted probe"}',
  });
  advanceDraftToSubmitted(draftSubmittedProbe);
  expectFailure(
    "submitted draft cannot transition back to editing",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.drafts
        SET state = 'editing', revision = 7
        WHERE id = '${draftSubmittedProbe}';
      `,
      allowFailure: true,
    }),
    "submitted draft is immutable",
  );
  expectFailure(
    "submitted draft title update is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.drafts
        SET title = 'Changed After Submit', revision = 7
        WHERE id = '${draftSubmittedProbe}';
      `,
      allowFailure: true,
    }),
    "submitted draft is immutable",
  );
  expectFailure(
    "submitted draft source_version_id update is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.drafts
        SET
          source_version_id = '018f0000-0000-7000-8000-000000000401',
          revision = 7
        WHERE id = '${draftSubmittedProbe}';
      `,
      allowFailure: true,
    }),
    "submitted draft is immutable",
  );
  expectFailure(
    "submitted draft revision-only update with matching revision is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.drafts
        SET revision = 7
        WHERE id = '${draftSubmittedProbe}';
        INSERT INTO app.draft_revisions (
          workspace_id,
          project_id,
          environment,
          draft_id,
          revision,
          document,
          changed_by
        )
        SELECT
          workspace_id,
          project_id,
          environment,
          id,
          revision,
          document,
          updated_by
        FROM app.drafts
        WHERE id = '${draftSubmittedProbe}';
      `,
      allowFailure: true,
    }),
    "submitted draft is immutable",
  );
  assertSubmittedDraftIntact(draftSubmittedProbe);
  expectFailure(
    "submitted draft updated_by update with matching revision is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.drafts
        SET
          revision = 7,
          updated_by = '${actorC}'
        WHERE id = '${draftSubmittedProbe}';
        INSERT INTO app.draft_revisions (
          workspace_id,
          project_id,
          environment,
          draft_id,
          revision,
          document,
          changed_by
        )
        SELECT
          workspace_id,
          project_id,
          environment,
          id,
          revision,
          document,
          updated_by
        FROM app.drafts
        WHERE id = '${draftSubmittedProbe}';
      `,
      allowFailure: true,
    }),
    "submitted draft is immutable",
  );
  assertSubmittedDraftIntact(draftSubmittedProbe);
  expectFailure(
    "submitted draft no-op update is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.drafts
        SET revision = revision
        WHERE id = '${draftSubmittedProbe}';
      `,
      allowFailure: true,
    }),
    "submitted draft is immutable",
  );
}

function assertDataVersionRules() {
  expectFailure(
    "completed data version requires content_digest",
    insertDataVersion({
      id: "018f0000-0000-7000-8000-000000000801",
      workspaceId: workspaceA,
      projectId: projectA,
      environment: "production",
      dataSourceId: dataSourceA,
      status: "completed",
      processingStage: "completed",
      revision: "1",
      createdBy: actorA,
      completedAt: "CURRENT_TIMESTAMP",
      allowFailure: true,
    }),
    "violates check constraint",
  );
  expectFailure(
    "completed data version requires completed_at",
    insertDataVersion({
      id: "018f0000-0000-7000-8000-000000000803",
      workspaceId: workspaceA,
      projectId: projectA,
      environment: "production",
      dataSourceId: dataSourceA,
      status: "completed",
      processingStage: "completed",
      revision: "1",
      contentDigest:
        "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      createdBy: actorA,
      allowFailure: true,
    }),
    "violates check constraint",
  );
  expectFailure(
    "created data version cannot use completed processing stage",
    insertDataVersion({
      id: "018f0000-0000-7000-8000-000000000804",
      workspaceId: workspaceA,
      projectId: projectA,
      environment: "production",
      dataSourceId: dataSourceA,
      status: "created",
      processingStage: "completed",
      revision: "1",
      createdBy: actorA,
      allowFailure: true,
    }),
    "violates check constraint",
  );
  expectFailure(
    "created data version cannot set completed_at",
    insertDataVersion({
      id: "018f0000-0000-7000-8000-000000000805",
      workspaceId: workspaceA,
      projectId: projectA,
      environment: "production",
      dataSourceId: dataSourceA,
      status: "created",
      processingStage: "upload",
      revision: "1",
      createdBy: actorA,
      completedAt: "CURRENT_TIMESTAMP",
      allowFailure: true,
    }),
    "violates check constraint",
  );
  expectFailure(
    "completed data version cannot use index processing stage",
    insertDataVersion({
      id: "018f0000-0000-7000-8000-000000000806",
      workspaceId: workspaceA,
      projectId: projectA,
      environment: "production",
      dataSourceId: dataSourceA,
      status: "completed",
      processingStage: "index",
      revision: "1",
      contentDigest:
        "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      createdBy: actorA,
      completedAt: "CURRENT_TIMESTAMP",
      allowFailure: true,
    }),
    "violates check constraint",
  );
  expectFailure(
    "processing data version cannot use completed processing stage",
    insertDataVersion({
      id: "018f0000-0000-7000-8000-000000000807",
      workspaceId: workspaceA,
      projectId: projectA,
      environment: "production",
      dataSourceId: dataSourceA,
      status: "processing",
      processingStage: "completed",
      revision: "1",
      createdBy: actorA,
      allowFailure: true,
    }),
    "violates check constraint",
  );
  expectFailure(
    "failed data version cannot set completed_at",
    insertDataVersion({
      id: "018f0000-0000-7000-8000-000000000808",
      workspaceId: workspaceA,
      projectId: projectA,
      environment: "production",
      dataSourceId: dataSourceA,
      status: "failed",
      processingStage: "index",
      revision: "1",
      createdBy: actorA,
      completedAt: "CURRENT_TIMESTAMP",
      allowFailure: true,
    }),
    "violates check constraint",
  );
  expectFailure(
    "failed data version cannot use completed processing stage",
    insertDataVersion({
      id: "018f0000-0000-7000-8000-000000000809",
      workspaceId: workspaceA,
      projectId: projectA,
      environment: "production",
      dataSourceId: dataSourceA,
      status: "failed",
      processingStage: "completed",
      revision: "1",
      createdBy: actorA,
      allowFailure: true,
    }),
    "violates check constraint",
  );

  insertDataVersion({
    id: "018f0000-0000-7000-8000-000000000810",
    workspaceId: workspaceA,
    projectId: projectA,
    environment: "production",
    dataSourceId: dataSourceA,
    status: "created",
    processingStage: "upload",
    revision: "1",
    createdBy: actorA,
  });
  console.log("PASS created data version may omit content_digest");

  for (const [label, assignment] of [
    [
      "data version source is immutable",
      `data_source_id = '${dataSourceATest}'`,
    ],
    [
      "data version workspace scope is immutable",
      `workspace_id = '${workspaceB}'`,
    ],
    ["data version project scope is immutable", `project_id = '${projectB}'`],
    ["data version environment scope is immutable", `environment = 'test'`],
  ]) {
    expectFailure(
      label,
      scopedCommand({
        workspaceId: workspaceA,
        actorId: actorA,
        sql: `UPDATE app.data_versions SET ${assignment}, revision = 2 WHERE id = '018f0000-0000-7000-8000-000000000810';`,
        allowFailure: true,
      }),
      "data version identity and provenance fields are immutable",
    );
  }

  scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: `
      UPDATE app.data_versions
      SET
        status = 'uploading',
        revision = 2
      WHERE id = '018f0000-0000-7000-8000-000000000810';
    `,
  });
  console.log(
    "PASS data version created -> uploading with revision +1 succeeds",
  );
  expectFailure(
    "legal data version transition without revision increment is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.data_versions
        SET status = 'uploaded', revision = 2
        WHERE id = '018f0000-0000-7000-8000-000000000810';
      `,
      allowFailure: true,
    }),
    "revision must increment by exactly 1",
  );

  scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: `
      UPDATE app.data_versions
      SET
        content_digest = 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        revision = 3
      WHERE id = '018f0000-0000-7000-8000-000000000810';
    `,
  });
  expectFailure(
    "data version digest cannot change once set",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.data_versions
        SET
          content_digest = 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
          revision = 4
        WHERE id = '018f0000-0000-7000-8000-000000000810';
      `,
      allowFailure: true,
    }),
    "data version content_digest is immutable once set",
  );
  expectFailure(
    "data version digest cannot be cleared once set",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.data_versions
        SET content_digest = NULL, revision = 4
        WHERE id = '018f0000-0000-7000-8000-000000000810';
      `,
      allowFailure: true,
    }),
    "data version content_digest is immutable once set",
  );
  expectFailure(
    "illegal upload state rollback is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.data_versions
        SET status = 'created', revision = 4
        WHERE id = '018f0000-0000-7000-8000-000000000810';
      `,
      allowFailure: true,
    }),
    "invalid data version status transition",
  );
  expectFailure(
    "data version updated_at client override is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.data_versions
        SET updated_at = CURRENT_TIMESTAMP + interval '1 day', revision = 4
        WHERE id = '018f0000-0000-7000-8000-000000000810';
      `,
      allowFailure: true,
    }),
    "data version updated_at is trigger maintained",
  );

  for (const [label, assignment] of [
    [
      "completed data version revision jump to 999 is rejected",
      "revision = 999",
    ],
    ["completed data version revision +1 is rejected", "revision = 2"],
    [
      "completed data version completed_at change is rejected",
      "completed_at = completed_at + interval '1 day'",
    ],
    [
      "terminal data version processing_stage change is rejected",
      "processing_stage = 'index'",
    ],
    [
      "terminal data version digest change is rejected",
      "content_digest = 'sha256:9999999999999999999999999999999999999999999999999999999999999999'",
    ],
    ["terminal data version digest clear is rejected", "content_digest = NULL"],
  ]) {
    expectFailure(
      label,
      scopedCommand({
        workspaceId: workspaceA,
        actorId: actorA,
        sql: `
          UPDATE app.data_versions
          SET ${assignment}
          WHERE id = '018f0000-0000-7000-8000-000000000401';
        `,
        allowFailure: true,
      }),
      "terminal data version is immutable",
    );
  }
}

function assertReleaseOpsRulesV2() {
  assertReleaseOpsEnumConformance();

  const submittedCandidate = createSubmittedCandidate(nextReleaseVersion());
  console.log("PASS candidate status submitted can be inserted");

  for (const status of ["created", "testing"]) {
    expectFailure(
      `candidate status ${status} is rejected`,
      scopedCommand({
        workspaceId: workspaceA,
        actorId: actorA,
        sql: `
          INSERT INTO app.candidates (
            id,
            workspace_id,
            project_id,
            environment,
            definition_id,
            definition_digest,
            version,
            status,
            created_by
          )
          VALUES (
            '${nextUuid()}',
            '${workspaceA}',
            '${projectA}',
            'production',
            '${definitionA}',
            'sha256:1111111111111111111111111111111111111111111111111111111111111111',
            '${nextReleaseVersion()}',
            '${status}',
            '${actorA}'
          );
        `,
        allowFailure: true,
      }),
      "invalid input value for enum app.candidate_status",
    );
  }

  expectFailure(
    "candidate illegal self transition is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.candidates
        SET status = 'submitted', revision = 2
        WHERE id = '${submittedCandidate.id}';
      `,
      allowFailure: true,
    }),
    "invalid candidate status transition",
  );

  const terminalCandidate = approveSubmittedCandidate(nextReleaseVersion());
  expectFailure(
    "terminal candidate rollback is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.candidates
        SET status = 'withdrawn', revision = 3
        WHERE id = '${terminalCandidate.id}';
      `,
      allowFailure: true,
    }),
    "terminal candidate status is immutable",
  );

  expectFailure(
    "platform module runtime write is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        INSERT INTO app.modules (id, module_name, module_kind)
        VALUES ('${nextUuid()}', 'runtime_forbidden', 'capability');
      `,
      allowFailure: true,
    }),
    "violates row-level security policy",
  );

  expectFailure(
    "module version content update is rejected",
    adminCommand(
      `
        UPDATE app.module_versions
        SET artifact_digest = '${digest()}',
            revision = 2
        WHERE id = '${moduleVersionA}';
      `,
      true,
    ),
    "module version content is immutable",
  );
  adminCommand(`
    UPDATE app.module_versions
    SET status = 'deprecated', revision = 5
    WHERE id = '${moduleVersionA}';
  `);
  console.log("PASS module version approved -> deprecated edge succeeds");
  expectFailure(
    "terminal module version rollback is rejected",
    adminCommand(
      `
        UPDATE app.module_versions
        SET status = 'approved', revision = 6
        WHERE id = '${moduleVersionA}';
      `,
      true,
    ),
    "terminal module version status is immutable",
  );

  expectFailure(
    "service definition immutable fact update is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.service_definitions
        SET digest = '${digest()}'
        WHERE id = '${definitionA}';
      `,
      allowFailure: true,
    }),
    "service_definitions rows are immutable",
  );

  const definitionForModules = createDefinition(nextReleaseVersion());
  for (const [label, moduleName, exactVersion, artifactDigest] of [
    [
      "definition module forged module name is rejected",
      "wrong_module",
      "1.0.0",
      "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    ],
    [
      "definition module forged exact version is rejected",
      "search_documents",
      "9.9.9",
      "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    ],
    [
      "definition module forged artifact digest is rejected",
      "search_documents",
      "1.0.0",
      digest(),
    ],
  ]) {
    expectFailure(
      label,
      scopedCommand({
        workspaceId: workspaceA,
        actorId: actorA,
        sql: `
          INSERT INTO app.definition_modules (
            workspace_id,
            project_id,
            environment,
            definition_id,
            module_version_id,
            module_name,
            exact_version,
            artifact_digest
          )
          VALUES (
            '${workspaceA}',
            '${projectA}',
            'production',
            '${definitionForModules.id}',
            '${moduleVersionA}',
            '${moduleName}',
            '${exactVersion}',
            '${artifactDigest}'
          );
        `,
        allowFailure: true,
      }),
      "violates foreign key constraint",
    );
  }

  const approvedMismatchCandidate =
    approveSubmittedCandidate(nextReleaseVersion());
  expectFailure(
    "test run candidate and definition mismatch is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        INSERT INTO app.test_runs (
          id,
          workspace_id,
          project_id,
          environment,
          definition_id,
          definition_digest,
          candidate_id,
          status,
          created_by
        )
        VALUES (
          '${nextUuid()}',
          '${workspaceA}',
          '${projectA}',
          'production',
          '${definitionA}',
          'sha256:1111111111111111111111111111111111111111111111111111111111111111',
          '${approvedMismatchCandidate.id}',
          'queued',
          '${actorA}'
        );
      `,
      allowFailure: true,
    }),
    "violates foreign key constraint",
  );

  const nonApprovedCandidate = createSubmittedCandidate(nextReleaseVersion());
  expectFailure(
    "non-approved candidate cannot create service version",
    insertServiceVersion({
      definition: nonApprovedCandidate.definition,
      candidateId: nonApprovedCandidate.id,
      version: nextReleaseVersion(),
      status: "approved",
      allowFailure: true,
    }),
    "violates foreign key constraint",
  );

  expectFailure(
    "service version candidate and definition mismatch is rejected",
    insertServiceVersion({
      definition: createDefinition(nextReleaseVersion()),
      candidateId: approvedMismatchCandidate.id,
      version: nextReleaseVersion(),
      status: "approved",
      allowFailure: true,
    }),
    "violates foreign key constraint",
  );

  assertCandidateVersionClosure();
  assertTestRunReportDigestRules();

  const publishedA = createServiceVersion(nextReleaseVersion(), "published");
  expectFailure(
    "deployment service and service version mismatch is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        INSERT INTO app.deployments (
          id,
          workspace_id,
          project_id,
          environment,
          service_id,
          service_version_id,
          definition_digest,
          status,
          created_by
        )
        VALUES (
          '${nextUuid()}',
          '${workspaceA}',
          '${projectA}',
          'production',
          '${createService("mismatch-service")}',
          '${publishedA.id}',
          '${publishedA.definition.digest}',
          'provisioning',
          '${actorA}'
        );
      `,
      allowFailure: true,
    }),
    "violates foreign key constraint",
  );

  const serviceB = createService("secondary-service");
  const policyB = createAccessPolicy(serviceB, "secondary_access");
  expectFailure(
    "credential service and policy mismatch is rejected",
    insertCredential({
      serviceId: serviceB,
      accessPolicyId: accessPolicyA,
      subjectId: "synthetic-mismatch",
      status: "active",
      allowFailure: true,
    }),
    "violates foreign key constraint",
  );

  const serviceBCredential = insertCredential({
    serviceId: serviceB,
    accessPolicyId: policyB,
    subjectId: "synthetic-client-b",
    status: "active",
  });
  const policyMismatchCredential = insertCredential({
    serviceId: serviceA,
    accessPolicyId: createAccessPolicy(serviceA, "alternate_access"),
    subjectId: "synthetic-client-a",
    status: "active",
  });
  const subjectMismatchCredential = insertCredential({
    serviceId: serviceA,
    accessPolicyId: accessPolicyA,
    subjectId: "synthetic-client-other",
    status: "active",
  });
  for (const [label, credentialId] of [
    ["rotation cross-service credential is rejected", serviceBCredential],
    ["rotation cross-policy credential is rejected", policyMismatchCredential],
    [
      "rotation cross-subject credential is rejected",
      subjectMismatchCredential,
    ],
  ]) {
    expectFailure(
      label,
      scopedCommand({
        workspaceId: workspaceA,
        actorId: actorA,
        sql: `
          INSERT INTO app.credential_rotations (
            id,
            workspace_id,
            project_id,
            environment,
            service_id,
            access_policy_id,
            subject_id,
            old_credential_id,
            new_credential_id,
            status,
            created_by
          )
          VALUES (
            '${nextUuid()}',
            '${workspaceA}',
            '${projectA}',
            'production',
            '${serviceA}',
            '${accessPolicyA}',
            'synthetic-client-a',
            '018f0000-0000-7000-8000-000000001801',
            '${credentialId}',
            'active',
            '${actorA}'
          );
        `,
        allowFailure: true,
      }),
      "violates foreign key constraint",
    );
  }

  const serviceBVersion = createServiceVersion(
    nextReleaseVersion(),
    "published",
    serviceB,
  );
  for (const [label, table, columns, values] of [
    [
      "trace service version and credential service mismatch is rejected",
      "request_traces",
      "id, workspace_id, project_id, environment, service_id, service_version_id, credential_id, trace_id, status",
      `'${nextUuid()}', '${workspaceA}', '${projectA}', 'production', '${serviceB}', '${serviceBVersion.id}', '${credentialA}', 'trace_synthetic_${uuidCounter}', 'allowed'`,
    ],
    [
      "usage service version and credential service mismatch is rejected",
      "usage_events",
      "id, workspace_id, project_id, environment, service_id, service_version_id, credential_id, idempotency_key, metric_key, unit, quantity",
      `'${nextUuid()}', '${workspaceA}', '${projectA}', 'production', '${serviceB}', '${serviceBVersion.id}', '${credentialA}', 'idem_synthetic_${uuidCounter}', 'mcp.request', 'request', 1`,
    ],
    [
      "quota bucket credential service mismatch is rejected",
      "quota_buckets",
      "workspace_id, project_id, environment, service_id, credential_id, bucket_key, window_start",
      `'${workspaceA}', '${projectA}', 'production', '${serviceB}', '${credentialA}', 'minute:mismatch:${uuidCounter}', CURRENT_TIMESTAMP`,
    ],
  ]) {
    expectFailure(
      label,
      scopedCommand({
        workspaceId: workspaceA,
        actorId: actorA,
        sql: `INSERT INTO app.${table} (${columns}) VALUES (${values});`,
        allowFailure: true,
      }),
      "violates foreign key constraint",
    );
  }

  for (const terminal of [
    "changes_requested",
    "materials_required",
    "rejected",
    "approved",
    "withdrawn",
  ]) {
    const candidate = createSubmittedCandidate(nextReleaseVersion());
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.candidates
        SET status = '${terminal}', revision = 2
        WHERE id = '${candidate.id}';
      `,
    });
    console.log(`PASS candidate submitted -> ${terminal} edge succeeds`);
  }

  const suspendedServiceVersion = createServiceVersion(
    nextReleaseVersion(),
    "suspended",
  );
  scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: `
      UPDATE app.service_versions
      SET status = 'published', revision = ${suspendedServiceVersion.revision + 1}
      WHERE id = '${suspendedServiceVersion.id}';
    `,
  });
  console.log("PASS service version suspended -> published edge succeeds");
  expectFailure(
    "service version revision skip is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.service_versions
        SET status = 'retired', revision = ${suspendedServiceVersion.revision + 3}
        WHERE id = '${suspendedServiceVersion.id}';
      `,
      allowFailure: true,
    }),
    "revision must increment by exactly 1",
  );

  const deployment = createDeployment("suspended");
  scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: `
      UPDATE app.deployments
      SET status = 'healthy', revision = ${deployment.revision + 1}
      WHERE id = '${deployment.id}';
      INSERT INTO app.deployment_events (
        id,
        workspace_id,
        project_id,
        environment,
        deployment_id,
        deployment_revision,
        from_status,
        to_status,
        reason,
        actor_id
      )
      VALUES (
        '${nextUuid()}',
        '${workspaceA}',
        '${projectA}',
        'production',
        '${deployment.id}',
        ${deployment.revision + 1},
        'suspended',
        'healthy',
        'synthetic deployment resume',
        '${actorA}'
      );
    `,
  });
  console.log(
    "PASS deployment suspended -> healthy edge with matching event succeeds",
  );

  const badDeployment = createDeployment("healthy");
  expectFailure(
    "deployment update without matching event is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
      UPDATE app.deployments
        SET status = 'degraded', revision = ${badDeployment.revision + 1}
        WHERE id = '${badDeployment.id}';
      `,
      allowFailure: true,
    }),
    "deployment status update requires matching deployment event",
  );
  expectFailure(
    "deployment event from/to mismatch is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        INSERT INTO app.deployment_events (
          id,
          workspace_id,
          project_id,
          environment,
          deployment_id,
          deployment_revision,
          from_status,
          to_status,
          reason,
          actor_id
        )
        VALUES (
          '${nextUuid()}',
          '${workspaceA}',
          '${projectA}',
          'production',
          '${badDeployment.id}',
          ${badDeployment.revision + 1},
          'healthy',
          'healthy',
          'synthetic invalid self event',
          '${actorA}'
        );
      `,
      allowFailure: true,
    }),
    "invalid deployment event status transition",
  );

  const credential = insertCredential({
    serviceId: serviceA,
    accessPolicyId: accessPolicyA,
    subjectId: "synthetic-client-edge",
    status: "active",
  });
  scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: `
      UPDATE app.credentials
      SET status = 'rotating', revision = 2
      WHERE id = '${credential}';
    `,
  });
  console.log("PASS credential active -> rotating edge succeeds");
  expectFailure(
    "credential revision not increasing is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.credentials
        SET status = 'revoked', revision = 2
        WHERE id = '${credential}';
      `,
      allowFailure: true,
    }),
    "revision must increment by exactly 1",
  );

  expectFailure(
    "duplicate usage idempotency key is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        INSERT INTO app.usage_events (
          id,
          workspace_id,
          project_id,
          environment,
          service_id,
          service_version_id,
          credential_id,
          idempotency_key,
          metric_key,
          unit,
          quantity
        )
        VALUES (
          '${nextUuid()}',
          '${workspaceA}',
          '${projectA}',
          'production',
          '${serviceA}',
          '${serviceVersionA}',
          '${credentialA}',
          'idem_synthetic_0001',
          'mcp.request',
          'request',
          1
        );
      `,
      allowFailure: true,
    }),
    "duplicate key value violates unique constraint",
  );
  expectFailure(
    "audit event update is rejected for runtime role",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.audit_events
        SET summary = 'tampered'
        WHERE id = '018f0000-0000-7000-8000-000000001951';
      `,
      allowFailure: true,
    }),
    "audit events are append-only",
  );
  expectFailure(
    "audit event delete is rejected for runtime role",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        DELETE FROM app.audit_events
        WHERE id = '018f0000-0000-7000-8000-000000001951';
      `,
      allowFailure: true,
    }),
    "audit events are append-only",
  );
  assertInitialStateConstraints();
  assertReleaseOpsStateMatrices();
  assertEquals(
    "schema scan has no secret_plaintext or body columns",
    queryScalar(
      databaseUrl,
      `
        SELECT count(*)
        FROM information_schema.columns
        WHERE table_schema = 'app'
          AND column_name IN ('secret_plaintext', 'body')
      `,
    ),
    "0",
  );
}

async function assertRepositoryOutboxRules() {
  const operation = "wp02d.concurrent_fact";
  const idempotencyKey = "idem_wp02d_concurrent_0001";
  const requestDigest =
    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const responseDigest =
    "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const attempts = Array.from({ length: 25 }, () => ({
    auditId: nextUuid(),
    outboxId: nextUuid(),
  }));

  await Promise.all(
    attempts.map((attempt) =>
      runScopedPsql(
        idempotentAuditAndOutboxSql({
          operation,
          idempotencyKey,
          requestDigest,
          responseDigest,
          auditId: attempt.auditId,
          outboxId: attempt.outboxId,
          summary: "WP-02D concurrent idempotent fact",
        }),
      ),
    ),
  );

  assertEquals(
    "20+ concurrent same idempotency key creates one business fact",
    scopedScalar({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        SELECT count(*)
        FROM app.audit_events
        WHERE event_type = 'wp02d.concurrent_fact';
      `,
    }),
    "1",
  );
  assertEquals(
    "20+ concurrent same idempotency key creates one outbox event",
    scopedScalar({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        SELECT count(*)
        FROM app.outbox_events
        WHERE event_type = 'wp02d.concurrent_fact.created';
      `,
    }),
    "1",
  );
  const completionBeforeReplay = scopedScalar({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: `
      SELECT response_digest || '|' || resource_type || '|' || resource_id::text
      FROM app.idempotency_records
      WHERE operation = '${operation}'
        AND idempotency_key = '${idempotencyKey}';
    `,
  });
  assertEquals(
    "concurrent idempotency record is completed once",
    scopedScalar({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        SELECT count(*)
        FROM app.idempotency_records
        WHERE operation = '${operation}'
          AND idempotency_key = '${idempotencyKey}'
          AND request_digest = '${requestDigest}'
          AND status = 'completed';
      `,
    }),
    "1",
  );
  assertEquals(
    "completed idempotency replay returns original result",
    scopedScalar({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        SELECT kind || '|' || response_digest || '|' || resource_type || '|' || resource_id::text
        FROM app.ensure_idempotency_key(
          '${workspaceA}',
          '${projectA}',
          'production',
          '${operation}',
          '${idempotencyKey}',
          '${requestDigest}'
        );
      `,
    }),
    `completed|${completionBeforeReplay}`,
  );

  scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: idempotentAuditAndOutboxSql({
      operation,
      idempotencyKey,
      requestDigest,
      responseDigest,
      auditId: nextUuid(),
      outboxId: nextUuid(),
      summary: "WP-02D replayed idempotent fact",
    }),
  });
  assertEquals(
    "same idempotency key replay does not create another business fact",
    scopedScalar({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        SELECT count(*)
        FROM app.audit_events
        WHERE event_type = 'wp02d.concurrent_fact';
      `,
    }),
    "1",
  );

  expectFailure(
    "same idempotency key with different request digest is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      allowFailure: true,
      sql: `
        SELECT app.ensure_idempotency_key(
          '${workspaceA}',
          '${projectA}',
          'production',
          '${operation}',
          '${idempotencyKey}',
          'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
        );
      `,
    }),
    "idempotency key reused with different request digest",
  );
  assertIdempotencyRecordProtection({
    operation,
    idempotencyKey,
    requestDigest,
    responseDigest,
    completionBeforeReplay,
  });

  execSql(
    databaseUrl,
    scopedBlock({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        SELECT app.ensure_idempotency_key(
          '${workspaceA}',
          '${projectA}',
          'production',
          'wp02d.rollback_fact',
          'idem_wp02d_rollback_0001',
          'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
        );
        INSERT INTO app.audit_events (
          id,
          workspace_id,
          project_id,
          environment,
          actor_id,
          event_type,
          resource_type,
          resource_id,
          summary
        )
        VALUES (
          '${nextUuid()}',
          '${workspaceA}',
          '${projectA}',
          'production',
          '${actorA}',
          'wp02d.rollback_fact',
          'audit',
          '${candidateA}',
          'WP-02D rollback fact'
        );
        INSERT INTO app.outbox_events (
          id,
          workspace_id,
          project_id,
          environment,
          aggregate_type,
          aggregate_id,
          aggregate_revision,
          event_type,
          event_version,
          logical_event_key,
          payload,
          idempotency_key,
          request_digest
        )
        VALUES (
          '${nextUuid()}',
          '${workspaceA}',
          '${projectA}',
          'production',
          'audit',
          '${candidateA}',
          1,
          'wp02d.rollback_fact.created',
          1,
          'audit:${candidateA}:1:wp02d.rollback_fact.created',
          '{"synthetic":true}'::jsonb,
          'idem_wp02d_rollback_0001',
          'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
        );
        ROLLBACK;
      `,
    }).replace(/\s*COMMIT;\s*$/, ""),
  );
  assertEquals(
    "rolled back transaction leaves no outbox event",
    scopedScalar({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        SELECT count(*)
        FROM app.outbox_events
        WHERE event_type = 'wp02d.rollback_fact.created';
      `,
    }),
    "0",
  );

  assertOutboxImmutableAndLogicalKeyRules();
  const projectA2 = createSecondProjectInWorkspaceA();
  const scopedEventId = nextUuid();
  insertSyntheticOutboxEvent({
    eventId: scopedEventId,
    projectId: projectA,
    environment: "production",
    eventType: "wp02d.scope.created",
  });
  assertEquals(
    "same workspace different project cannot claim project A event",
    scopedScalar({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        SELECT count(*)
        FROM app.claim_outbox_events('${projectA2}', 'production', 10, 'publisher-b', 60);
      `,
    }),
    "0",
  );
  expectFailure(
    "same workspace different project cannot mark project A event",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      allowFailure: true,
      sql: `
        SELECT app.mark_outbox_published(
          '${projectA2}',
          'production',
          '${scopedEventId}',
          '${nextUuid()}'
        );
      `,
    }),
    "outbox event not found in current scope",
  );
  expectFailure(
    "same workspace different project cannot consume project A event",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      allowFailure: true,
      sql: `
        SELECT app.consume_outbox_event(
          'wp02d.consumer.scope',
          '${scopedEventId}',
          '${projectA2}',
          'production'
        );
      `,
    }),
    "outbox event not found in current scope",
  );
  assertEquals(
    "same project wrong environment cannot claim project A event",
    scopedScalar({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        SELECT count(*)
        FROM app.claim_outbox_events('${projectA}', 'test', 10, 'publisher-env', 60);
      `,
    }),
    "0",
  );
  expectFailure(
    "same project wrong environment cannot mark project A event",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      allowFailure: true,
      sql: `
        SELECT app.mark_outbox_published(
          '${projectA}',
          'test',
          '${scopedEventId}',
          '${nextUuid()}'
        );
      `,
    }),
    "outbox event not found in current scope",
  );

  const firstClaim = scopedScalar({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: `
      SELECT id::text || '|' || publish_attempts::text || '|' || claim_token::text
      FROM app.claim_outbox_events('${projectA}', 'production', 10, 'publisher-a', 60)
      WHERE event_type = 'wp02d.concurrent_fact.created';
    `,
  });
  const [eventId, firstAttempts, firstClaimToken] = firstClaim.split("|");
  assertEquals("outbox first claim increments attempts", firstAttempts, "1");

  const secondClaim = scopedScalar({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: `
      SELECT count(*)
      FROM app.claim_outbox_events('${projectA}', 'production', 10, 'publisher-b', 60)
      WHERE event_type = 'wp02d.concurrent_fact.created';
    `,
  });
  assertEquals(
    "outbox lease prevents second claim before expiry",
    secondClaim,
    "0",
  );
  const concurrentEventId = nextUuid();
  insertSyntheticOutboxEvent({
    eventId: concurrentEventId,
    projectId: projectA,
    environment: "production",
    eventType: "wp02d.concurrent_claim.created",
  });
  const concurrentClaims = await Promise.all([
    runScopedPsql(
      `
        SELECT count(*)
        FROM app.claim_outbox_events('${projectA}', 'production', 10, 'publisher-x', 60)
        WHERE id = '${concurrentEventId}';
      `,
    ),
    runScopedPsql(
      `
        SELECT count(*)
        FROM app.claim_outbox_events('${projectA}', 'production', 10, 'publisher-y', 60)
        WHERE id = '${concurrentEventId}';
      `,
    ),
  ]);
  assertEquals(
    "two concurrent publishers claim event only once",
    `${Number(concurrentClaims[0].trim()) + Number(concurrentClaims[1].trim())}`,
    "1",
  );
  scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: `
      UPDATE app.outbox_events
      SET claim_expires_at = CURRENT_TIMESTAMP - interval '1 second'
      WHERE id = '${eventId}';
    `,
  });
  const expiredClaim = scopedScalar({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: `
      SELECT publish_attempts::text || '|' || claim_token::text
      FROM app.claim_outbox_events('${projectA}', 'production', 10, 'publisher-c', 60)
      WHERE id = '${eventId}';
    `,
  });
  const [secondAttempts, secondClaimToken] = expiredClaim.split("|");
  assertEquals(
    "outbox expired lease can be claimed with attempt 2",
    secondAttempts,
    "2",
  );
  if (firstClaimToken === secondClaimToken) {
    throw new Error("outbox second claim should use a new claim token");
  }
  console.log("PASS outbox second claim uses a new token");
  expectFailure(
    "outbox stale claim token cannot ack",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      allowFailure: true,
      sql: `
        SELECT app.mark_outbox_published(
          '${projectA}',
          'production',
          '${eventId}',
          '${firstClaimToken}'
        );
      `,
    }),
    "outbox claim token does not match",
  );

  assertEquals(
    "outbox consumer first delivery is consumed",
    scopedScalar({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        SELECT app.consume_outbox_event(
          'wp02d.consumer',
          '${eventId}',
          '${projectA}',
          'production'
        );
      `,
    }),
    "t",
  );
  assertEquals(
    "outbox consumer duplicate delivery is ignored",
    scopedScalar({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        SELECT app.consume_outbox_event(
          'wp02d.consumer',
          '${eventId}',
          '${projectA}',
          'production'
        );
      `,
    }),
    "f",
  );

  scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: `
      SELECT app.mark_outbox_published(
        '${projectA}',
        'production',
        '${eventId}',
        '${secondClaimToken}'
      );
    `,
  });
  const publishedAt = scopedScalar({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: `
      SELECT published_at::text
      FROM app.outbox_events
      WHERE id = '${eventId}';
    `,
  });
  scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: `
      SELECT app.mark_outbox_published(
        '${projectA}',
        'production',
        '${eventId}',
        '${secondClaimToken}'
      );
    `,
  });
  assertEquals(
    "outbox repeated ack with current token is idempotent",
    scopedScalar({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        SELECT published_at::text
        FROM app.outbox_events
        WHERE id = '${eventId}';
      `,
    }),
    publishedAt,
  );
  assertEquals(
    "published outbox event is not claimed again",
    scopedScalar({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        SELECT count(*)
        FROM app.claim_outbox_events('${projectA}', 'production', 10, 'publisher-a', 60)
        WHERE event_type = 'wp02d.concurrent_fact.created';
      `,
    }),
    "0",
  );
  expectFailure(
    "published outbox event cannot be modified",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      allowFailure: true,
      sql: `
        UPDATE app.outbox_events
        SET available_at = CURRENT_TIMESTAMP + interval '5 minutes'
        WHERE id = '${eventId}';
      `,
    }),
    "published outbox event is immutable",
  );
  expectFailure(
    "published outbox delete is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      allowFailure: true,
      sql: `DELETE FROM app.outbox_events WHERE id = '${eventId}';`,
    }),
    "outbox events are append-only",
  );
}

function assertIdempotencyRecordProtection({
  operation,
  idempotencyKey,
  requestDigest,
  responseDigest,
  completionBeforeReplay,
}) {
  const startedKey = "idem_wp02d_started_protection";
  expectFailure(
    "direct completed idempotency insert is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      allowFailure: true,
      sql: `
        INSERT INTO app.idempotency_records (
          workspace_id,
          project_id,
          environment,
          operation,
          idempotency_key,
          request_digest,
          status,
          response_digest,
          resource_type,
          resource_id,
          completed_at
        )
        VALUES (
          '${workspaceA}',
          '${projectA}',
          'production',
          'wp02d.direct_completed',
          'idem_wp02d_direct_completed',
          '${requestDigest}',
          'completed',
          '${responseDigest}',
          'audit',
          '${candidateA}',
          CURRENT_TIMESTAMP
        );
      `,
    }),
    "idempotency records must start as started",
  );
  expectFailure(
    "direct started idempotency insert with resource is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      allowFailure: true,
      sql: `
        INSERT INTO app.idempotency_records (
          workspace_id,
          project_id,
          environment,
          operation,
          idempotency_key,
          request_digest,
          status,
          resource_type,
          resource_id
        )
        VALUES (
          '${workspaceA}',
          '${projectA}',
          'production',
          'wp02d.direct_started_resource',
          'idem_wp02d_started_resource',
          '${requestDigest}',
          'started',
          'audit',
          '${candidateA}'
        );
      `,
    }),
    "idempotency records must start as started",
  );
  scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: `
      SELECT app.ensure_idempotency_key(
        '${workspaceA}',
        '${projectA}',
        'production',
        'wp02d.started_protection',
        '${startedKey}',
        '${requestDigest}'
      );
    `,
  });
  expectFailure(
    "started idempotency resource prewrite is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      allowFailure: true,
      sql: `
        UPDATE app.idempotency_records
        SET resource_type = 'audit',
            resource_id = '${candidateA}'
        WHERE operation = 'wp02d.started_protection'
          AND idempotency_key = '${startedKey}';
      `,
    }),
    "started idempotency completion fields are immutable",
  );
  assertEquals(
    "rejected started idempotency prewrite leaves completion fields null",
    scopedScalar({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        SELECT status::text || '|' ||
          (response_digest IS NULL)::text || '|' ||
          (resource_type IS NULL)::text || '|' ||
          (resource_id IS NULL)::text || '|' ||
          (completed_at IS NULL)::text
        FROM app.idempotency_records
        WHERE operation = 'wp02d.started_protection'
          AND idempotency_key = '${startedKey}';
      `,
    }),
    "started|true|true|true|true",
  );
  scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: `
      SELECT app.complete_idempotency_key(
        '${workspaceA}',
        '${projectA}',
        'production',
        'wp02d.started_protection',
        '${startedKey}',
        '${requestDigest}',
        '${responseDigest}',
        'audit',
        '${candidateA}'
      );
    `,
  });
  assertEquals(
    "started idempotency legal completion still succeeds",
    scopedScalar({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        SELECT status::text || '|' || response_digest || '|' || resource_type || '|' || resource_id::text
        FROM app.idempotency_records
        WHERE operation = 'wp02d.started_protection'
          AND idempotency_key = '${startedKey}';
      `,
    }),
    `completed|${responseDigest}|audit|${candidateA}`,
  );
  expectFailure(
    "idempotency request digest is immutable",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      allowFailure: true,
      sql: `
        UPDATE app.idempotency_records
        SET request_digest = 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
        WHERE operation = '${operation}' AND idempotency_key = '${idempotencyKey}';
      `,
    }),
    "idempotency identity is immutable",
  );
  expectFailure(
    "idempotency operation/key/scope are immutable",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      allowFailure: true,
      sql: `
        UPDATE app.idempotency_records
        SET operation = 'wp02d.tampered'
        WHERE operation = '${operation}' AND idempotency_key = '${idempotencyKey}';
      `,
    }),
    "idempotency identity is immutable",
  );
  expectFailure(
    "started idempotency record delete is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      allowFailure: true,
      sql: `
        DELETE FROM app.idempotency_records
        WHERE operation = 'wp02d.started_protection'
          AND idempotency_key = '${startedKey}';
      `,
    }),
    "idempotency records are append-only",
  );
  expectFailure(
    "completed idempotency record delete is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      allowFailure: true,
      sql: `
        DELETE FROM app.idempotency_records
        WHERE operation = '${operation}' AND idempotency_key = '${idempotencyKey}';
      `,
    }),
    "idempotency records are append-only",
  );
  expectFailure(
    "completed idempotency cannot complete with different response digest",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      allowFailure: true,
      sql: `
        SELECT app.complete_idempotency_key(
          '${workspaceA}',
          '${projectA}',
          'production',
          '${operation}',
          '${idempotencyKey}',
          '${requestDigest}',
          'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
          'audit',
          '${completionBeforeReplay.split("|")[2]}'
        );
      `,
    }),
    "completed idempotency record result mismatch",
  );
  expectFailure(
    "completed idempotency cannot complete with different resource",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      allowFailure: true,
      sql: `
        SELECT app.complete_idempotency_key(
          '${workspaceA}',
          '${projectA}',
          'production',
          '${operation}',
          '${idempotencyKey}',
          '${requestDigest}',
          '${responseDigest}',
          'audit',
          '${candidateA}'
        );
      `,
    }),
    "completed idempotency record result mismatch",
  );
  scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: `
      SELECT app.complete_idempotency_key(
        '${workspaceA}',
        '${projectA}',
        'production',
        '${operation}',
        '${idempotencyKey}',
        '${requestDigest}',
        '${responseDigest}',
        'audit',
        '${completionBeforeReplay.split("|")[2]}'
      );
    `,
  });
  assertEquals(
    "completed idempotency same result succeeds without mutation",
    scopedScalar({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        SELECT response_digest || '|' || resource_type || '|' || resource_id::text
        FROM app.idempotency_records
        WHERE operation = '${operation}' AND idempotency_key = '${idempotencyKey}';
      `,
    }),
    completionBeforeReplay,
  );
}

function assertOutboxImmutableAndLogicalKeyRules() {
  expectFailure(
    "forged outbox logical event key is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      allowFailure: true,
      sql: insertOutboxEventSql({
        eventId: nextUuid(),
        projectId: projectA,
        environment: "production",
        eventType: "wp02d.forged_key.created",
        logicalEventKey: `audit:${candidateA}:999:wp02d.forged_key.created`,
      }),
    }),
    "outbox logical event key must match aggregate identity",
  );
  const duplicateLogicalEventId = nextUuid();
  insertSyntheticOutboxEvent({
    eventId: duplicateLogicalEventId,
    projectId: projectA,
    environment: "production",
    eventType: "wp02d.same_logic.created",
  });
  expectFailure(
    "same logical outbox event cannot be repeated with changed key",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      allowFailure: true,
      sql: insertOutboxEventSql({
        eventId: nextUuid(),
        projectId: projectA,
        environment: "production",
        eventType: "wp02d.same_logic.created",
        logicalEventKey: `audit:${candidateA}:2:wp02d.same_logic.created`,
      }),
    }),
    "outbox logical event key must match aggregate identity",
  );
  expectFailure(
    "direct pre-claimed outbox insert is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      allowFailure: true,
      sql: insertOutboxEventSql({
        eventId: nextUuid(),
        projectId: projectA,
        environment: "production",
        eventType: "wp02d.pre_claimed.created",
        claimToken: nextUuid(),
        claimedBy: "publisher-preclaimed",
        claimExpiresAt: "CURRENT_TIMESTAMP + interval '1 minute'",
        publishAttempts: 1,
        lastAttemptAt: "CURRENT_TIMESTAMP",
      }),
    }),
    "outbox events must start unclaimed and unpublished",
  );
  expectFailure(
    "direct pre-published outbox insert is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      allowFailure: true,
      sql: insertOutboxEventSql({
        eventId: nextUuid(),
        projectId: projectA,
        environment: "production",
        eventType: "wp02d.pre_published.created",
        publishedAt: "CURRENT_TIMESTAMP",
      }),
    }),
    "outbox events must start unclaimed and unpublished",
  );
  const eventId = nextUuid();
  insertSyntheticOutboxEvent({
    eventId,
    projectId: projectA,
    environment: "production",
    eventType: "wp02d.immutable.created",
  });
  expectFailure(
    "outbox payload is immutable",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      allowFailure: true,
      sql: `
        UPDATE app.outbox_events
        SET payload = '{"tampered":true}'::jsonb
        WHERE id = '${eventId}';
      `,
    }),
    "outbox event content is immutable",
  );
  expectFailure(
    "outbox aggregate/event/scope/request digest are immutable",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      allowFailure: true,
      sql: `
        UPDATE app.outbox_events
        SET aggregate_revision = 2
        WHERE id = '${eventId}';
      `,
    }),
    "outbox event content is immutable",
  );
  expectFailure(
    "unpublished outbox delete is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      allowFailure: true,
      sql: `DELETE FROM app.outbox_events WHERE id = '${eventId}';`,
    }),
    "outbox events are append-only",
  );
  expectFailure(
    "duplicate logical event key with null idempotency is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      allowFailure: true,
      sql: insertOutboxEventSql({
        eventId: nextUuid(),
        projectId: projectA,
        environment: "production",
        eventType: "wp02d.immutable.created",
      }),
    }),
    "duplicate key value violates unique constraint",
  );
  expectFailure(
    "duplicate logical event key with different idempotency is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      allowFailure: true,
      sql: insertOutboxEventSql({
        eventId: nextUuid(),
        projectId: projectA,
        environment: "production",
        eventType: "wp02d.immutable.created",
        idempotencyKey: "idem_wp02d_other",
        requestDigest:
          "sha256:abababababababababababababababababababababababababababababababab",
      }),
    }),
    "duplicate key value violates unique constraint",
  );
  expectFailure(
    "outbox idempotency key without request digest is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      allowFailure: true,
      sql: insertOutboxEventSql({
        eventId: nextUuid(),
        projectId: projectA,
        environment: "production",
        eventType: "wp02d.partial_idem.created",
        idempotencyKey: "idem_wp02d_partial",
      }),
    }),
    "outbox_idempotency_pair_check",
  );
  expectFailure(
    "outbox request digest without idempotency key is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      allowFailure: true,
      sql: insertOutboxEventSql({
        eventId: nextUuid(),
        projectId: projectA,
        environment: "production",
        eventType: "wp02d.partial_digest.created",
        requestDigest:
          "sha256:cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
      }),
    }),
    "outbox_idempotency_pair_check",
  );
}

function createSecondProjectInWorkspaceA() {
  const projectId = nextUuid();
  scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: `
      INSERT INTO app.projects (
        id,
        workspace_id,
        slug,
        display_name,
        description,
        default_region,
        default_environment,
        created_by
      )
      VALUES (
        '${projectId}',
        '${workspaceA}',
        'wp02d-scope-project',
        'WP-02D Scope Project',
        'Synthetic scope isolation project',
        'us-test',
        'production',
        '${actorA}'
      );
      INSERT INTO app.project_members (
        workspace_id,
        project_id,
        actor_id,
        role
      )
      VALUES (
        '${workspaceA}',
        '${projectId}',
        '${actorA}',
        'owner'
      );
    `,
  });
  return projectId;
}

function insertSyntheticOutboxEvent({
  eventId,
  projectId,
  environment,
  eventType,
}) {
  scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: insertOutboxEventSql({
      eventId,
      projectId,
      environment,
      eventType,
    }),
  });
}

function insertOutboxEventSql({
  eventId,
  projectId,
  environment,
  eventType,
  logicalEventKey,
  aggregateId = candidateA,
  aggregateRevision = 1,
  idempotencyKey,
  requestDigest,
  publishAttempts = 0,
  lastAttemptAt,
  claimToken,
  claimedBy,
  claimExpiresAt,
  publishedAt,
}) {
  const eventKey =
    logicalEventKey ??
    `audit:${aggregateId}:${aggregateRevision.toString()}:${eventType}`;
  return `
    INSERT INTO app.outbox_events (
      id,
      workspace_id,
      project_id,
      environment,
      aggregate_type,
      aggregate_id,
      aggregate_revision,
      event_type,
      event_version,
      logical_event_key,
      payload,
      idempotency_key,
      request_digest,
      publish_attempts,
      last_attempt_at,
      claim_token,
      claimed_by,
      claim_expires_at,
      published_at
    )
    VALUES (
      '${eventId}',
      '${workspaceA}',
      '${projectId}',
      '${environment}',
      'audit',
      '${aggregateId}',
      ${aggregateRevision},
      '${eventType}',
      1,
      '${eventKey}',
      '{"synthetic":true}'::jsonb,
      ${idempotencyKey ? `'${idempotencyKey}'` : "NULL"},
      ${requestDigest ? `'${requestDigest}'` : "NULL"},
      ${publishAttempts},
      ${lastAttemptAt ?? "NULL"},
      ${claimToken ? `'${claimToken}'` : "NULL"},
      ${claimedBy ? `'${claimedBy}'` : "NULL"},
      ${claimExpiresAt ?? "NULL"},
      ${publishedAt ?? "NULL"}
    );
  `;
}

function idempotentAuditAndOutboxSql({
  operation,
  idempotencyKey,
  requestDigest,
  responseDigest,
  auditId,
  outboxId,
  summary,
}) {
  return `
    WITH decision AS (
      SELECT *
      FROM app.ensure_idempotency_key(
        '${workspaceA}',
        '${projectA}',
        'production',
        '${operation}',
        '${idempotencyKey}',
        '${requestDigest}'
      )
    ),
    delay AS (
      SELECT kind, pg_sleep(0.05)
      FROM decision
    ),
    fact AS (
      INSERT INTO app.audit_events (
        id,
        workspace_id,
        project_id,
        environment,
        actor_id,
        event_type,
        resource_type,
        resource_id,
        summary,
        metadata
      )
      SELECT
        '${auditId}',
        '${workspaceA}',
        '${projectA}',
        'production',
        '${actorA}',
        '${operation}',
        'audit',
        '${candidateA}',
        '${summary}',
        '{"synthetic":true}'::jsonb
      FROM delay
      WHERE kind = 'acquired'
      RETURNING id
    ),
    event AS (
      INSERT INTO app.outbox_events (
        id,
        workspace_id,
        project_id,
        environment,
        aggregate_type,
        aggregate_id,
        aggregate_revision,
        event_type,
        event_version,
        logical_event_key,
        payload,
        idempotency_key,
        request_digest
      )
      SELECT
        '${outboxId}',
        '${workspaceA}',
        '${projectA}',
        'production',
        'audit',
        id,
        1,
        '${operation}.created',
        1,
        'audit:' || id::text || ':1:${operation}.created',
        jsonb_build_object('auditId', id::text, 'synthetic', true),
        '${idempotencyKey}',
        '${requestDigest}'
      FROM fact
      RETURNING id
    )
    SELECT app.complete_idempotency_key(
      '${workspaceA}',
      '${projectA}',
      'production',
      '${operation}',
      '${idempotencyKey}',
      '${requestDigest}',
      '${responseDigest}',
      'audit',
      id
    )
    FROM fact;
  `;
}

function runScopedPsql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "psql",
      [databaseUrl, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-t", "-A"],
      {
        cwd: packageRoot,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(`psql concurrency worker failed: ${stderr}`));
    });
    child.stdin.end(
      scopedBlock({ workspaceId: workspaceA, actorId: actorA, sql }),
    );
  });
}

function nextReleaseVersion() {
  releaseCounter += 1;
  return `2.0.${releaseCounter}`;
}

function digest() {
  digestCounter += 1;
  return `sha256:${digestCounter.toString(16).padStart(64, "0")}`;
}

function enumValues(enumName) {
  return queryScalar(
    databaseUrl,
    `
      SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder)
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'app'
        AND t.typname = '${enumName}';
    `,
  );
}

function contractEnum(schemaName) {
  const document = JSON.parse(readFileSync(releaseOpsSchemaPath, "utf8"));
  return document.components.schemas[schemaName].enum.join(",");
}

function assertReleaseOpsEnumConformance() {
  assertEquals(
    "candidate enum matches release-ops contract",
    enumValues("candidate_status"),
    contractEnum("CandidateStatus"),
  );
  assertEquals(
    "service version enum matches release-ops contract",
    enumValues("service_version_status"),
    contractEnum("ServiceVersionStatus"),
  );
  assertEquals(
    "deployment enum matches release-ops contract",
    enumValues("deployment_status"),
    contractEnum("DeploymentStatus"),
  );
  assertEquals(
    "credential enum matches release-ops contract",
    enumValues("credential_status"),
    contractEnum("CredentialStatus"),
  );
  assertEquals(
    "module version enum matches frozen Domain states",
    enumValues("module_version_status"),
    "draft,testing,submitted,approved,deprecated,blocked",
  );
}

function assertCandidateVersionClosure() {
  const sameVersionServiceA = createService("candidate-same-version-a");
  const sameVersionServiceB = createService("candidate-same-version-b");
  createSubmittedCandidate("1.0.0", sameVersionServiceA);
  createSubmittedCandidate("1.0.0", sameVersionServiceB);
  console.log("PASS different services can create candidate version 1.0.0");

  createSubmittedCandidate(
    "3.0.1",
    createService("candidate-definition-version-decoupled"),
    "3.0.0",
  );
  console.log(
    "PASS candidate version can differ from service definition version",
  );

  const candidateNine = approveSubmittedCandidate(
    "9.0.0",
    createService("candidate-nine"),
  );
  expectFailure(
    "candidate 9.0.0 cannot create service version 8.0.0",
    insertServiceVersion({
      definition: candidateNine.definition,
      candidateId: candidateNine.id,
      version: "8.0.0",
      status: "approved",
      allowFailure: true,
    }),
    "violates foreign key constraint",
  );
  insertServiceVersion({
    definition: candidateNine.definition,
    candidateId: candidateNine.id,
    version: "9.0.0",
    status: "approved",
  });
  console.log("PASS candidate 9.0.0 can create service version 9.0.0");

  const candidateForOtherDefinition = approveSubmittedCandidate(
    "9.1.0",
    createService("candidate-version-match-wrong-definition-a"),
  );
  const differentDefinitionSameVersion = createDefinition(
    "9.1.0",
    createService("candidate-version-match-wrong-definition-b"),
  );
  expectFailure(
    "candidate version match with different definition is rejected",
    insertServiceVersion({
      definition: differentDefinitionSameVersion,
      candidateId: candidateForOtherDefinition.id,
      version: "9.1.0",
      status: "approved",
      allowFailure: true,
    }),
    "violates foreign key constraint",
  );

  const duplicateService = createService("duplicate-service-version");
  const duplicateCandidate = approveSubmittedCandidate(
    "1.0.0",
    duplicateService,
  );
  insertServiceVersion({
    definition: duplicateCandidate.definition,
    candidateId: duplicateCandidate.id,
    version: "1.0.0",
    status: "approved",
  });
  expectFailure(
    "same service duplicate service version 1.0.0 is rejected",
    insertServiceVersion({
      definition: duplicateCandidate.definition,
      candidateId: duplicateCandidate.id,
      version: "1.0.0",
      status: "approved",
      allowFailure: true,
    }),
    "duplicate key value violates unique constraint",
  );
}

function assertTestRunReportDigestRules() {
  const queuedDigestDefinition = createDefinition(nextReleaseVersion());
  expectFailure(
    "queued test run with report_digest is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        INSERT INTO app.test_runs (
          id,
          workspace_id,
          project_id,
          environment,
          definition_id,
          definition_digest,
          status,
          revision,
          report_digest,
          created_by
        )
        VALUES (
          '${nextUuid()}',
          '${workspaceA}',
          '${projectA}',
          'production',
          '${queuedDigestDefinition.id}',
          '${queuedDigestDefinition.digest}',
          'queued',
          1,
          '${digest()}',
          '${actorA}'
        );
      `,
      allowFailure: true,
    }),
    "queued test run cannot have completion facts",
  );

  const queuedToRunning = createTestRunState("queued");
  expectFailure(
    "queued to running with report_digest is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.test_runs
        SET status = 'running',
            revision = 2,
            report_digest = '${digest()}'
        WHERE id = '${queuedToRunning.id}';
      `,
      allowFailure: true,
    }),
    "non-terminal test run cannot have report digest",
  );

  const runningDigestOnly = createTestRunState("running");
  expectFailure(
    "running test run report_digest-only update is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.test_runs
        SET revision = 3,
            report_digest = '${digest()}'
        WHERE id = '${runningDigestOnly.id}';
      `,
      allowFailure: true,
    }),
    "non-terminal test run cannot have report digest",
  );

  for (const status of ["passed", "failed"]) {
    const missingDigest = createTestRunState("running");
    expectFailure(
      `running to ${status} without report_digest is rejected`,
      scopedCommand({
        workspaceId: workspaceA,
        actorId: actorA,
        sql: `
          UPDATE app.test_runs
          SET status = '${status}',
              revision = 3,
              completed_at = CURRENT_TIMESTAMP
          WHERE id = '${missingDigest.id}';
        `,
        allowFailure: true,
      }),
      "passed or failed test run requires report digest and completed_at",
    );

    const success = createTestRunState("running");
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.test_runs
        SET status = '${status}',
            revision = 3,
            completed_at = CURRENT_TIMESTAMP,
            report_digest = '${digest()}'
        WHERE id = '${success.id}';
      `,
    });
    console.log(`PASS running to ${status} with report_digest succeeds`);
  }

  const terminal = createTestRunState("passed");
  expectFailure(
    "terminal test run report_digest update is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.test_runs
        SET revision = 4,
            report_digest = '${digest()}'
        WHERE id = '${terminal.id}';
      `,
      allowFailure: true,
    }),
    "terminal test run status is immutable",
  );
}

function createService(slug) {
  const id = nextUuid();
  scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: `
      INSERT INTO app.services (
        id,
        workspace_id,
        project_id,
        environment,
        slug,
        display_name,
        created_by
      )
      VALUES (
        '${id}',
        '${workspaceA}',
        '${projectA}',
        'production',
        '${slug}-${uuidCounter}',
        '${slug}',
        '${actorA}'
      );
    `,
  });
  return id;
}

function createDefinition(version, serviceId = serviceA) {
  const definition = {
    id: nextUuid(),
    serviceId,
    version,
    digest: digest(),
  };
  scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: `
      INSERT INTO app.service_definitions (
        id,
        workspace_id,
        project_id,
        environment,
        service_id,
        version,
        digest,
        canonical_json,
        created_by
      )
      VALUES (
        '${definition.id}',
        '${workspaceA}',
        '${projectA}',
        'production',
        '${definition.serviceId}',
        '${definition.version}',
        '${definition.digest}',
        '{"metadata":{"version":"${definition.version}"}}',
        '${actorA}'
      );
    `,
  });
  return definition;
}

function createSubmittedCandidate(
  version,
  serviceId = serviceA,
  definitionVersion = version,
) {
  const definition = createDefinition(definitionVersion, serviceId);
  const id = nextUuid();
  scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: `
      INSERT INTO app.candidates (
        id,
        workspace_id,
        project_id,
        environment,
        definition_id,
        definition_digest,
        version,
        status,
        created_by
      )
      VALUES (
        '${id}',
        '${workspaceA}',
        '${projectA}',
        'production',
        '${definition.id}',
        '${definition.digest}',
        '${version}',
        'submitted',
        '${actorA}'
      );
    `,
  });
  return { id, definition, version };
}

function approveSubmittedCandidate(version, serviceId = serviceA) {
  const candidate = createSubmittedCandidate(version, serviceId);
  scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: `
      UPDATE app.candidates
      SET status = 'approved', revision = 2
      WHERE id = '${candidate.id}';
    `,
  });
  return candidate;
}

function insertServiceVersion({
  definition,
  candidateId,
  version,
  status,
  allowFailure = false,
}) {
  return scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    allowFailure,
    sql: `
      INSERT INTO app.service_versions (
        id,
        workspace_id,
        project_id,
        environment,
        service_id,
        version,
        definition_id,
        candidate_id,
        candidate_status,
        definition_digest,
        artifact_digest,
        status,
        created_by
      )
      VALUES (
        '${nextUuid()}',
        '${workspaceA}',
        '${projectA}',
        'production',
        '${definition.serviceId}',
        '${version}',
        '${definition.id}',
        '${candidateId}',
        'approved',
        '${definition.digest}',
        '${digest()}',
        '${status}',
        '${actorA}'
      );
    `,
  });
}

function createServiceVersion(version, status, serviceId = serviceA) {
  const candidate = approveSubmittedCandidate(version, serviceId);
  const id = nextUuid();
  scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: `
      INSERT INTO app.service_versions (
        id,
        workspace_id,
        project_id,
        environment,
        service_id,
        version,
        definition_id,
        candidate_id,
        candidate_status,
        definition_digest,
        artifact_digest,
        status,
        created_by
      )
      VALUES (
        '${id}',
        '${workspaceA}',
        '${projectA}',
        'production',
        '${serviceId}',
        '${version}',
        '${candidate.definition.id}',
        '${candidate.id}',
        'approved',
        '${candidate.definition.digest}',
        '${digest()}',
        'approved',
        '${actorA}'
      );
    `,
  });
  let revision = 1;
  let current = "approved";
  for (const to of serviceVersionPath(status)) {
    revision += 1;
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.service_versions
        SET status = '${to}', revision = ${revision}
        WHERE id = '${id}';
      `,
    });
    current = to;
  }
  return { id, definition: candidate.definition, revision, status: current };
}

function createDeployment(status) {
  const serviceVersion = createServiceVersion(
    nextReleaseVersion(),
    "published",
  );
  const id = nextUuid();
  scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: `
      INSERT INTO app.deployments (
        id,
        workspace_id,
        project_id,
        environment,
        service_id,
        service_version_id,
        definition_digest,
        status,
        created_by
      )
      VALUES (
        '${id}',
        '${workspaceA}',
        '${projectA}',
        'production',
        '${serviceA}',
        '${serviceVersion.id}',
        '${serviceVersion.definition.digest}',
        'provisioning',
        '${actorA}'
      );
      INSERT INTO app.deployment_events (
        id,
        workspace_id,
        project_id,
        environment,
        deployment_id,
        deployment_revision,
        from_status,
        to_status,
        reason,
        actor_id
      )
      VALUES (
        '${nextUuid()}',
        '${workspaceA}',
        '${projectA}',
        'production',
        '${id}',
        1,
        NULL,
        'provisioning',
        'synthetic deployment created',
        '${actorA}'
      );
    `,
  });
  let revision = 1;
  let current = "provisioning";
  for (const to of deploymentPath(status)) {
    revision += 1;
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.deployments
        SET status = '${to}', revision = ${revision}
        WHERE id = '${id}';
        INSERT INTO app.deployment_events (
          id,
          workspace_id,
          project_id,
          environment,
          deployment_id,
          deployment_revision,
          from_status,
          to_status,
          reason,
          actor_id
        )
        VALUES (
          '${nextUuid()}',
          '${workspaceA}',
          '${projectA}',
          'production',
          '${id}',
          ${revision},
          '${current}',
          '${to}',
          'synthetic deployment state transition',
          '${actorA}'
        );
      `,
    });
    current = to;
  }
  return { id, revision, status: current };
}

function createAccessPolicy(serviceId, policyName) {
  const id = nextUuid();
  scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: `
      INSERT INTO app.access_policies (
        id,
        workspace_id,
        project_id,
        environment,
        service_id,
        policy_name,
        created_by
      )
      VALUES (
        '${id}',
        '${workspaceA}',
        '${projectA}',
        'production',
        '${serviceId}',
        '${policyName}_${uuidCounter}',
        '${actorA}'
      );
    `,
  });
  return id;
}

function insertCredential({
  serviceId,
  accessPolicyId,
  subjectId,
  status,
  allowFailure = false,
}) {
  const id = nextUuid();
  const result = scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    allowFailure,
    sql: `
      INSERT INTO app.credentials (
        id,
        workspace_id,
        project_id,
        environment,
        service_id,
        access_policy_id,
        kind,
        status,
        subject_id,
        public_digest,
        created_by
      )
      VALUES (
        '${id}',
        '${workspaceA}',
        '${projectA}',
        'production',
        '${serviceId}',
        '${accessPolicyId}',
        'api_key',
        'active',
        '${subjectId}',
        '${digest()}',
        '${actorA}'
      );
    `,
  });
  if (!allowFailure && status !== "active") {
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.credentials
        SET status = '${status}', revision = 2
        WHERE id = '${id}';
      `,
    });
  }
  return allowFailure ? result : id;
}

function assertInitialStateConstraints() {
  for (const revision of [0, 2, 99]) {
    expectFailure(
      `module version initial revision ${revision} is rejected`,
      insertModuleVersionWithInitial({
        status: "draft",
        revision,
        allowFailure: true,
      }),
      "module version initial status must be draft with revision 1",
    );
    expectFailure(
      `candidate initial revision ${revision} is rejected`,
      insertCandidateWithInitial({
        status: "submitted",
        revision,
        allowFailure: true,
      }),
      "candidate initial status must be submitted with revision 1",
    );
    expectFailure(
      `service version initial revision ${revision} is rejected`,
      insertServiceVersionWithInitial({
        status: "approved",
        revision,
        allowFailure: true,
      }),
      "service version initial status must be approved with revision 1",
    );
    expectFailure(
      `deployment initial revision ${revision} is rejected`,
      insertDeploymentWithInitial({
        status: "provisioning",
        revision,
        allowFailure: true,
      }),
      "deployment initial status must be provisioning with revision 1",
    );
    expectFailure(
      `credential initial revision ${revision} is rejected`,
      insertCredentialWithInitial({
        status: "active",
        revision,
        allowFailure: true,
      }),
      "credential initial status must be active with revision 1",
    );
    expectFailure(
      `test run initial revision ${revision} is rejected`,
      insertTestRunWithInitial({
        status: "queued",
        revision,
        allowFailure: true,
      }),
      "test run initial status must be queued with revision 1",
    );
  }

  expectFailure(
    "module version illegal initial status is rejected",
    insertModuleVersionWithInitial({
      status: "approved",
      revision: 1,
      allowFailure: true,
    }),
    "module version initial status must be draft with revision 1",
  );
  expectFailure(
    "candidate illegal initial status is rejected",
    insertCandidateWithInitial({
      status: "approved",
      revision: 1,
      allowFailure: true,
    }),
    "candidate initial status must be submitted with revision 1",
  );
  expectFailure(
    "service version illegal initial status is rejected",
    insertServiceVersionWithInitial({
      status: "published",
      revision: 1,
      allowFailure: true,
    }),
    "service version initial status must be approved with revision 1",
  );
  expectFailure(
    "deployment illegal initial status is rejected",
    insertDeploymentWithInitial({
      status: "healthy",
      revision: 1,
      allowFailure: true,
    }),
    "deployment initial status must be provisioning with revision 1",
  );
  expectFailure(
    "credential illegal initial status is rejected",
    insertCredentialWithInitial({
      status: "rotating",
      revision: 1,
      allowFailure: true,
    }),
    "credential initial status must be active with revision 1",
  );
  expectFailure(
    "test run illegal initial status is rejected",
    insertTestRunWithInitial({
      status: "running",
      revision: 1,
      allowFailure: true,
    }),
    "test run initial status must be queued with revision 1",
  );

  const module = createModuleIdentity("module_fk_probe");
  expectFailure(
    "module version parent name mismatch is rejected",
    insertModuleVersionForModule({
      moduleId: module.id,
      moduleName: "wrong_module_name",
      moduleKind: module.kind,
      status: "draft",
      revision: 1,
      allowFailure: true,
    }),
    "violates foreign key constraint",
  );
  expectFailure(
    "module version parent kind mismatch is rejected",
    insertModuleVersionForModule({
      moduleId: module.id,
      moduleName: module.name,
      moduleKind: "source",
      status: "draft",
      revision: 1,
      allowFailure: true,
    }),
    "violates foreign key constraint",
  );

  const deployment = createDeployment("healthy");
  expectFailure(
    "duplicate deployment event for same revision is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: deploymentEventSql({
        deploymentId: deployment.id,
        revision: deployment.revision,
        from: "provisioning",
        to: "healthy",
      }),
      allowFailure: true,
    }),
    "duplicate key value violates unique constraint",
  );
  expectFailure(
    "deployment event revision/status mismatch is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: deploymentEventSql({
        deploymentId: deployment.id,
        revision: deployment.revision + 1,
        from: "healthy",
        to: "degraded",
      }),
      allowFailure: true,
    }),
    "deployment event must match deployment state",
  );
  expectFailure(
    "deployment revision-only update is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.deployments
        SET status = 'healthy', revision = ${deployment.revision + 1}
        WHERE id = '${deployment.id}';
      `,
      allowFailure: true,
    }),
    "deployment status update requires a status change",
  );
  expectFailure(
    "deployment permits only one state change per transaction",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.deployments
        SET status = 'degraded', revision = ${deployment.revision + 1}
        WHERE id = '${deployment.id}';
        ${deploymentEventSql({
          deploymentId: deployment.id,
          revision: deployment.revision + 1,
          from: "healthy",
          to: "degraded",
        })}
        UPDATE app.deployments
        SET status = 'draining', revision = ${deployment.revision + 2}
        WHERE id = '${deployment.id}';
        ${deploymentEventSql({
          deploymentId: deployment.id,
          revision: deployment.revision + 2,
          from: "degraded",
          to: "draining",
        })}
      `,
      allowFailure: true,
    }),
    "deployment event must match deployment state",
  );

  const credential = createCredentialState("active");
  expectFailure(
    "credential revision-only update is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.credentials
        SET revision = ${credential.revision + 1}
        WHERE id = '${credential.id}';
      `,
      allowFailure: true,
    }),
    "credential update requires status or expires_at change",
  );
  scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: `
      UPDATE app.credentials
      SET expires_at = CURRENT_TIMESTAMP + interval '7 days',
          revision = ${credential.revision + 1}
      WHERE id = '${credential.id}';
    `,
  });
  console.log("PASS credential expires_at update with revision +1 succeeds");
}

function assertReleaseOpsStateMatrices() {
  assertStateMatrix({
    name: "moduleVersion",
    states: [
      "draft",
      "testing",
      "submitted",
      "approved",
      "deprecated",
      "blocked",
    ],
    allowed: {
      draft: ["testing"],
      testing: ["submitted"],
      submitted: ["approved", "blocked"],
      approved: ["deprecated", "blocked"],
      deprecated: [],
      blocked: [],
    },
    create: createModuleVersionState,
    transition: transitionModuleVersion,
  });
  assertStateMatrix({
    name: "candidate",
    states: [
      "submitted",
      "changes_requested",
      "materials_required",
      "rejected",
      "approved",
      "withdrawn",
    ],
    allowed: {
      submitted: [
        "changes_requested",
        "materials_required",
        "rejected",
        "approved",
        "withdrawn",
      ],
      changes_requested: [],
      materials_required: [],
      rejected: [],
      approved: [],
      withdrawn: [],
    },
    create: createCandidateState,
    transition: transitionCandidate,
  });
  assertStateMatrix({
    name: "serviceVersion",
    states: ["approved", "deploying", "published", "suspended", "retired"],
    allowed: {
      approved: ["deploying"],
      deploying: ["published"],
      published: ["suspended"],
      suspended: ["published", "retired"],
      retired: [],
    },
    create: createServiceVersionState,
    transition: transitionServiceVersion,
  });
  assertStateMatrix({
    name: "deployment",
    states: [
      "provisioning",
      "healthy",
      "degraded",
      "draining",
      "suspended",
      "stopped",
      "blocked",
    ],
    allowed: {
      provisioning: ["healthy", "blocked"],
      healthy: ["degraded", "draining"],
      degraded: ["healthy", "draining", "blocked"],
      draining: ["suspended", "stopped"],
      suspended: ["healthy", "stopped"],
      stopped: [],
      blocked: [],
    },
    create: createDeploymentState,
    transition: transitionDeployment,
  });
  assertStateMatrix({
    name: "credential",
    states: ["active", "rotating", "revoked", "expired"],
    allowed: {
      active: ["rotating", "revoked", "expired"],
      rotating: ["revoked", "expired"],
      revoked: [],
      expired: [],
    },
    create: createCredentialState,
    transition: transitionCredential,
  });
  assertStateMatrix({
    name: "testRun",
    states: ["queued", "running", "passed", "failed", "cancelled"],
    allowed: {
      queued: ["running", "cancelled"],
      running: ["passed", "failed", "cancelled"],
      passed: [],
      failed: [],
      cancelled: [],
    },
    create: createTestRunState,
    transition: transitionTestRun,
  });
  assertEquals(
    "state matrix total combinations",
    `${matrixStats.total}`,
    "187",
  );
  assertEquals(
    "state matrix legal transitions",
    `${matrixStats.allowed}`,
    "37",
  );
  assertEquals(
    "state matrix rejected transitions",
    `${matrixStats.rejected}`,
    "150",
  );
}

function assertStateMatrix({ name, states, allowed, create, transition }) {
  for (const from of states) {
    for (const to of states) {
      matrixStats.total += 1;
      const entity = create(from);
      const shouldSucceed = (allowed[from] ?? []).includes(to);
      const result = transition(entity, to, !shouldSucceed);
      if (shouldSucceed) {
        if (result.status !== 0) {
          throw new Error(`${name} ${from}->${to}: expected success`);
        }
        matrixStats.allowed += 1;
        console.log(`PASS ${name} ${from} -> ${to} matrix edge succeeds`);
      } else {
        expectFailure(
          `${name} ${from} -> ${to} matrix edge is rejected`,
          result,
          "",
        );
        matrixStats.rejected += 1;
      }
    }
  }
}

function createModuleIdentity(label) {
  const id = nextUuid();
  const name = `${label}_${uuidCounter}`.slice(0, 62);
  const kind = "capability";
  adminCommand(`
    INSERT INTO app.modules (id, module_name, module_kind)
    VALUES ('${id}', '${name}', '${kind}');
  `);
  return { id, name, kind };
}

function insertModuleVersionForModule({
  moduleId,
  moduleName,
  moduleKind,
  status,
  revision,
  allowFailure = false,
}) {
  return adminCommand(
    `
      INSERT INTO app.module_versions (
        id,
        module_id,
        module_name,
        module_kind,
        version,
        status,
        revision,
        artifact_digest,
        signature_digest
      )
      VALUES (
        '${nextUuid()}',
        '${moduleId}',
        '${moduleName}',
        '${moduleKind}',
        '${nextReleaseVersion()}',
        '${status}',
        ${revision},
        '${digest()}',
        '${digest()}'
      );
    `,
    allowFailure,
  );
}

function insertModuleVersionWithInitial({ status, revision, allowFailure }) {
  const module = createModuleIdentity("initial_module");
  return insertModuleVersionForModule({
    moduleId: module.id,
    moduleName: module.name,
    moduleKind: module.kind,
    status,
    revision,
    allowFailure,
  });
}

function createModuleVersionState(status) {
  const module = createModuleIdentity("matrix_module");
  const id = nextUuid();
  const version = nextReleaseVersion();
  adminCommand(`
    INSERT INTO app.module_versions (
      id,
      module_id,
      module_name,
      module_kind,
      version,
      status,
      artifact_digest,
      signature_digest
    )
    VALUES (
      '${id}',
      '${module.id}',
      '${module.name}',
      '${module.kind}',
      '${version}',
      'draft',
      '${digest()}',
      '${digest()}'
    );
  `);
  let revision = 1;
  for (const to of moduleVersionPath(status)) {
    revision += 1;
    adminCommand(`
      UPDATE app.module_versions
      SET status = '${to}', revision = ${revision}
      WHERE id = '${id}';
    `);
  }
  return { id, revision, status };
}

function moduleVersionPath(status) {
  if (status === "draft") return [];
  if (status === "testing") return ["testing"];
  if (status === "submitted") return ["testing", "submitted"];
  if (status === "approved") return ["testing", "submitted", "approved"];
  if (status === "deprecated")
    return ["testing", "submitted", "approved", "deprecated"];
  if (status === "blocked") return ["testing", "submitted", "blocked"];
  throw new Error(`unsupported module version status ${status}`);
}

function transitionModuleVersion(entity, to, allowFailure) {
  return adminCommand(
    `
      UPDATE app.module_versions
      SET status = '${to}', revision = ${entity.revision + 1}
      WHERE id = '${entity.id}';
    `,
    allowFailure,
  );
}

function insertCandidateWithInitial({ status, revision, allowFailure }) {
  const definition = createDefinition(nextReleaseVersion());
  return scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    allowFailure,
    sql: `
      INSERT INTO app.candidates (
        id,
        workspace_id,
        project_id,
        environment,
        definition_id,
        definition_digest,
        version,
        status,
        revision,
        created_by
      )
      VALUES (
        '${nextUuid()}',
        '${workspaceA}',
        '${projectA}',
        'production',
        '${definition.id}',
        '${definition.digest}',
        '${nextReleaseVersion()}',
        '${status}',
        ${revision},
        '${actorA}'
      );
    `,
  });
}

function createCandidateState(status) {
  const candidate = createSubmittedCandidate(nextReleaseVersion());
  let revision = 1;
  if (status !== "submitted") {
    revision = 2;
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.candidates
        SET status = '${status}', revision = ${revision}
        WHERE id = '${candidate.id}';
      `,
    });
  }
  return { id: candidate.id, revision, status };
}

function transitionCandidate(entity, to, allowFailure) {
  return scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    allowFailure,
    sql: `
      UPDATE app.candidates
      SET status = '${to}', revision = ${entity.revision + 1}
      WHERE id = '${entity.id}';
    `,
  });
}

function insertServiceVersionWithInitial({ status, revision, allowFailure }) {
  const candidate = approveSubmittedCandidate(nextReleaseVersion());
  return scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    allowFailure,
    sql: serviceVersionInsertSql({
      id: nextUuid(),
      definition: candidate.definition,
      candidateId: candidate.id,
      version: nextReleaseVersion(),
      status,
      revision,
    }),
  });
}

function createServiceVersionState(status) {
  return createServiceVersion(nextReleaseVersion(), status);
}

function transitionServiceVersion(entity, to, allowFailure) {
  return scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    allowFailure,
    sql: `
      UPDATE app.service_versions
      SET status = '${to}', revision = ${entity.revision + 1}
      WHERE id = '${entity.id}';
    `,
  });
}

function insertDeploymentWithInitial({ status, revision, allowFailure }) {
  const serviceVersion = createServiceVersion(
    nextReleaseVersion(),
    "published",
  );
  return scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    allowFailure,
    sql: `
      INSERT INTO app.deployments (
        id,
        workspace_id,
        project_id,
        environment,
        service_id,
        service_version_id,
        definition_digest,
        status,
        revision,
        created_by
      )
      VALUES (
        '${nextUuid()}',
        '${workspaceA}',
        '${projectA}',
        'production',
        '${serviceA}',
        '${serviceVersion.id}',
        '${serviceVersion.definition.digest}',
        '${status}',
        ${revision},
        '${actorA}'
      );
    `,
  });
}

function createDeploymentState(status) {
  return createDeployment(status);
}

function transitionDeployment(entity, to, allowFailure) {
  return scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    allowFailure,
    sql: `
      UPDATE app.deployments
      SET status = '${to}', revision = ${entity.revision + 1}
      WHERE id = '${entity.id}';
      ${deploymentEventSql({
        deploymentId: entity.id,
        revision: entity.revision + 1,
        from: entity.status,
        to,
      })}
    `,
  });
}

function deploymentEventSql({ deploymentId, revision, from, to }) {
  const fromSql = from === null ? "NULL" : `'${from}'`;
  return `
    INSERT INTO app.deployment_events (
      id,
      workspace_id,
      project_id,
      environment,
      deployment_id,
      deployment_revision,
      from_status,
      to_status,
      reason,
      actor_id
    )
    VALUES (
      '${nextUuid()}',
      '${workspaceA}',
      '${projectA}',
      'production',
      '${deploymentId}',
      ${revision},
      ${fromSql},
      '${to}',
      'synthetic deployment matrix transition',
      '${actorA}'
    );
  `;
}

function insertCredentialWithInitial({ status, revision, allowFailure }) {
  return scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    allowFailure,
    sql: credentialInsertSql({
      id: nextUuid(),
      serviceId: serviceA,
      accessPolicyId: accessPolicyA,
      subjectId: `synthetic-initial-${uuidCounter}`,
      status,
      revision,
    }),
  });
}

function createCredentialState(status) {
  const id = nextUuid();
  scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: credentialInsertSql({
      id,
      serviceId: serviceA,
      accessPolicyId: accessPolicyA,
      subjectId: `synthetic-credential-${uuidCounter}`,
      status: "active",
      revision: 1,
    }),
  });
  if (status === "active") {
    return { id, revision: 1, status };
  }
  scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: `
      UPDATE app.credentials
      SET status = '${status}', revision = 2
      WHERE id = '${id}';
    `,
  });
  return { id, revision: 2, status };
}

function transitionCredential(entity, to, allowFailure) {
  return scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    allowFailure,
    sql: `
      UPDATE app.credentials
      SET status = '${to}', revision = ${entity.revision + 1}
      WHERE id = '${entity.id}';
    `,
  });
}

function insertTestRunWithInitial({ status, revision, allowFailure }) {
  const definition = createDefinition(nextReleaseVersion());
  return scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    allowFailure,
    sql: testRunInsertSql({
      id: nextUuid(),
      definition,
      candidateId: null,
      status,
      revision,
    }),
  });
}

function createTestRunState(status) {
  const definition = createDefinition(nextReleaseVersion());
  const id = nextUuid();
  scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: testRunInsertSql({
      id,
      definition,
      candidateId: null,
      status: "queued",
      revision: 1,
    }),
  });
  if (status === "queued") {
    return { id, revision: 1, status };
  }
  if (status === "running") {
    transitionTestRun({ id, revision: 1, status: "queued" }, "running", false);
    return { id, revision: 2, status };
  }
  if (status === "cancelled") {
    transitionTestRun(
      { id, revision: 1, status: "queued" },
      "cancelled",
      false,
    );
    return { id, revision: 2, status };
  }
  transitionTestRun({ id, revision: 1, status: "queued" }, "running", false);
  transitionTestRun({ id, revision: 2, status: "running" }, status, false);
  return { id, revision: 3, status };
}

function transitionTestRun(entity, to, allowFailure) {
  const completion =
    to === "passed" || to === "failed"
      ? `, completed_at = CURRENT_TIMESTAMP, report_digest = '${digest()}'`
      : to === "cancelled"
        ? ", completed_at = CURRENT_TIMESTAMP"
        : ", completed_at = NULL, report_digest = NULL";
  return scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    allowFailure,
    sql: `
      UPDATE app.test_runs
      SET status = '${to}', revision = ${entity.revision + 1}${completion}
      WHERE id = '${entity.id}';
    `,
  });
}

function serviceVersionInsertSql({
  id,
  definition,
  candidateId,
  version,
  status,
  revision,
}) {
  return `
    INSERT INTO app.service_versions (
      id,
      workspace_id,
      project_id,
      environment,
      service_id,
      version,
      definition_id,
      candidate_id,
      candidate_status,
      definition_digest,
      artifact_digest,
      status,
      revision,
      created_by
    )
    VALUES (
      '${id}',
      '${workspaceA}',
      '${projectA}',
      'production',
      '${definition.serviceId}',
      '${version}',
      '${definition.id}',
      '${candidateId}',
      'approved',
      '${definition.digest}',
      '${digest()}',
      '${status}',
      ${revision},
      '${actorA}'
    );
  `;
}

function credentialInsertSql({
  id,
  serviceId,
  accessPolicyId,
  subjectId,
  status,
  revision,
}) {
  return `
    INSERT INTO app.credentials (
      id,
      workspace_id,
      project_id,
      environment,
      service_id,
      access_policy_id,
      kind,
      status,
      revision,
      subject_id,
      public_digest,
      created_by
    )
    VALUES (
      '${id}',
      '${workspaceA}',
      '${projectA}',
      'production',
      '${serviceId}',
      '${accessPolicyId}',
      'api_key',
      '${status}',
      ${revision},
      '${subjectId}',
      '${digest()}',
      '${actorA}'
    );
  `;
}

function testRunInsertSql({ id, definition, candidateId, status, revision }) {
  const candidateSql = candidateId === null ? "NULL" : `'${candidateId}'`;
  return `
    INSERT INTO app.test_runs (
      id,
      workspace_id,
      project_id,
      environment,
      definition_id,
      definition_digest,
      candidate_id,
      status,
      revision,
      created_by
    )
    VALUES (
      '${id}',
      '${workspaceA}',
      '${projectA}',
      'production',
      '${definition.id}',
      '${definition.digest}',
      ${candidateSql},
      '${status}',
      ${revision},
      '${actorA}'
    );
  `;
}

function serviceVersionPath(status) {
  if (status === "approved") {
    return [];
  }
  if (status === "deploying") {
    return ["deploying"];
  }
  if (status === "published") {
    return ["deploying", "published"];
  }
  if (status === "suspended") {
    return ["deploying", "published", "suspended"];
  }
  if (status === "retired") {
    return ["deploying", "published", "suspended", "retired"];
  }
  throw new Error(`unsupported service version status ${status}`);
}

function deploymentPath(status) {
  if (status === "provisioning") {
    return [];
  }
  if (status === "healthy") {
    return ["healthy"];
  }
  if (status === "degraded") {
    return ["healthy", "degraded"];
  }
  if (status === "draining") {
    return ["healthy", "draining"];
  }
  if (status === "suspended") {
    return ["healthy", "draining", "suspended"];
  }
  if (status === "stopped") {
    return ["healthy", "draining", "stopped"];
  }
  if (status === "blocked") {
    return ["blocked"];
  }
  throw new Error(`unsupported deployment status ${status}`);
}

function assertReleaseOpsRules() {
  for (const [label, table, assignment, id] of [
    [
      "module version immutable fact update is rejected",
      "module_versions",
      "status = 'retired'",
      moduleVersionA,
    ],
    [
      "service definition immutable fact update is rejected",
      "service_definitions",
      "digest = 'sha256:1212121212121212121212121212121212121212121212121212121212121212'",
      definitionA,
    ],
    [
      "candidate immutable fact update is rejected",
      "candidates",
      "status = 'withdrawn'",
      candidateA,
    ],
    [
      "service version immutable fact update is rejected",
      "service_versions",
      "status = 'retired'",
      serviceVersionA,
    ],
  ]) {
    expectFailure(
      label,
      scopedCommand({
        workspaceId: workspaceA,
        actorId: actorA,
        sql: `UPDATE app.${table} SET ${assignment} WHERE id = '${id}';`,
        allowFailure: true,
      }),
      `${table} rows are immutable`,
    );
  }

  expectFailure(
    "duplicate module exact version is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        INSERT INTO app.module_versions (
          id,
          workspace_id,
          project_id,
          environment,
          module_name,
          module_kind,
          version,
          status,
          artifact_digest,
          signature_digest,
          created_by
        )
        VALUES (
          '018f0000-0000-7000-8000-000000002101',
          '${workspaceA}',
          '${projectA}',
          'production',
          'search_documents',
          'capability',
          '1.0.0',
          'approved',
          'sha256:2121212121212121212121212121212121212121212121212121212121212121',
          'sha256:3131313131313131313131313131313131313131313131313131313131313131',
          '${actorA}'
        );
      `,
      allowFailure: true,
    }),
    "duplicate key value violates unique constraint",
  );
  expectFailure(
    "duplicate service definition digest is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        INSERT INTO app.service_definitions (
          id,
          workspace_id,
          project_id,
          environment,
          service_id,
          version,
          digest,
          canonical_json,
          created_by
        )
        VALUES (
          '018f0000-0000-7000-8000-000000002201',
          '${workspaceA}',
          '${projectA}',
          'production',
          '${serviceA}',
          '1.0.1',
          'sha256:1111111111111111111111111111111111111111111111111111111111111111',
          '{"metadata":{"version":"1.0.1"}}',
          '${actorA}'
        );
      `,
      allowFailure: true,
    }),
    "duplicate key value violates unique constraint",
  );
  expectFailure(
    "duplicate service definition exact version is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        INSERT INTO app.service_definitions (
          id,
          workspace_id,
          project_id,
          environment,
          service_id,
          version,
          digest,
          canonical_json,
          created_by
        )
        VALUES (
          '018f0000-0000-7000-8000-000000002202',
          '${workspaceA}',
          '${projectA}',
          'production',
          '${serviceA}',
          '1.0.0',
          'sha256:1313131313131313131313131313131313131313131313131313131313131313',
          '{"metadata":{"version":"1.0.0"}}',
          '${actorA}'
        );
      `,
      allowFailure: true,
    }),
    "duplicate key value violates unique constraint",
  );
  expectFailure(
    "duplicate service version exact version is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        INSERT INTO app.service_versions (
          id,
          workspace_id,
          project_id,
          environment,
          service_id,
          version,
          definition_id,
          candidate_id,
          definition_digest,
          artifact_digest,
          status,
          created_by
        )
        VALUES (
          '018f0000-0000-7000-8000-000000002502',
          '${workspaceA}',
          '${projectA}',
          'production',
          '${serviceA}',
          '1.0.0',
          '${definitionA}',
          '${candidateA}',
          'sha256:1111111111111111111111111111111111111111111111111111111111111111',
          'sha256:6161616161616161616161616161616161616161616161616161616161616161',
          'published',
          '${actorA}'
        );
      `,
      allowFailure: true,
    }),
    "duplicate key value violates unique constraint",
  );
  expectFailure(
    "service version digest must match approved definition digest",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        INSERT INTO app.service_versions (
          id,
          workspace_id,
          project_id,
          environment,
          service_id,
          version,
          definition_id,
          candidate_id,
          definition_digest,
          artifact_digest,
          status,
          created_by
        )
        VALUES (
          '018f0000-0000-7000-8000-000000002501',
          '${workspaceA}',
          '${projectA}',
          'production',
          '${serviceA}',
          '1.0.1',
          '${definitionA}',
          '${candidateA}',
          'sha256:0000000000000000000000000000000000000000000000000000000000000000',
          'sha256:6262626262626262626262626262626262626262626262626262626262626262',
          'published',
          '${actorA}'
        );
      `,
      allowFailure: true,
    }),
    "violates foreign key constraint",
  );
  expectFailure(
    "cross-environment credential service reference is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        INSERT INTO app.credentials (
          id,
          workspace_id,
          project_id,
          environment,
          service_id,
          access_policy_id,
          kind,
          status,
          subject_id,
          public_digest,
          created_by
        )
        VALUES (
          '018f0000-0000-7000-8000-000000002801',
          '${workspaceA}',
          '${projectA}',
          'test',
          '${serviceA}',
          '${accessPolicyA}',
          'api_key',
          'active',
          'synthetic-cross-env',
          'sha256:8181818181818181818181818181818181818181818181818181818181818181',
          '${actorA}'
        );
      `,
      allowFailure: true,
    }),
    "violates foreign key constraint",
  );
  expectFailure(
    "duplicate usage idempotency key is rejected",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        INSERT INTO app.usage_events (
          id,
          workspace_id,
          project_id,
          environment,
          service_version_id,
          credential_id,
          idempotency_key,
          metric_key,
          unit,
          quantity
        )
        VALUES (
          '018f0000-0000-7000-8000-000000002902',
          '${workspaceA}',
          '${projectA}',
          'production',
          '${serviceVersionA}',
          '${credentialA}',
          'idem_synthetic_0001',
          'mcp.request',
          'request',
          1
        );
      `,
      allowFailure: true,
    }),
    "duplicate key value violates unique constraint",
  );
  expectFailure(
    "audit event update is rejected for runtime role",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        UPDATE app.audit_events
        SET summary = 'tampered'
        WHERE id = '018f0000-0000-7000-8000-000000001951';
      `,
      allowFailure: true,
    }),
    "audit events are append-only",
  );
  expectFailure(
    "audit event delete is rejected for runtime role",
    scopedCommand({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        DELETE FROM app.audit_events
        WHERE id = '018f0000-0000-7000-8000-000000001951';
      `,
      allowFailure: true,
    }),
    "audit events are append-only",
  );
  assertEquals(
    "schema scan has no secret_plaintext or body columns",
    queryScalar(
      databaseUrl,
      `
        SELECT count(*)
        FROM information_schema.columns
        WHERE table_schema = 'app'
          AND column_name IN ('secret_plaintext', 'body')
      `,
    ),
    "0",
  );
}

function assertUtcTimestamps() {
  assertEquals(
    "Asia/Shanghai insert created_at has no 8-hour offset",
    scopedScalar({
      workspaceId: workspaceA,
      actorId: actorA,
      timeZone: "Asia/Shanghai",
      sql: `
        INSERT INTO app.data_sources (
          id,
          workspace_id,
          project_id,
          environment,
          slug,
          display_name,
          kind,
          sensitivity,
          rights,
          version_strategy,
          state,
          revision,
          created_by
        )
        VALUES (
          '018f0000-0000-7000-8000-000000000901',
          '${workspaceA}',
          '${projectA}',
          'production',
          'utc-probe',
          'UTC Probe',
          'file_upload',
          'internal',
          'synthetic_fixture_rights',
          'fixed',
          'active',
          1,
          '${actorA}'
        )
        RETURNING abs(extract(epoch from clock_timestamp() - created_at)) < 10;
      `,
    }),
    "t",
  );
  assertEquals(
    "Asia/Shanghai update updated_at has no 8-hour offset",
    scopedScalar({
      workspaceId: workspaceA,
      actorId: actorA,
      timeZone: "Asia/Shanghai",
      sql: `
        UPDATE app.data_sources
        SET revision = 2
        WHERE id = '018f0000-0000-7000-8000-000000000901'
        RETURNING abs(extract(epoch from clock_timestamp() - updated_at)) < 10;
      `,
    }),
    "t",
  );
}

function assertUuidV7Rules() {
  expectFailure(
    "workspace ID non-version-7 UUID is rejected",
    adminCommand(
      `
        INSERT INTO app.workspaces (id, slug, kind, display_name, region)
        VALUES (
          '018f0000-0000-6000-8000-000000000901',
          'bad-version-workspace',
          'team',
          'Bad Version Workspace',
          'us-east-1'
        );
      `,
      true,
    ),
    "violates check constraint",
  );
  expectFailure(
    "project ID version-7 invalid variant is rejected",
    adminCommand(
      `
        INSERT INTO app.projects (
          id,
          workspace_id,
          slug,
          display_name,
          default_region,
          default_environment,
          created_by
        )
        VALUES (
          '018f0000-0000-7000-0000-000000000902',
          '${workspaceA}',
          'bad-variant-project',
          'Bad Variant Project',
          'us-east-1',
          'production',
          '${actorA}'
        );
      `,
      true,
    ),
    "violates check constraint",
  );
  expectFailure(
    "actor_id version-7 invalid variant is rejected",
    adminCommand(
      `
        INSERT INTO app.workspace_members (workspace_id, actor_id, role)
        VALUES (
          '${workspaceA}',
          '018f0000-0000-7000-0000-000000000903',
          'viewer'
        );
      `,
      true,
    ),
    "violates check constraint",
  );
  expectFailure(
    "non UUID input is rejected by uuid type",
    adminCommand(
      `
        INSERT INTO app.workspaces (id, slug, kind, display_name, region)
        VALUES (
          'not-a-uuid',
          'not-a-uuid-workspace',
          'team',
          'Not UUID Workspace',
          'us-east-1'
        );
      `,
      true,
    ),
    "invalid input syntax for type uuid",
  );
}

function assertOpaqueIdMapping() {
  const resources = {
    service: ["svc", serviceA],
    definition: ["def", definitionA],
    candidate: ["cand", candidateA],
    serviceVersion: ["sv", serviceVersionA],
    deployment: ["dep", deploymentA],
    accessPolicy: ["ap", accessPolicyA],
    policyVersion: ["pol", "018f0000-0000-7000-8000-000000001702"],
    credential: ["cred", credentialA],
    trace: ["trace", "018f0000-0000-7000-8000-000000001901"],
    audit: ["audit", "018f0000-0000-7000-8000-000000001951"],
  };
  for (const [resource, [prefix, uuid]] of Object.entries(resources)) {
    const encoded = encodeOpaqueIdForTest(prefix, uuid.toUpperCase());
    const decoded = decodeOpaqueIdForTest(prefix, encoded);
    assertEquals(`${resource} opaque ID round trip`, decoded, uuid);
    assertEquals(
      `${resource} opaque ID canonicalizes lowercase`,
      encodeOpaqueIdForTest(prefix, decoded),
      encoded,
    );
    expectLocalFailure(
      `${resource} wrong prefix is rejected`,
      () => decodeOpaqueIdForTest(`${prefix}x`, encoded),
      "prefix does not match resource",
    );
    expectLocalFailure(
      `${resource} non UUIDv7 opaque ID is rejected`,
      () =>
        decodeOpaqueIdForTest(
          prefix,
          `${prefix}_018f0000-0000-6000-8000-000000000001`,
        ),
      "UUID must be canonical UUIDv7",
    );
  }
}

function encodeOpaqueIdForTest(prefix, uuid) {
  const canonicalUuid = uuid.toLowerCase();
  if (!uuidV7ForTest.test(canonicalUuid)) {
    throw new Error("UUID must be canonical UUIDv7");
  }
  return `${prefix}_${canonicalUuid}`;
}

function decodeOpaqueIdForTest(prefix, opaqueId) {
  const expectedPrefix = `${prefix}_`;
  const canonicalOpaqueId = opaqueId.toLowerCase();
  if (!canonicalOpaqueId.startsWith(expectedPrefix)) {
    throw new Error("prefix does not match resource");
  }
  const uuid = canonicalOpaqueId.slice(expectedPrefix.length);
  if (!uuidV7ForTest.test(uuid)) {
    throw new Error("UUID must be canonical UUIDv7");
  }
  return uuid;
}

function assertIndexes() {
  assertPlanUsesIndex(
    "projects owner/status query",
    "idx_projects_workspace_status",
    scopedPlan(`
      SELECT *
      FROM app.projects
      WHERE workspace_id = '${workspaceA}' AND status = 'active'
      ORDER BY updated_at DESC
      LIMIT 10
    `),
  );
  assertPlanUsesIndex(
    "data versions owner/status query",
    "idx_data_versions_owner_status",
    scopedPlan(`
      SELECT *
      FROM app.data_versions
      WHERE workspace_id = '${workspaceA}'
        AND project_id = '${projectA}'
        AND environment = 'production'
        AND status = 'completed'
      ORDER BY updated_at DESC
      LIMIT 10
    `),
  );
  assertPlanUsesIndex(
    "drafts owner/state query",
    "idx_drafts_owner_state",
    scopedPlan(`
      SELECT *
      FROM app.drafts
      WHERE workspace_id = '${workspaceA}'
        AND project_id = '${projectA}'
        AND environment = 'production'
        AND state = 'editing'
      ORDER BY updated_at DESC
      LIMIT 10
    `),
  );
  assertPlanUsesIndex(
    "draft revisions scope query",
    "idx_draft_revisions_scope_revision",
    scopedPlan(`
      SELECT *
      FROM app.draft_revisions
      WHERE workspace_id = '${workspaceA}'
        AND project_id = '${projectA}'
        AND environment = 'production'
        AND draft_id = '${draftA}'
      ORDER BY revision DESC
      LIMIT 10
    `),
  );
  assertPlanUsesIndex(
    "service versions status query",
    "idx_service_versions_status",
    scopedPlan(`
      SELECT *
      FROM app.service_versions
      WHERE workspace_id = '${workspaceA}'
        AND project_id = '${projectA}'
        AND environment = 'production'
        AND service_id = '${serviceA}'
        AND status = 'published'
      ORDER BY created_at DESC
      LIMIT 10
    `),
  );
  assertPlanUsesIndex(
    "deployments status query",
    "idx_deployments_status",
    scopedPlan(`
      SELECT *
      FROM app.deployments
      WHERE workspace_id = '${workspaceA}'
        AND project_id = '${projectA}'
        AND environment = 'production'
        AND service_id = '${serviceA}'
        AND status = 'healthy'
      ORDER BY updated_at DESC
      LIMIT 10
    `),
  );
  assertPlanUsesIndex(
    "request traces trace query",
    "idx_request_traces_trace",
    scopedPlan(`
      SELECT *
      FROM app.request_traces
      WHERE workspace_id = '${workspaceA}'
        AND project_id = '${projectA}'
        AND environment = 'production'
        AND trace_id = 'trace_synthetic_0001'
    `),
  );
  assertPlanUsesIndex(
    "usage events service/time query",
    "idx_usage_events_service_time",
    scopedPlan(`
      SELECT *
      FROM app.usage_events
      WHERE workspace_id = '${workspaceA}'
        AND project_id = '${projectA}'
        AND environment = 'production'
        AND service_version_id = '${serviceVersionA}'
      ORDER BY event_time DESC
      LIMIT 10
    `),
  );
}

function insertDataSource({ id, slug, revision, allowFailure = false }) {
  return scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    allowFailure,
    sql: `
      INSERT INTO app.data_sources (
        id,
        workspace_id,
        project_id,
        environment,
        slug,
        display_name,
        kind,
        sensitivity,
        rights,
        version_strategy,
        state,
        revision,
        created_by
      )
      VALUES (
        '${id}',
        '${workspaceA}',
        '${projectA}',
        'production',
        '${slug}',
        '${slug}',
        'file_upload',
        'internal',
        'synthetic_fixture_rights',
        'fixed',
        'active',
        ${revision},
        '${actorA}'
      );
    `,
  });
}

function insertDraft({ id, title, revision, allowFailure = false }) {
  return scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    allowFailure,
    sql: `
      INSERT INTO app.drafts (
        id,
        workspace_id,
        project_id,
        environment,
        revision,
        state,
        current_step,
        creation_mode,
        title,
        document,
        created_by,
        updated_by
      )
      VALUES (
        '${id}',
        '${workspaceA}',
        '${projectA}',
        'production',
        ${revision},
        'editing',
        'goal',
        'blank',
        '${title}',
        '{}',
        '${actorA}',
        '${actorA}'
      );
    `,
  });
}

function createDraftWithRevision({ id, title, document }) {
  return scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: `
      INSERT INTO app.drafts (
        id,
        workspace_id,
        project_id,
        environment,
        revision,
        state,
        current_step,
        creation_mode,
        title,
        document,
        created_by,
        updated_by
      )
      VALUES (
        '${id}',
        '${workspaceA}',
        '${projectA}',
        'production',
        1,
        'editing',
        'goal',
        'blank',
        '${title}',
        '${document}',
        '${actorA}',
        '${actorA}'
      );
      INSERT INTO app.draft_revisions (
        workspace_id,
        project_id,
        environment,
        draft_id,
        revision,
        document,
        changed_by
      )
      VALUES (
        '${workspaceA}',
        '${projectA}',
        'production',
        '${id}',
        1,
        '${document}',
        '${actorA}'
      );
    `,
  });
}

function advanceDraftToSubmitted(id) {
  const states = [
    ["validating", 2],
    ["ready", 3],
    ["building", 4],
    ["built", 5],
    ["submitted", 6],
  ];
  return scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    sql: states
      .map(
        ([state, revision]) => `
          UPDATE app.drafts
          SET state = '${state}', revision = ${revision}
          WHERE id = '${id}';
          INSERT INTO app.draft_revisions (
            workspace_id,
            project_id,
            environment,
            draft_id,
            revision,
            document,
            changed_by
          )
          SELECT
            workspace_id,
            project_id,
            environment,
            id,
            revision,
            document,
            updated_by
          FROM app.drafts
          WHERE id = '${id}';
        `,
      )
      .join("\n"),
  });
}

function assertSubmittedDraftIntact(id) {
  assertEquals(
    "submitted draft failed update leaves draft and revisions unchanged",
    scopedScalar({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        SELECT
          state::text
          || '|'
          || revision::text
          || '|'
          || updated_by::text
          || '|'
          || (
            SELECT count(*)::text
            FROM app.draft_revisions
            WHERE workspace_id = app.drafts.workspace_id
              AND project_id = app.drafts.project_id
              AND environment = app.drafts.environment
              AND draft_id = app.drafts.id
              AND revision = 7
          )
        FROM app.drafts
        WHERE id = '${id}';
      `,
    }),
    `submitted|6|${actorA}|0`,
  );
}

function insertDataVersion({
  id,
  workspaceId,
  projectId,
  environment,
  dataSourceId,
  status,
  processingStage,
  revision,
  contentDigest,
  createdBy,
  completedAt,
  allowFailure = false,
}) {
  const columns = [
    "id",
    "workspace_id",
    "project_id",
    "environment",
    "data_source_id",
    "status",
    "processing_stage",
    "revision",
    "created_by",
  ];
  const values = [
    `'${id}'`,
    `'${workspaceId}'`,
    `'${projectId}'`,
    `'${environment}'`,
    `'${dataSourceId}'`,
    `'${status}'`,
    `'${processingStage}'`,
    revision,
    `'${createdBy}'`,
  ];
  if (contentDigest) {
    columns.push("content_digest");
    values.push(`'${contentDigest}'`);
  }
  if (completedAt) {
    columns.push("completed_at");
    values.push(completedAt);
  }
  return scopedCommand({
    workspaceId: workspaceA,
    actorId: actorA,
    allowFailure,
    sql: `
      INSERT INTO app.data_versions (${columns.join(", ")})
      VALUES (${values.join(", ")});
    `,
  });
}

function scopedPlan(sql) {
  return queryScalar(
    databaseUrl,
    scopedBlock({
      workspaceId: workspaceA,
      actorId: actorA,
      sql: `
        SET LOCAL enable_seqscan = off;
        SET LOCAL enable_sort = off;
        EXPLAIN (FORMAT TEXT) ${sql};
      `,
    }),
  );
}

function nextUuid() {
  uuidCounter += 1;
  return `018f0000-0000-7000-8000-${String(uuidCounter).padStart(12, "0")}`;
}

function assertEquals(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
  console.log(`PASS ${label}`);
}

function expectFailure(label, result, expectedMessage) {
  if (result.status === 0) {
    throw new Error(`${label}: expected failure but command succeeded`);
  }
  const output = `${result.stdout}\n${result.stderr}`;
  if (!output.includes(expectedMessage)) {
    throw new Error(`${label}: expected ${expectedMessage}, got ${output}`);
  }
  console.log(`PASS ${label}`);
}

function expectLocalFailure(label, action, expectedMessage) {
  try {
    action();
  } catch (error) {
    if (error instanceof Error && error.message.includes(expectedMessage)) {
      console.log(`PASS ${label}`);
      return;
    }
    throw new Error(`${label}: expected ${expectedMessage}, got ${error}`);
  }
  throw new Error(`${label}: expected failure but command succeeded`);
}

function assertPlanUsesIndex(label, indexName, plan) {
  if (!plan.includes(indexName)) {
    throw new Error(
      `${label}: expected plan to use ${indexName}, got:\n${plan}`,
    );
  }
  console.log(`PASS ${label} uses ${indexName}`);
}

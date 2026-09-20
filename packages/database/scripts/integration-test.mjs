import {
  createModuleCatalogRepository,
  withTenantTransaction,
} from "../dist/index.js";
import {
  adminDatabaseUrlFromEnv,
  applySqlFile,
  databaseUrlForName,
  execSql,
  migrationsDir,
  packageRoot,
  psql,
  queryScalar,
  quoteIdentifier,
} from "./database-lib.mjs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const adminUrl = adminDatabaseUrlFromEnv();
const suffix = `${process.pid}_${Date.now()}`.replaceAll(/[^a-zA-Z0-9_]/g, "_");
const databaseName = `mcp_wp02b_${suffix}`;
const runtimeRole = `mcp_wp02b_runtime_${suffix}`.toLowerCase();
const databaseUrl = databaseUrlForName(adminUrl, databaseName);

try {
  resetDatabase();
  verifyMemberRoleAlignment(databaseUrl);

  resetDatabase();

  runNode("scripts/migrate.mjs", { DATABASE_URL: databaseUrl });
  runNode("scripts/migrate.mjs", { DATABASE_URL: databaseUrl });
  runNode("scripts/rollback.mjs", { DATABASE_URL: databaseUrl });
  runNode("scripts/migrate.mjs", { DATABASE_URL: databaseUrl });

  const bypassRls =
    queryScalar(
      adminUrl,
      `SELECT rolbypassrls FROM pg_roles WHERE rolname = '${runtimeRole}'`,
    ) === "t";
  if (bypassRls) {
    throw new Error(`${runtimeRole} must not have BYPASSRLS`);
  }

  execSql(
    databaseUrl,
    `GRANT USAGE ON SCHEMA app TO ${quoteIdentifier(runtimeRole)}`,
  );
  execSql(
    databaseUrl,
    `GRANT SELECT ON ALL TABLES IN SCHEMA app TO ${quoteIdentifier(runtimeRole)}`,
  );
  execSql(
    databaseUrl,
    `
      GRANT INSERT, UPDATE, DELETE ON TABLE
        app.workspaces,
        app.workspace_members,
        app.projects,
        app.project_members,
        app.data_sources,
        app.data_versions,
        app.drafts,
        app.draft_revisions,
        app.multipart_uploads,
        app.multipart_upload_parts,
        app.services,
        app.service_definitions,
        app.definition_modules,
        app.candidates,
        app.test_runs,
        app.test_cases,
        app.service_versions,
        app.deployments,
        app.deployment_events,
        app.access_policies,
        app.policy_versions,
        app.credentials,
        app.credential_secrets,
        app.credential_rotations,
        app.request_traces,
        app.usage_events,
        app.quota_buckets,
        app.audit_events,
        app.idempotency_records,
        app.outbox_events,
        app.outbox_consumptions,
        app.modules,
        app.module_versions
      TO ${quoteIdentifier(runtimeRole)}
    `,
  );
  execSql(
    databaseUrl,
    `
      GRANT EXECUTE ON FUNCTION app.change_member_role_and_record_audit(
        app.member_role_change_scope,
        uuid,
        uuid,
        uuid,
        uuid,
        app.member_role,
        boolean,
        timestamptz,
        uuid
      ) TO ${quoteIdentifier(runtimeRole)}
    `,
  );

  runNode("scripts/verify-tenant-core.mjs", {
    DATABASE_URL: databaseUrl,
    WP02B_RUNTIME_ROLE: runtimeRole,
  });
  await verifyModuleCatalogImpactIsolation(databaseUrl);

  console.log(`database integration test passed: ${databaseName}`);
} finally {
  execSql(
    adminUrl,
    `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`,
    {
      allowFailure: true,
    },
  );
  execSql(adminUrl, `DROP ROLE IF EXISTS ${quoteIdentifier(runtimeRole)}`, {
    allowFailure: true,
  });
}

function resetDatabase() {
  execSql(
    adminUrl,
    `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`,
  );
  execSql(adminUrl, `CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  execSql(
    adminUrl,
    `
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${runtimeRole}') THEN
          CREATE ROLE ${quoteIdentifier(runtimeRole)} NOLOGIN;
        END IF;
      END
      $$;
    `,
  );
}

async function verifyModuleCatalogImpactIsolation(url) {
  seedModuleImpactFixtures(url);
  const reference = {
    moduleId: "capability.search-documents",
    exactVersion: "1.2.3",
    artifactDigest:
      "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  };

  const workspaceAProjectAProduction = await affectedVersions(
    url,
    {
      workspaceId: "018f1000-0000-7000-8000-000000000001",
      projectId: "018f1000-0000-7000-8000-000000000101",
      environment: "production",
      actorId: "018f1000-0000-7000-8000-000000000901",
    },
    reference,
  );
  assertJson(
    "module impact query returns only Workspace A Project A production rows",
    workspaceAProjectAProduction.map((entry) => entry.serviceVersionId),
    [
      "018f1000-0000-7000-8000-000000001501",
      "018f1000-0000-7000-8000-000000001502",
    ],
  );

  const workspaceB = await affectedVersions(
    url,
    {
      workspaceId: "018f1000-0000-7000-8000-000000000002",
      projectId: "018f1000-0000-7000-8000-000000000201",
      environment: "production",
      actorId: "018f1000-0000-7000-8000-000000000902",
    },
    reference,
  );
  assertJson(
    "module impact query isolates Workspace B",
    workspaceB.map((entry) => entry.serviceVersionId),
    ["018f1000-0000-7000-8000-000000002501"],
  );

  const projectB = await affectedVersions(
    url,
    {
      workspaceId: "018f1000-0000-7000-8000-000000000001",
      projectId: "018f1000-0000-7000-8000-000000000102",
      environment: "production",
      actorId: "018f1000-0000-7000-8000-000000000901",
    },
    reference,
  );
  assertJson(
    "module impact query isolates Project B",
    projectB.map((entry) => entry.serviceVersionId),
    ["018f1000-0000-7000-8000-000000003501"],
  );

  const testEnv = await affectedVersions(
    url,
    {
      workspaceId: "018f1000-0000-7000-8000-000000000001",
      projectId: "018f1000-0000-7000-8000-000000000101",
      environment: "test",
      actorId: "018f1000-0000-7000-8000-000000000901",
    },
    reference,
  );
  assertJson(
    "module impact query isolates environment",
    testEnv.map((entry) => entry.serviceVersionId),
    ["018f1000-0000-7000-8000-000000004501"],
  );

  await expectAsyncFailure(
    "module impact query rejects missing actor context",
    () =>
      affectedVersions(
        url,
        {
          workspaceId: "018f1000-0000-7000-8000-000000000001",
          projectId: "018f1000-0000-7000-8000-000000000101",
          environment: "production",
          actorId: "",
        },
        reference,
      ),
    "actorId is required",
  );
  await expectAsyncFailure(
    "module impact query rejects missing workspace context",
    () =>
      affectedVersions(
        url,
        {
          workspaceId: "",
          projectId: "018f1000-0000-7000-8000-000000000101",
          environment: "production",
          actorId: "018f1000-0000-7000-8000-000000000901",
        },
        reference,
      ),
    "workspaceId is required",
  );

  console.log("PASS module impact query enforces PostgreSQL tenant scope");
}

async function affectedVersions(url, scope, reference) {
  return withTenantTransaction(
    {
      async connect() {
        return createPsqlConnection(url);
      },
    },
    {
      actorId: scope.actorId,
      scope: {
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        environment: scope.environment,
      },
    },
    async (transaction) =>
      createModuleCatalogRepository(transaction).findAffectedServiceVersions(
        reference,
      ),
  );
}

function createPsqlConnection(url) {
  const session = { workspaceId: "", actorId: "" };
  return {
    async query(sql, params = []) {
      const normalized = sql.trim();
      if (
        normalized === "BEGIN" ||
        normalized === "COMMIT" ||
        normalized === "ROLLBACK"
      ) {
        return { rows: [], rowCount: 0 };
      }
      if (normalized.includes("set_config")) {
        session.workspaceId = String(params[1] ?? "");
        session.actorId = String(params[3] ?? "");
        return { rows: [{ set_config: "" }], rowCount: 1 };
      }
      const interpolated = interpolateSql(sql, params);
      const result = psql(url, ["-X", "-q", "-t", "-A"], {
        input: `
          BEGIN;
          SELECT set_config('app.workspace_id', ${sqlLiteral(session.workspaceId)}, true),
                 set_config('app.actor_id', ${sqlLiteral(session.actorId)}, true);
          WITH __mcp_query AS (${interpolated})
          SELECT json_build_object(
            'rows', COALESCE(json_agg(row_to_json(__mcp_query)), '[]'::json),
            'rowCount', COUNT(*)
          )::text
          FROM __mcp_query;
          COMMIT;
        `,
      });
      const json = result.stdout
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.startsWith("{") && line.endsWith("}"));
      if (json === undefined) {
        throw new Error(`psql query did not return JSON: ${result.stdout}`);
      }
      return JSON.parse(json);
    },
    async release() {
      return undefined;
    },
  };
}

function interpolateSql(sql, params) {
  return params.reduce(
    (current, param, index) =>
      current.replaceAll(`$${index + 1}`, sqlLiteral(param)),
    sql,
  );
}

function sqlLiteral(value) {
  if (value === null) {
    return "NULL";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

function seedModuleImpactFixtures(url) {
  execSql(
    url,
    `
      SET row_security = off;

      INSERT INTO app.workspaces (id, slug, kind, revision, display_name, region)
      VALUES
        ('018f1000-0000-7000-8000-000000000001', 'impact-a', 'team', 1, 'Impact A', 'us-east-1'),
        ('018f1000-0000-7000-8000-000000000002', 'impact-b', 'team', 1, 'Impact B', 'us-east-1');

      INSERT INTO app.workspace_members (workspace_id, actor_id, role, status)
      VALUES
        ('018f1000-0000-7000-8000-000000000001', '018f1000-0000-7000-8000-000000000901', 'owner', 'active'),
        ('018f1000-0000-7000-8000-000000000002', '018f1000-0000-7000-8000-000000000902', 'owner', 'active');

      INSERT INTO app.projects (
        id, workspace_id, slug, revision, display_name, default_region,
        default_environment, status, created_by
      )
      VALUES
        ('018f1000-0000-7000-8000-000000000101', '018f1000-0000-7000-8000-000000000001', 'project-a', 1, 'Project A', 'us-east-1', 'production', 'active', '018f1000-0000-7000-8000-000000000901'),
        ('018f1000-0000-7000-8000-000000000102', '018f1000-0000-7000-8000-000000000001', 'project-b', 1, 'Project B', 'us-east-1', 'production', 'active', '018f1000-0000-7000-8000-000000000901'),
        ('018f1000-0000-7000-8000-000000000201', '018f1000-0000-7000-8000-000000000002', 'project-a', 1, 'Project A', 'us-east-1', 'production', 'active', '018f1000-0000-7000-8000-000000000902');

      INSERT INTO app.project_members (workspace_id, project_id, actor_id, role, status)
      VALUES
        ('018f1000-0000-7000-8000-000000000001', '018f1000-0000-7000-8000-000000000101', '018f1000-0000-7000-8000-000000000901', 'owner', 'active'),
        ('018f1000-0000-7000-8000-000000000001', '018f1000-0000-7000-8000-000000000102', '018f1000-0000-7000-8000-000000000901', 'owner', 'active'),
        ('018f1000-0000-7000-8000-000000000002', '018f1000-0000-7000-8000-000000000201', '018f1000-0000-7000-8000-000000000902', 'owner', 'active');

      INSERT INTO app.modules (id, module_name, module_kind)
      VALUES (
        '018f1000-0000-7000-8000-000000000301',
        'capability_search_documents',
        'capability'
      );

      INSERT INTO app.module_versions (
        id, module_id, module_name, module_kind, version, status,
        artifact_digest, signature_digest
      )
      VALUES (
        '018f1000-0000-7000-8000-000000000401',
        '018f1000-0000-7000-8000-000000000301',
        'capability_search_documents',
        'capability',
        '1.2.3',
        'draft',
        'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
      );

      UPDATE app.module_versions
      SET status = 'testing', revision = 2
      WHERE id = '018f1000-0000-7000-8000-000000000401';

      UPDATE app.module_versions
      SET status = 'submitted', revision = 3
      WHERE id = '018f1000-0000-7000-8000-000000000401';

      UPDATE app.module_versions
      SET status = 'approved', revision = 4
      WHERE id = '018f1000-0000-7000-8000-000000000401';
    `,
  );

  const scopes = [
    [
      "018f1000-0000-7000-8000-000000000001",
      "018f1000-0000-7000-8000-000000000101",
      "production",
      "018f1000-0000-7000-8000-000000000901",
      "018f1000-0000-7000-8000-000000001001",
      "018f1000-0000-7000-8000-000000001201",
      "018f1000-0000-7000-8000-000000001301",
      "018f1000-0000-7000-8000-000000001501",
      "sha256:1000000000000000000000000000000000000000000000000000000000000001",
    ],
    [
      "018f1000-0000-7000-8000-000000000001",
      "018f1000-0000-7000-8000-000000000101",
      "production",
      "018f1000-0000-7000-8000-000000000901",
      "018f1000-0000-7000-8000-000000001002",
      "018f1000-0000-7000-8000-000000001202",
      "018f1000-0000-7000-8000-000000001302",
      "018f1000-0000-7000-8000-000000001502",
      "sha256:1000000000000000000000000000000000000000000000000000000000000002",
    ],
    [
      "018f1000-0000-7000-8000-000000000002",
      "018f1000-0000-7000-8000-000000000201",
      "production",
      "018f1000-0000-7000-8000-000000000902",
      "018f1000-0000-7000-8000-000000002001",
      "018f1000-0000-7000-8000-000000002201",
      "018f1000-0000-7000-8000-000000002301",
      "018f1000-0000-7000-8000-000000002501",
      "sha256:2000000000000000000000000000000000000000000000000000000000000001",
    ],
    [
      "018f1000-0000-7000-8000-000000000001",
      "018f1000-0000-7000-8000-000000000102",
      "production",
      "018f1000-0000-7000-8000-000000000901",
      "018f1000-0000-7000-8000-000000003001",
      "018f1000-0000-7000-8000-000000003201",
      "018f1000-0000-7000-8000-000000003301",
      "018f1000-0000-7000-8000-000000003501",
      "sha256:3000000000000000000000000000000000000000000000000000000000000001",
    ],
    [
      "018f1000-0000-7000-8000-000000000001",
      "018f1000-0000-7000-8000-000000000101",
      "test",
      "018f1000-0000-7000-8000-000000000901",
      "018f1000-0000-7000-8000-000000004001",
      "018f1000-0000-7000-8000-000000004201",
      "018f1000-0000-7000-8000-000000004301",
      "018f1000-0000-7000-8000-000000004501",
      "sha256:4000000000000000000000000000000000000000000000000000000000000001",
    ],
    [
      "018f1000-0000-7000-8000-000000000001",
      "018f1000-0000-7000-8000-000000000101",
      "development",
      "018f1000-0000-7000-8000-000000000901",
      "018f1000-0000-7000-8000-000000005001",
      "018f1000-0000-7000-8000-000000005201",
      "018f1000-0000-7000-8000-000000005301",
      "018f1000-0000-7000-8000-000000005501",
      "sha256:5000000000000000000000000000000000000000000000000000000000000001",
    ],
  ];
  for (const scope of scopes) {
    insertImpactServiceVersion(url, scope);
  }
}

function insertImpactServiceVersion(url, scope) {
  const [
    workspaceId,
    projectId,
    environment,
    actorId,
    serviceId,
    definitionId,
    candidateId,
    serviceVersionId,
    definitionDigest,
  ] = scope;
  const slug = `svc-${serviceVersionId.slice(-4)}`;
  execSql(
    url,
    `
      SET row_security = off;

      INSERT INTO app.services (
        id, workspace_id, project_id, environment, slug, display_name, created_by
      )
      VALUES (
        '${serviceId}',
        '${workspaceId}',
        '${projectId}',
        '${environment}',
        '${slug}',
        'Impact ${slug}',
        '${actorId}'
      );

      INSERT INTO app.service_definitions (
        id, workspace_id, project_id, environment, service_id, version,
        digest, canonical_json, created_by
      )
      VALUES (
        '${definitionId}',
        '${workspaceId}',
        '${projectId}',
        '${environment}',
        '${serviceId}',
        '1.0.0',
        '${definitionDigest}',
        '{"metadata":{"schemaVersion":"definition.v1"},"modules":[{"moduleId":"capability.search-documents","exactVersion":"1.2.3"}]}',
        '${actorId}'
      );

      INSERT INTO app.definition_modules (
        workspace_id, project_id, environment, definition_id, module_version_id,
        module_name, exact_version, artifact_digest
      )
      VALUES (
        '${workspaceId}',
        '${projectId}',
        '${environment}',
        '${definitionId}',
        '018f1000-0000-7000-8000-000000000401',
        'capability_search_documents',
        '1.2.3',
        'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
      );

      INSERT INTO app.candidates (
        id, workspace_id, project_id, environment, definition_id,
        definition_digest, version, status, created_by
      )
      VALUES (
        '${candidateId}',
        '${workspaceId}',
        '${projectId}',
        '${environment}',
        '${definitionId}',
        '${definitionDigest}',
        '1.0.0',
        'submitted',
        '${actorId}'
      );

      UPDATE app.candidates
      SET status = 'approved', revision = 2
      WHERE id = '${candidateId}';

      INSERT INTO app.service_versions (
        id, workspace_id, project_id, environment, service_id, version,
        definition_id, candidate_id, candidate_status, definition_digest,
        artifact_digest, status, created_by
      )
      VALUES (
        '${serviceVersionId}',
        '${workspaceId}',
        '${projectId}',
        '${environment}',
        '${serviceId}',
        '1.0.0',
        '${definitionId}',
        '${candidateId}',
        'approved',
        '${definitionDigest}',
        'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'approved',
        '${actorId}'
      );

      UPDATE app.service_versions
      SET status = 'deploying', revision = 2
      WHERE id = '${serviceVersionId}';

      UPDATE app.service_versions
      SET status = 'published', revision = 3
      WHERE id = '${serviceVersionId}';
    `,
  );
}

function verifyMemberRoleAlignment(url) {
  for (const migration of [
    "0001_tenant_core.up.sql",
    "0002_release_ops.up.sql",
    "0003_repository_outbox.up.sql",
  ]) {
    applySqlFile(url, join(migrationsDir, migration));
  }

  execSql(
    url,
    `
      SET row_security = off;

      INSERT INTO app.workspaces (id, slug, kind, revision, display_name, region)
      VALUES (
        '018f0000-0000-7000-8000-000000009001',
        'role-alignment',
        'team',
        1,
        'Role Alignment',
        'us-east-1'
      );

      INSERT INTO app.workspace_members (workspace_id, actor_id, role, status)
      VALUES
        (
          '018f0000-0000-7000-8000-000000009001',
          '018f0000-0000-7000-8000-000000009101',
          'developer',
          'active'
        ),
        (
          '018f0000-0000-7000-8000-000000009001',
          '018f0000-0000-7000-8000-000000009102',
          'viewer',
          'active'
        );

      INSERT INTO app.projects (
        id,
        workspace_id,
        slug,
        revision,
        display_name,
        default_region,
        default_environment,
        status,
        created_by
      )
      VALUES (
        '018f0000-0000-7000-8000-000000009201',
        '018f0000-0000-7000-8000-000000009001',
        'role-alignment-project',
        1,
        'Role Alignment Project',
        'us-east-1',
        'development',
        'active',
        '018f0000-0000-7000-8000-000000009101'
      );

      INSERT INTO app.project_members (workspace_id, project_id, actor_id, role, status)
      VALUES
        (
          '018f0000-0000-7000-8000-000000009001',
          '018f0000-0000-7000-8000-000000009201',
          '018f0000-0000-7000-8000-000000009101',
          'developer',
          'active'
        ),
        (
          '018f0000-0000-7000-8000-000000009001',
          '018f0000-0000-7000-8000-000000009201',
          '018f0000-0000-7000-8000-000000009102',
          'viewer',
          'active'
        );
    `,
  );

  applySqlFile(url, join(migrationsDir, "0004_member_role_alignment.up.sql"));

  assertScalar(
    "member_role expand keeps legacy and new values",
    queryScalar(
      url,
      `
        SELECT string_agg(enumlabel, ',' ORDER BY enumlabel)
        FROM pg_enum
        WHERE enumtypid = 'app.member_role'::regtype
      `,
    ),
    "admin,developer,editor,observer,operator,owner,publisher,reviewer,viewer",
  );
  assertScalar(
    "workspace legacy developer remains before data migration",
    queryScalar(
      url,
      `
        SELECT role::text
        FROM app.workspace_members
        WHERE actor_id = '018f0000-0000-7000-8000-000000009101'
      `,
    ),
    "developer",
  );
  expectFileFailure(
    "member_role contract rejects unmigrated legacy rows",
    url,
    join(migrationsDir, "0006_member_role_contract.up.sql"),
    "cannot contract member_role while legacy developer/viewer rows exist",
  );
  assertScalar(
    "failed member_role contract leaves expanded enum",
    queryScalar(
      url,
      `
        SELECT string_agg(enumlabel, ',' ORDER BY enumlabel)
        FROM pg_enum
        WHERE enumtypid = 'app.member_role'::regtype
      `,
    ),
    "admin,developer,editor,observer,operator,owner,publisher,reviewer,viewer",
  );

  applySqlFile(
    url,
    join(migrationsDir, "0005_member_role_data_migration.up.sql"),
  );

  assertScalar(
    "member_role data migration marker exists",
    queryScalar(
      url,
      "SELECT EXISTS (SELECT 1 FROM app.schema_migrations WHERE version = '0005_member_role_data_migration')",
    ),
    "t",
  );
  assertScalar(
    "workspace developer migrates to editor",
    queryScalar(
      url,
      `
        SELECT role::text
        FROM app.workspace_members
        WHERE actor_id = '018f0000-0000-7000-8000-000000009101'
      `,
    ),
    "editor",
  );
  assertScalar(
    "workspace viewer migrates to observer",
    queryScalar(
      url,
      `
        SELECT role::text
        FROM app.workspace_members
        WHERE actor_id = '018f0000-0000-7000-8000-000000009102'
      `,
    ),
    "observer",
  );
  assertScalar(
    "project developer migrates to editor",
    queryScalar(
      url,
      `
        SELECT role::text
        FROM app.project_members
        WHERE actor_id = '018f0000-0000-7000-8000-000000009101'
      `,
    ),
    "editor",
  );
  assertScalar(
    "project viewer migrates to observer",
    queryScalar(
      url,
      `
        SELECT role::text
        FROM app.project_members
        WHERE actor_id = '018f0000-0000-7000-8000-000000009102'
      `,
    ),
    "observer",
  );

  applySqlFile(url, join(migrationsDir, "0006_member_role_contract.up.sql"));

  assertScalar(
    "member_role contract matches authz RbacRole set",
    queryScalar(
      url,
      `
        SELECT string_agg(enumlabel, ',' ORDER BY enumlabel)
        FROM pg_enum
        WHERE enumtypid = 'app.member_role'::regtype
      `,
    ),
    "admin,editor,observer,operator,owner,publisher,reviewer",
  );

  const finalRoles = [
    "owner",
    "admin",
    "editor",
    "publisher",
    "reviewer",
    "observer",
    "operator",
  ];
  for (const [index, role] of finalRoles.entries()) {
    const actor = `018f0000-0000-7000-8000-0000000092${String(index + 10).padStart(2, "0")}`;
    execSql(
      url,
      `
        INSERT INTO app.workspace_members (workspace_id, actor_id, role, status)
        VALUES (
          '018f0000-0000-7000-8000-000000009001',
          '${actor}',
          '${role}',
          'active'
        );

        INSERT INTO app.project_members (workspace_id, project_id, actor_id, role, status)
        VALUES (
          '018f0000-0000-7000-8000-000000009001',
          '018f0000-0000-7000-8000-000000009201',
          '${actor}',
          '${role}',
          'active'
        );
      `,
    );
  }
  console.log(
    "PASS all seven member roles can be stored in workspace and project members",
  );

  expectSqlFailure(
    "developer role is rejected after member_role alignment",
    url,
    `
      INSERT INTO app.workspace_members (workspace_id, actor_id, role, status)
      VALUES (
        '018f0000-0000-7000-8000-000000009001',
        '018f0000-0000-7000-8000-000000009301',
        'developer',
        'active'
      );
    `,
    "invalid input value for enum app.member_role",
  );
  expectSqlFailure(
    "viewer role is rejected after member_role alignment",
    url,
    `
      INSERT INTO app.project_members (workspace_id, project_id, actor_id, role, status)
      VALUES (
        '018f0000-0000-7000-8000-000000009001',
        '018f0000-0000-7000-8000-000000009201',
        '018f0000-0000-7000-8000-000000009302',
        'viewer',
        'active'
      );
    `,
    "invalid input value for enum app.member_role",
  );

  applySqlFile(url, join(migrationsDir, "0006_member_role_contract.down.sql"));
  console.log(
    "PASS member_role contract down expands old values without data loss",
  );
  assertScalar(
    "member_role contract down restores expanded enum",
    queryScalar(
      url,
      `
        SELECT string_agg(enumlabel, ',' ORDER BY enumlabel)
        FROM pg_enum
        WHERE enumtypid = 'app.member_role'::regtype
      `,
    ),
    "admin,developer,editor,observer,operator,owner,publisher,reviewer,viewer",
  );

  expectFileFailure(
    "member_role data migration down rejects non-legacy roles",
    url,
    join(migrationsDir, "0005_member_role_data_migration.down.sql"),
    "cannot rollback member_role data migration",
  );
  assertScalar(
    "failed member_role data rollback keeps migration marker",
    queryScalar(
      url,
      "SELECT EXISTS (SELECT 1 FROM app.schema_migrations WHERE version = '0005_member_role_data_migration')",
    ),
    "t",
  );
  assertScalar(
    "failed member_role data rollback keeps publisher data",
    queryScalar(
      url,
      "SELECT COUNT(*) FROM app.workspace_members WHERE role::text = 'publisher'",
    ),
    "1",
  );
  assertScalar(
    "failed member_role data rollback does not leave contracted enum behind",
    queryScalar(
      url,
      "SELECT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'app'::regnamespace AND typname = 'member_role_v3')",
    ),
    "f",
  );
  assertScalar(
    "failed member_role data rollback keeps expanded enum labels",
    queryScalar(
      url,
      `
        SELECT string_agg(enumlabel, ',' ORDER BY enumlabel)
        FROM pg_enum
        WHERE enumtypid = 'app.member_role'::regtype
      `,
    ),
    "admin,developer,editor,observer,operator,owner,publisher,reviewer,viewer",
  );
}

function runNode(script, env) {
  const result = spawnSync(process.execPath, [script], {
    cwd: packageRoot,
    encoding: "utf8",
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${script} failed with exit code ${result.status}`);
  }
}

function assertScalar(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
  console.log(`PASS ${label}`);
}

function assertJson(label, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
  console.log(`PASS ${label}`);
}

async function expectAsyncFailure(label, fn, expectedMessage) {
  try {
    await fn();
  } catch (error) {
    if (error instanceof Error && error.message.includes(expectedMessage)) {
      console.log(`PASS ${label}`);
      return;
    }
    throw new Error(`${label}: expected ${expectedMessage}, got ${error}`);
  }
  throw new Error(`${label}: expected failure but command succeeded`);
}

function expectSqlFailure(label, url, sql, expectedMessage) {
  const result = psql(url, ["-X", "-q", "-c", sql], { allowFailure: true });
  expectFailure(label, result, expectedMessage);
}

function expectFileFailure(label, url, path, expectedMessage) {
  const result = psql(url, ["-X", "-q", "--single-transaction", "-f", path], {
    allowFailure: true,
  });
  expectFailure(label, result, expectedMessage);
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

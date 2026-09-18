import {
  adminDatabaseUrlFromEnv,
  databaseUrlForName,
  execSql,
  packageRoot,
  queryScalar,
  quoteIdentifier,
} from "./database-lib.mjs";
import { spawnSync } from "node:child_process";

const adminUrl = adminDatabaseUrlFromEnv();
const suffix = `${process.pid}_${Date.now()}`.replaceAll(/[^a-zA-Z0-9_]/g, "_");
const databaseName = `mcp_wp02b_${suffix}`;
const runtimeRole = `mcp_wp02b_runtime_${suffix}`.toLowerCase();
const databaseUrl = databaseUrlForName(adminUrl, databaseName);

try {
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
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO ${quoteIdentifier(runtimeRole)}`,
  );

  runNode("scripts/verify-tenant-core.mjs", {
    DATABASE_URL: databaseUrl,
    WP02B_RUNTIME_ROLE: runtimeRole,
  });

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

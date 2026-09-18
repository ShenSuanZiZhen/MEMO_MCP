import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
export const migrationsDir = join(packageRoot, "migrations");
export const fixturesDir = join(packageRoot, "fixtures");

export const defaultAdminDatabaseUrl =
  "postgresql://mcp_dev:mcp_dev_password@127.0.0.1:15432/postgres";

export function databaseUrlFromEnv() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  return databaseUrl;
}

export function adminDatabaseUrlFromEnv() {
  return (
    process.env.WP02B_ADMIN_DATABASE_URL ??
    process.env.DATABASE_ADMIN_URL ??
    defaultAdminDatabaseUrl
  );
}

export async function migrationFiles(direction) {
  const suffix = `.${direction}.sql`;
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(suffix))
    .sort();
  return direction === "down" ? files.reverse() : files;
}

export function migrationVersionFromFile(file) {
  const match =
    /^(?<version>[0-9]+_[a-z0-9_]+)\.(?<direction>up|down)\.sql$/.exec(file);
  if (!match?.groups?.version) {
    throw new Error(`invalid migration filename: ${file}`);
  }
  return match.groups.version;
}

export async function migrationPlan() {
  const upFiles = await migrationFiles("up");
  const downFiles = await migrationFiles("down");
  const upVersions = upFiles.map(migrationVersionFromFile);
  const downVersions = new Set(downFiles.map(migrationVersionFromFile));

  for (const version of upVersions) {
    if (!downVersions.has(version)) {
      throw new Error(`missing down migration for ${version}`);
    }
  }
  for (const version of downVersions) {
    if (!upVersions.includes(version)) {
      throw new Error(`missing up migration for ${version}`);
    }
  }
  const sorted = [...upVersions].sort();
  if (JSON.stringify(upVersions) !== JSON.stringify(sorted)) {
    throw new Error("migration versions must be sorted ascending");
  }

  return upFiles.map((file) => ({
    file,
    version: migrationVersionFromFile(file),
    downFile: file.replace(".up.sql", ".down.sql"),
  }));
}

export function psql(databaseUrl, args, options = {}) {
  const result = spawnSync(
    "psql",
    [databaseUrl, "-v", "ON_ERROR_STOP=1", ...args],
    {
      cwd: packageRoot,
      encoding: "utf8",
      env: process.env,
      input: options.input,
    },
  );

  if (options.allowFailure) {
    return result;
  }

  if (result.status !== 0) {
    throw new Error(
      [
        `psql failed with exit code ${result.status}`,
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return result;
}

export function execSql(databaseUrl, sql, options = {}) {
  return psql(databaseUrl, ["-X", "-q", "-c", sql], options);
}

export function queryScalar(databaseUrl, sql) {
  return psql(databaseUrl, ["-X", "-q", "-t", "-A", "-c", sql]).stdout.trim();
}

export function queryLines(databaseUrl, sql) {
  const output = queryScalar(databaseUrl, sql);
  return output.length === 0 ? [] : output.split("\n");
}

export function schemaMigrationsExists(databaseUrl) {
  return (
    queryScalar(
      databaseUrl,
      "SELECT to_regclass('app.schema_migrations') IS NOT NULL",
    ) === "t"
  );
}

export function appliedMigrationVersions(databaseUrl) {
  if (!schemaMigrationsExists(databaseUrl)) {
    return new Set();
  }
  return new Set(
    queryLines(
      databaseUrl,
      "SELECT version FROM app.schema_migrations ORDER BY version",
    ),
  );
}

export function applySqlFile(databaseUrl, path) {
  psql(databaseUrl, ["-X", "-q", "--single-transaction", "-f", path]);
}

export function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

export function databaseUrlForName(adminUrl, databaseName) {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

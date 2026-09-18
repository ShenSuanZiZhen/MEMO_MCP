import { join } from "node:path";
import {
  appliedMigrationVersions,
  applySqlFile,
  databaseUrlFromEnv,
  migrationPlan,
  migrationsDir,
} from "./database-lib.mjs";

const databaseUrl = databaseUrlFromEnv();
const applied = appliedMigrationVersions(databaseUrl);

for (const migration of await migrationPlan()) {
  if (applied.has(migration.version)) {
    console.log(`skipped ${migration.version} (already applied)`);
    continue;
  }
  applySqlFile(databaseUrl, join(migrationsDir, migration.file));
  console.log(`applied ${migration.version}`);
}

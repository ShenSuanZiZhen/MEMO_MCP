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
const latestVersion = [...applied].sort().at(-1);

if (!latestVersion) {
  console.log("no migrations applied");
  process.exit(0);
}

const migration = (await migrationPlan()).find(
  (entry) => entry.version === latestVersion,
);
if (!migration) {
  throw new Error(
    `missing migration files for applied version ${latestVersion}`,
  );
}

applySqlFile(databaseUrl, join(migrationsDir, migration.downFile));
console.log(`rolled back ${latestVersion}`);

import { dirname, join } from "node:path";
import {
  fixturesPath,
  packageRoot,
  readJson,
  readRegistrySchema,
  registryPath,
  schemaFor,
  validateRegistryValue,
} from "./registry-lib.mjs";

const registry = await readJson(registryPath);
const rootSchema = await readRegistrySchema();
const fixtures = await readJson(fixturesPath);
const failures = [];
const expectedSchemas = new Set([
  "ServiceDefinitionV1",
  "ModuleManifestV1",
  "PolicyInputV1",
  "PolicyDecisionV1",
  "DomainEventV1",
]);

if (registry.registryVersion !== "1.0.0") {
  failures.push(`${registryPath}: registryVersion must be 1.0.0`);
}
if (
  registry.canonicalization?.algorithm !== "RFC8785-or-equivalent-stable-json"
) {
  failures.push(
    `${registryPath}: canonicalization algorithm must be RFC8785-or-equivalent-stable-json`,
  );
}
if (registry.canonicalization?.digest !== "sha256") {
  failures.push(`${registryPath}: canonicalization digest must be sha256`);
}
if (
  typeof registry.canonicalization?.inputBoundary !== "string" ||
  registry.canonicalization.inputBoundary.trim().length === 0
) {
  failures.push(`${registryPath}: canonicalization inputBoundary is required`);
}

const schemas = registry.schemas ?? [];
const seenNames = new Set();
const seenUris = new Set();
for (const entry of schemas) {
  if (seenNames.has(entry.name)) {
    failures.push(`${registryPath}: duplicate schema name ${entry.name}`);
  }
  seenNames.add(entry.name);
  if (seenUris.has(entry.uri)) {
    failures.push(`${registryPath}: duplicate schema URI ${entry.uri}`);
  }
  seenUris.add(entry.uri);
}

for (const schemaName of expectedSchemas) {
  if (!seenNames.has(schemaName)) {
    failures.push(`${registryPath}: missing public schema ${schemaName}`);
  }
}
for (const schemaName of seenNames) {
  if (!expectedSchemas.has(schemaName)) {
    failures.push(`${registryPath}: unexpected public schema ${schemaName}`);
  }
}

for (const entry of schemas) {
  if (
    !entry.uri?.startsWith(
      "https://contracts.modular-mcp.local/schemas/definition/v1/",
    )
  ) {
    failures.push(
      `${entry.name}: schema URI must be in definition/v1 namespace`,
    );
  }
  if (!entry.path?.startsWith("v1/definition.v1.schema.json#/$defs/")) {
    failures.push(
      `${entry.name}: schema path must point at definition.v1 $defs`,
    );
  }
  const schemaName = entry.name.replace(/V1$/, "");
  const schema = schemaFor(rootSchema, schemaName);
  if (entry.path !== `v1/definition.v1.schema.json#/$defs/${schemaName}`) {
    failures.push(`${entry.name}: schema path must point at ${schemaName}`);
  }
  if (entry.uri !== schema.$id) {
    failures.push(`${entry.name}: registry URI must match schema $id`);
  }
}

const eventPattern =
  rootSchema.$defs?.DomainEvent?.properties?.eventType?.pattern;
if (registry.eventVersioning?.pattern !== eventPattern) {
  failures.push(
    `${registryPath}: eventVersioning pattern must match DomainEvent.eventType pattern`,
  );
}
for (const example of registry.eventVersioning?.examples ?? []) {
  if (!new RegExp(registry.eventVersioning.pattern).test(example)) {
    failures.push(
      `${registryPath}: eventVersioning example ${example} does not match pattern`,
    );
  }
}

await validateFixtureGroup("valid", true);
await validateFixtureGroup("invalid", false);

async function validateFixtureGroup(groupName, shouldPass) {
  for (const entry of fixtures[groupName] ?? []) {
    const schema = schemaFor(rootSchema, entry.schema);
    const value = await readJson(join(dirname(fixturesPath), entry.path));
    const errors = validateRegistryValue({ value, schema, rootSchema });
    const label = join(dirname(fixturesPath), entry.path);
    if (shouldPass && errors.length > 0) {
      failures.push(
        `${label}: expected valid but failed:\n  ${errors.join("\n  ")}`,
      );
    }
    if (!shouldPass && errors.length === 0) {
      failures.push(`${label}: expected invalid but passed (${entry.reason})`);
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`registry validation failed: ${failure}`);
  }
  process.exit(1);
}

console.log(
  `registry validation passed: ${registry.schemas.length} schemas, ${fixtures.valid.length} golden fixtures, and ${fixtures.invalid.length} negative fixtures checked from ${packageRoot}`,
);

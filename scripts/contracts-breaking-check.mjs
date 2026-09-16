import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  breakingBaselinePath,
  publicSurfaceFor,
  readCommonOpenApi,
  root,
  stableJson,
} from "./contracts-lib.mjs";

const write = process.argv.includes("--write");
const current = publicSurfaceFor(await readCommonOpenApi());
const baselinePath = join(root, breakingBaselinePath);
const currentJson = stableJson(current);

if (write) {
  await writeFile(baselinePath, currentJson);
  console.log(`wrote ${breakingBaselinePath}`);
  process.exit(0);
}

const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
const failures = [];

for (const [schemaName, baselineSchema] of Object.entries(baseline)) {
  const currentSchema = current[schemaName];
  if (!currentSchema) {
    failures.push(`${schemaName}: schema was removed`);
    continue;
  }
  compareSignatures(schemaName, baselineSchema, currentSchema);
}

function compareSignatures(path, baselineNode, currentNode) {
  if (baselineNode.type !== currentNode.type) {
    failures.push(
      `${path}: type changed from ${baselineNode.type} to ${currentNode.type}`,
    );
  }
  for (const key of [
    "format",
    "pattern",
    "minimum",
    "maximum",
    "minLength",
    "maxLength",
  ]) {
    if (baselineNode[key] !== currentNode[key]) {
      failures.push(`${path}: ${key} changed`);
    }
  }
  if (baselineNode.additionalProperties !== currentNode.additionalProperties) {
    failures.push(`${path}: additionalProperties changed`);
  }
  if (baselineNode.ref !== currentNode.ref) {
    failures.push(`${path}: ref changed`);
  }
  if (baselineNode.required || currentNode.required) {
    const baselineRequired = JSON.stringify(baselineNode.required ?? []);
    const currentRequired = JSON.stringify(currentNode.required ?? []);
    if (baselineRequired !== currentRequired) {
      failures.push(`${path}: required fields changed`);
    }
  }
  for (const value of baselineNode.enum ?? []) {
    if (!(currentNode.enum ?? []).includes(value)) {
      failures.push(`${path}: enum value ${value} was removed`);
    }
  }
  for (const [property, baselineProperty] of Object.entries(
    baselineNode.properties ?? {},
  )) {
    const currentProperty = currentNode.properties?.[property];
    if (!currentProperty) {
      failures.push(`${path}.${property}: property was removed`);
      continue;
    }
    compareSignatures(`${path}.${property}`, baselineProperty, currentProperty);
  }
  if (baselineNode.items) {
    compareSignatures(`${path}[]`, baselineNode.items, currentNode.items ?? {});
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`breaking contract change: ${failure}`);
  }
  process.exit(1);
}

console.log(`breaking-change check passed against ${breakingBaselinePath}`);

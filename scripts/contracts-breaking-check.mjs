import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  breakingBaselinePath,
  controlPlaneDecoderBreakingBaselinePath,
  controlPlaneBreakingBaselinePath,
  definitionBreakingBaselinePath,
  publicSurfaceFor,
  publicSurfaceForDefinitionRegistry,
  readCommonOpenApi,
  readControlPlaneOpenApi,
  readDefinitionRegistrySchema,
  readReleaseOpsOpenApi,
  releaseOpsBreakingBaselinePath,
  root,
  stableJson,
} from "./contracts-lib.mjs";
import { decoderPublicSurfaceForSource } from "./contracts-runtime-decoders-lib.mjs";

const write = process.argv.includes("--write");
const failures = [];
const documents = [
  {
    baselinePath: breakingBaselinePath,
    current: publicSurfaceWithOperations(await readCommonOpenApi()),
  },
  {
    baselinePath: controlPlaneBreakingBaselinePath,
    current: publicSurfaceWithOperations(await readControlPlaneOpenApi()),
  },
  {
    baselinePath: releaseOpsBreakingBaselinePath,
    current: publicSurfaceWithOperations(await readReleaseOpsOpenApi()),
  },
  {
    baselinePath: definitionBreakingBaselinePath,
    current: publicSurfaceForDefinitionRegistry(
      await readDefinitionRegistrySchema(),
    ),
  },
  {
    baselinePath: controlPlaneDecoderBreakingBaselinePath,
    current: decoderPublicSurfaceForSource(
      await readFile(
        join(
          root,
          "packages/contracts/src/generated/control-plane-decoders.ts",
        ),
        "utf8",
      ),
    ),
    kind: "decoder",
  },
];

if (write) {
  for (const document of documents) {
    await writeFile(
      join(root, document.baselinePath),
      stableJson(document.current),
    );
    console.log(`wrote ${document.baselinePath}`);
  }
  process.exit(0);
}

for (const document of documents) {
  const baseline = JSON.parse(
    await readFile(join(root, document.baselinePath), "utf8"),
  );
  if (document.current.__operations && !baseline.__operations) {
    failures.push(
      `${document.baselinePath}: operation surface is not tracked in baseline`,
    );
  }
  if (baseline.__operations && document.current.__operations) {
    compareOperations(
      `${document.baselinePath}:__operations`,
      baseline.__operations,
      document.current.__operations,
    );
  }
  if (document.kind === "decoder") {
    compareDecoderSurface(document.baselinePath, baseline, document.current);
    continue;
  }
  for (const [schemaName, baselineSchema] of Object.entries(baseline)) {
    if (schemaName === "__operations") {
      continue;
    }
    const currentSchema = document.current[schemaName];
    if (!currentSchema) {
      failures.push(
        `${document.baselinePath}:${schemaName}: schema was removed`,
      );
      continue;
    }
    compareSignatures(
      `${document.baselinePath}:${schemaName}`,
      baselineSchema,
      currentSchema,
    );
  }
}

function compareDecoderSurface(path, baseline, current) {
  for (const key of ["ContractDecodeError", "ContractDecodeResult"]) {
    if (baseline[key] !== current[key]) {
      failures.push(`${path}:${key}: decoder export changed`);
    }
  }
  compareStringList(path, "functions", baseline.functions, current.functions);
  compareStringList(
    path,
    "decoderSchemas",
    baseline.decoderSchemas,
    current.decoderSchemas,
  );
}

function compareStringList(path, key, baselineValues = [], currentValues = []) {
  const baselineJson = JSON.stringify([...baselineValues].sort());
  const currentJson = JSON.stringify([...currentValues].sort());
  if (baselineJson !== currentJson) {
    failures.push(`${path}:${key}: decoder public surface changed`);
  }
}

function publicSurfaceWithOperations(openApi) {
  const surface = publicSurfaceFor(openApi);
  const operations = operationSurfaceFor(openApi);
  if (Object.keys(operations).length > 0) {
    surface.__operations = operations;
  }
  return surface;
}

function operationSurfaceFor(openApi) {
  const operations = {};
  for (const [path, pathItem] of Object.entries(openApi.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!["get", "post", "patch", "put", "delete"].includes(method)) {
        continue;
      }
      operations[operation.operationId] = {
        method: method.toUpperCase(),
        path,
      };
    }
  }
  return operations;
}

function compareOperations(path, baselineOperations, currentOperations) {
  for (const [operationId, baselineOperation] of Object.entries(
    baselineOperations,
  )) {
    const currentOperation = currentOperations[operationId];
    if (!currentOperation) {
      failures.push(`${path}.${operationId}: operation was removed`);
      continue;
    }
    if (baselineOperation.method !== currentOperation.method) {
      failures.push(`${path}.${operationId}: method changed`);
    }
    if (baselineOperation.path !== currentOperation.path) {
      failures.push(`${path}.${operationId}: path changed`);
    }
  }

  for (const operationId of Object.keys(currentOperations)) {
    if (!baselineOperations[operationId]) {
      failures.push(`${path}.${operationId}: operation was added`);
    }
  }
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
    "minItems",
    "maxItems",
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

console.log(
  `breaking-change check passed against ${documents.map((document) => document.baselinePath).join(", ")}`,
);

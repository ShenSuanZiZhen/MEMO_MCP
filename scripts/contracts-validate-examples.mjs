import { dirname, join } from "node:path";
import {
  findProhibitedErrorDetails,
  getSchemas,
  readCommonOpenApi,
  readControlPlaneOpenApi,
  readReleaseOpsOpenApi,
  readJson,
  validateValue,
} from "./contracts-lib.mjs";

const indexPath = "packages/contracts/examples/common/examples.json";
const exampleIndex = await readJson(indexPath);
const openApi = await readCommonOpenApi();
const schemas = getSchemas(openApi);
const controlPlaneOpenApi = await readControlPlaneOpenApi();
const releaseOpsOpenApi = await readReleaseOpsOpenApi();
const failures = [];

function validateExample(entry) {
  const schema = schemas[entry.schema];
  if (!schema) {
    return [`unknown schema ${entry.schema}`];
  }
  return validateValue({
    value: entry.value,
    schema,
    schemas,
  });
}

for (const entry of exampleIndex.valid) {
  const path = join(dirname(indexPath), entry.path);
  const value = await readJson(path);
  const errors = validateExample({ ...entry, value });
  if (entry.schema === "ErrorEnvelope") {
    errors.push(...findProhibitedErrorDetails(value));
  }
  if (errors.length > 0) {
    failures.push(
      `${path}: expected valid but failed:\n  ${errors.join("\n  ")}`,
    );
  }
}

for (const entry of exampleIndex.invalid) {
  const path = join(dirname(indexPath), entry.path);
  const value = await readJson(path);
  const errors = validateExample({ ...entry, value });
  if (entry.schema === "ErrorEnvelope") {
    errors.push(...findProhibitedErrorDetails(value));
  }
  if (errors.length === 0) {
    failures.push(`${path}: expected invalid but passed (${entry.reason})`);
  }
}

let operationExampleCount = 0;
for (const document of [
  { label: "control-plane", openApi: controlPlaneOpenApi },
  { label: "release-ops", openApi: releaseOpsOpenApi },
]) {
  operationExampleCount += validateOperationExamples(
    document.openApi,
    document.label,
  );
}

function validateOperationExamples(apiDocument, label) {
  let count = 0;
  for (const [path, pathItem] of Object.entries(apiDocument.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!["get", "post", "patch", "put", "delete"].includes(method)) {
        continue;
      }
      count += 1;
      const examples = operation["x-contract-examples"];
      if (!examples?.request || !examples?.success || !examples?.failure) {
        failures.push(
          `${operation.operationId}: must include request, success, and failure examples`,
        );
        continue;
      }
      if (examples.failure.$ref) {
        const resolved = resolveExampleRef(apiDocument, examples.failure.$ref);
        if (!resolved?.value?.body?.error?.requestId) {
          failures.push(
            `${operation.operationId}: failure example must resolve to ErrorEnvelope with requestId`,
          );
        }
      }
      if (method === "post" && !examples.request.headers?.["Idempotency-Key"]) {
        failures.push(
          `${operation.operationId}: request example must include Idempotency-Key`,
        );
      }
      if (
        operation.operationId?.startsWith("updateDraft") &&
        !examples.request.headers?.["If-Match"]
      ) {
        failures.push(
          `${operation.operationId}: request example must include If-Match`,
        );
      }
      if (isHighImpactOperation(operation.operationId)) {
        for (const property of [
          "stepUpToken",
          "reason",
          "impact",
          "recoveryPlan",
        ]) {
          if (!examples.request.body?.[property]) {
            failures.push(
              `${operation.operationId}: high-impact ${label} request example must include ${property}`,
            );
          }
        }
      }
    }
  }
  return count;
}

function resolveExampleRef(apiDocument, ref) {
  const prefix = "#/components/examples/";
  if (!ref.startsWith(prefix)) {
    return undefined;
  }
  return apiDocument.components?.examples?.[ref.slice(prefix.length)];
}

function isHighImpactOperation(operationId = "") {
  return /^(pause|resume|stopNewAccess|resumeNewAccess|retireServiceVersion|revokeCredential|emergencyPause)/.test(
    operationId,
  );
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`example validation failed: ${failure}`);
  }
  process.exit(1);
}

console.log(
  `example validation passed: ${exampleIndex.valid.length} valid, ${exampleIndex.invalid.length} invalid fixtures, and ${operationExampleCount} operation examples checked`,
);

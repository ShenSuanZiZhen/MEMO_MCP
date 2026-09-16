import { dirname, join } from "node:path";
import {
  findProhibitedErrorDetails,
  getSchemas,
  readCommonOpenApi,
  readJson,
  validateValue,
} from "./contracts-lib.mjs";

const indexPath = "packages/contracts/examples/common/examples.json";
const exampleIndex = await readJson(indexPath);
const openApi = await readCommonOpenApi();
const schemas = getSchemas(openApi);
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

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`example validation failed: ${failure}`);
  }
  process.exit(1);
}

console.log(
  `example validation passed: ${exampleIndex.valid.length} valid and ${exampleIndex.invalid.length} invalid fixtures checked`,
);

import {
  commonOpenApiPath,
  getSchemas,
  readCommonOpenApi,
  resolveRef,
} from "./contracts-lib.mjs";

const openApi = await readCommonOpenApi();
const schemas = getSchemas(openApi);
const failures = [];

function fail(message) {
  failures.push(message);
}

if (openApi.openapi !== "3.1.0") {
  fail(`${commonOpenApiPath}: openapi must be 3.1.0`);
}
if (
  openApi.jsonSchemaDialect !== "https://json-schema.org/draft/2020-12/schema"
) {
  fail(`${commonOpenApiPath}: jsonSchemaDialect must be draft 2020-12`);
}
if (Object.keys(openApi.paths ?? {}).length !== 0) {
  fail(
    `${commonOpenApiPath}: common primitive document must not define endpoints`,
  );
}

for (const [name, schema] of Object.entries(schemas)) {
  if (
    !schema.$id?.startsWith(
      "https://contracts.modular-mcp.local/schemas/common/v1/",
    )
  ) {
    fail(`${name}: schema must have a common/v1 $id URI`);
  }
  if (schema.$ref) {
    resolveRef(schemas, schema.$ref);
  }
  for (const property of Object.values(schema.properties ?? {})) {
    if (property.$ref) {
      resolveRef(schemas, property.$ref);
    }
  }
}

const utcDateTime = schemas.UtcDateTime;
if (
  utcDateTime?.format !== "date-time" ||
  !utcDateTime.pattern?.endsWith("Z$")
) {
  fail("UtcDateTime: must require RFC3339 UTC timestamps with trailing Z");
}

const cursorRequest = schemas.CursorPaginationRequest;
if (cursorRequest?.properties?.offset) {
  fail("CursorPaginationRequest: offset pagination is forbidden");
}

const acceptedJobRequired = new Set(
  schemas.AcceptedJobResponse?.required ?? [],
);
for (const property of ["jobId", "status", "statusUrl"]) {
  if (!acceptedJobRequired.has(property)) {
    fail(`AcceptedJobResponse: missing required ${property}`);
  }
}

const errorRequired = new Set(schemas.Error?.required ?? []);
for (const property of [
  "code",
  "category",
  "message",
  "requestId",
  "retryable",
  "nextAction",
]) {
  if (!errorRequired.has(property)) {
    fail(`Error: missing required ${property}`);
  }
}

const categories = new Set(schemas.ErrorCategory?.enum ?? []);
for (const code of schemas.ErrorCode?.enum ?? []) {
  const prefix = code.split("_")[0];
  if (!categories.has(prefix)) {
    fail(`ErrorCode ${code}: prefix must match ErrorCategory enum`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`schema lint failed: ${failure}`);
  }
  process.exit(1);
}

console.log(
  `schema lint passed: ${Object.keys(schemas).length} common schemas checked`,
);

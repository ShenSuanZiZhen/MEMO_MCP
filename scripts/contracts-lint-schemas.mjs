import {
  commonOpenApiPath,
  controlPlaneOpenApiPath,
  getSchemas,
  readCommonOpenApi,
  readControlPlaneOpenApi,
  readReleaseOpsOpenApi,
  releaseOpsOpenApiPath,
  resolveRef,
} from "./contracts-lib.mjs";

const commonOpenApi = await readCommonOpenApi();
const controlPlaneOpenApi = await readControlPlaneOpenApi();
const releaseOpsOpenApi = await readReleaseOpsOpenApi();
const documents = [
  {
    path: commonOpenApiPath,
    namespace: "common",
    openApi: commonOpenApi,
    pathsAllowed: false,
  },
  {
    path: controlPlaneOpenApiPath,
    namespace: "control-plane",
    openApi: controlPlaneOpenApi,
    pathsAllowed: true,
  },
  {
    path: releaseOpsOpenApiPath,
    namespace: "release-ops",
    openApi: releaseOpsOpenApi,
    pathsAllowed: true,
  },
];
const failures = [];
const HIGH_IMPACT_OPERATION_IDS = new Set([
  "publishDeployment",
  "pauseServiceCalls",
  "resumeServiceCalls",
  "stopNewAccess",
  "resumeNewAccess",
  "retireServiceVersion",
  "revokeCredential",
  "emergencyPause",
]);

function fail(message) {
  failures.push(message);
}

for (const document of documents) {
  const schemas = getSchemas(document.openApi);
  if (document.openApi.openapi !== "3.1.0") {
    fail(`${document.path}: openapi must be 3.1.0`);
  }
  if (
    document.openApi.jsonSchemaDialect !==
    "https://json-schema.org/draft/2020-12/schema"
  ) {
    fail(`${document.path}: jsonSchemaDialect must be draft 2020-12`);
  }
  if (
    !document.pathsAllowed &&
    Object.keys(document.openApi.paths ?? {}).length !== 0
  ) {
    fail(
      `${document.path}: common primitive document must not define endpoints`,
    );
  }

  for (const [name, schema] of Object.entries(schemas)) {
    if (
      !schema.$id?.startsWith(
        `https://contracts.modular-mcp.local/schemas/${document.namespace}/v1/`,
      )
    ) {
      fail(`${name}: schema must have a ${document.namespace}/v1 $id URI`);
    }
    checkRefs(schemas, schema, name);
  }
}

const commonSchemas = getSchemas(commonOpenApi);
const utcDateTime = commonSchemas.UtcDateTime;
if (
  utcDateTime?.format !== "date-time" ||
  !utcDateTime.pattern?.endsWith("Z$")
) {
  fail("UtcDateTime: must require RFC3339 UTC timestamps with trailing Z");
}

const cursorRequest = commonSchemas.CursorPaginationRequest;
if (cursorRequest?.properties?.offset) {
  fail("CursorPaginationRequest: offset pagination is forbidden");
}

const acceptedJobRequired = new Set(
  commonSchemas.AcceptedJobResponse?.required ?? [],
);
for (const property of ["jobId", "status", "statusUrl"]) {
  if (!acceptedJobRequired.has(property)) {
    fail(`AcceptedJobResponse: missing required ${property}`);
  }
}

const errorRequired = new Set(commonSchemas.Error?.required ?? []);
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

const categories = new Set(commonSchemas.ErrorCategory?.enum ?? []);
for (const code of commonSchemas.ErrorCode?.enum ?? []) {
  const prefix = code.split("_")[0];
  if (!categories.has(prefix)) {
    fail(`ErrorCode ${code}: prefix must match ErrorCategory enum`);
  }
}

checkOpenApiOperations(controlPlaneOpenApi, "control-plane");
checkOpenApiOperations(releaseOpsOpenApi, "release-ops");
checkControlPlaneOpenApi(controlPlaneOpenApi);
checkReleaseOpsOpenApi(releaseOpsOpenApi);

function checkRefs(schemas, schema, path) {
  if (schema.$ref) {
    resolveRef(schemas, schema.$ref);
  }
  for (const property of Object.values(schema.properties ?? {})) {
    checkRefs(schemas, property, path);
  }
  if (schema.items) {
    checkRefs(schemas, schema.items, `${path}[]`);
  }
  for (const child of schema.allOf ?? []) {
    checkRefs(schemas, child, path);
  }
}

function checkOpenApiOperations(openApi, label) {
  for (const path of Object.keys(openApi.paths ?? {})) {
    if (!path.startsWith("/api/v1/")) {
      fail(`${path}: ${label} endpoint must be under /api/v1`);
    }
  }

  for (const [path, pathItem] of Object.entries(openApi.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!["get", "post", "patch", "put", "delete"].includes(method)) {
        continue;
      }
      if (!operation.operationId) {
        fail(`${method.toUpperCase()} ${path}: missing operationId`);
      }
      if (!operation.responses?.["401"] || !operation.responses?.["404"]) {
        fail(
          `${operation.operationId}: must include non-leaking 401 and 404 responses`,
        );
      }
      if (
        method === "post" &&
        !hasParameter(openApi, operation, "Idempotency-Key", "header")
      ) {
        fail(
          `${operation.operationId}: POST write operations must require Idempotency-Key`,
        );
      }
      if (
        operation.operationId?.startsWith("list") &&
        !hasParameter(openApi, operation, "cursor", "query")
      ) {
        fail(
          `${operation.operationId}: list operations must use cursor pagination`,
        );
      }
    }
  }
}

function checkControlPlaneOpenApi(openApi) {
  for (const [path, pathItem] of Object.entries(openApi.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!["get", "post", "patch", "put", "delete"].includes(method)) {
        continue;
      }
      if (
        operation.operationId?.startsWith("updateDraft") &&
        !hasParameter(openApi, operation, "If-Match", "header")
      ) {
        fail(`${operation.operationId}: Draft update must require If-Match`);
      }
      if (
        path.includes("/projects/{projectId}/") &&
        !path.includes("/environments/{environment}/") &&
        !operation.operationId?.match(
          /^(listProjects|createProject|getProject|updateProject|archiveProject|restoreProject)$/,
        )
      ) {
        fail(
          `${operation.operationId}: project-scoped control-plane endpoints must include environment`,
        );
      }
    }
  }

  for (const [name, schema] of Object.entries(getSchemas(openApi))) {
    if (name.endsWith("Response")) {
      assertNoSecretValueFields(openApi, name, schema);
    }
  }
}

function checkReleaseOpsOpenApi(openApi) {
  const schemas = getSchemas(openApi);
  for (const name of [
    "OwnerPreviewResponse",
    "ConsumerPreviewResponse",
    "ClientPreviewResponse",
    "TestRunResponse",
    "TestReportResponse",
    "CandidateResponse",
    "DeploymentResponse",
    "ServiceReleaseResponse",
  ]) {
    assertRequiresDefinitionRef(name, schemas[name]);
  }

  const candidate = schemas.CandidateResponse;
  for (const mutableField of ["revision", "patch", "editable", "mutable"]) {
    if (candidate?.properties?.[mutableField]) {
      fail(
        `CandidateResponse.${mutableField}: Candidate responses must be immutable`,
      );
    }
  }

  for (const [name, schema] of Object.entries(schemas)) {
    if (name.endsWith("Response")) {
      assertNoSecretValueFields(openApi, name, schema, {
        allowOneTimeSecretIn: "CreateCredentialResponse",
      });
    }
    if (name.includes("Trace")) {
      assertNoTracePayloadFields(openApi, name, schema);
    }
  }

  for (const [path, pathItem] of Object.entries(openApi.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!["post", "patch", "put", "delete"].includes(method)) {
        continue;
      }
      if (isHighImpactOperation(operation.operationId)) {
        const schema = requestSchemaFor(openApi, operation);
        assertHighImpactRequestSchema(operation.operationId, schema);
      }
    }
  }

  assertOperationsSummaryStatusFields(schemas.OperationsSummaryResponse);
}

function assertRequiresDefinitionRef(name, schema) {
  const required = new Set(schema?.required ?? []);
  if (!required.has("definition")) {
    fail(
      `${name}: preview/test/report/release schemas must require definition`,
    );
    return;
  }
  const definition = schema.properties?.definition;
  if (!definition?.$ref?.endsWith("/DefinitionRef")) {
    fail(`${name}.definition: must reference DefinitionRef`);
  }
}

function isHighImpactOperation(operationId = "") {
  return HIGH_IMPACT_OPERATION_IDS.has(operationId);
}

function assertHighImpactRequestSchema(operationId, schema) {
  const required = new Set(schema?.required ?? []);
  for (const property of ["stepUpToken", "reason", "impact", "recoveryPlan"]) {
    if (!required.has(property)) {
      fail(`${operationId}: high-impact operations must require ${property}`);
    }
  }

  const expectedStringProperties = {
    stepUpToken: { minLength: 12, maxLength: 160 },
    reason: { minLength: 1, maxLength: 500 },
    impact: { minLength: 1, maxLength: 500 },
    recoveryPlan: { minLength: 1, maxLength: 500 },
  };
  for (const [property, expected] of Object.entries(expectedStringProperties)) {
    const actual = schema?.properties?.[property];
    if (
      actual?.type !== "string" ||
      actual.minLength !== expected.minLength ||
      actual.maxLength !== expected.maxLength
    ) {
      fail(
        `${operationId}.${property}: high-impact field must be string minLength ${expected.minLength} maxLength ${expected.maxLength}`,
      );
    }
  }
}

function assertOperationsSummaryStatusFields(schema) {
  if (schema?.properties?.status) {
    fail(
      "OperationsSummaryResponse.status: ambiguous status field is forbidden",
    );
  }

  const required = new Set(schema?.required ?? []);
  for (const property of ["serviceVersionStatus", "deploymentStatus"]) {
    if (!required.has(property)) {
      fail(`OperationsSummaryResponse: missing required ${property}`);
    }
  }

  if (
    schema?.properties?.serviceVersionStatus?.$ref !==
    "#/components/schemas/ServiceVersionStatus"
  ) {
    fail(
      "OperationsSummaryResponse.serviceVersionStatus: must reference ServiceVersionStatus",
    );
  }
  if (
    schema?.properties?.deploymentStatus?.$ref !==
    "#/components/schemas/DeploymentStatus"
  ) {
    fail(
      "OperationsSummaryResponse.deploymentStatus: must reference DeploymentStatus",
    );
  }
}

function requestSchemaFor(openApi, operation) {
  const schema =
    operation.requestBody?.content?.["application/json"]?.schema ??
    resolveRequestBody(openApi, operation.requestBody)?.content?.[
      "application/json"
    ]?.schema;
  if (!schema?.$ref?.startsWith("#/components/schemas/")) {
    return schema;
  }
  return getSchemas(openApi)[schema.$ref.slice("#/components/schemas/".length)];
}

function resolveRequestBody(openApi, requestBody) {
  const prefix = "#/components/requestBodies/";
  if (!requestBody?.$ref?.startsWith(prefix)) {
    return requestBody;
  }
  return openApi.components?.requestBodies?.[
    requestBody.$ref.slice(prefix.length)
  ];
}

function hasParameter(openApi, operation, name, where) {
  return (operation.parameters ?? []).some(
    (parameter) =>
      resolveParameter(openApi, parameter).name === name &&
      resolveParameter(openApi, parameter).in === where,
  );
}

function resolveParameter(openApi, parameter) {
  const prefix = "#/components/parameters/";
  if (!parameter.$ref?.startsWith(prefix)) {
    return parameter;
  }
  return (
    openApi.components?.parameters?.[parameter.$ref.slice(prefix.length)] ?? {}
  );
}

function assertNoSecretValueFields(
  openApi,
  path,
  schema,
  options = {},
  seen = new Set(),
) {
  if (schema.$ref) {
    const prefix = "#/components/schemas/";
    if (!schema.$ref.startsWith(prefix) || seen.has(schema.$ref)) {
      return;
    }
    seen.add(schema.$ref);
    const resolved = getSchemas(openApi)[schema.$ref.slice(prefix.length)];
    if (resolved) {
      assertNoSecretValueFields(openApi, path, resolved, options, seen);
    }
    return;
  }
  for (const [name, property] of Object.entries(schema.properties ?? {})) {
    const allowedOneTimeSecret =
      options.allowOneTimeSecretIn &&
      path === options.allowOneTimeSecretIn &&
      name === "oneTimeSecret";
    if (
      /^(secret|secretValue|token|password|credentialValue|keyValue|fullKey)$/i.test(
        name,
      ) &&
      !allowedOneTimeSecret
    ) {
      fail(
        `${path}.${name}: response schemas must not expose complete secret values`,
      );
    }
    assertNoSecretValueFields(
      openApi,
      `${path}.${name}`,
      property,
      options,
      seen,
    );
  }
  if (schema.items) {
    assertNoSecretValueFields(
      openApi,
      `${path}[]`,
      schema.items,
      options,
      seen,
    );
  }
}

function assertNoTracePayloadFields(openApi, path, schema, seen = new Set()) {
  if (schema.$ref) {
    const prefix = "#/components/schemas/";
    if (!schema.$ref.startsWith(prefix) || seen.has(schema.$ref)) {
      return;
    }
    seen.add(schema.$ref);
    const resolved = getSchemas(openApi)[schema.$ref.slice(prefix.length)];
    if (resolved) {
      assertNoTracePayloadFields(openApi, path, resolved, seen);
    }
    return;
  }
  for (const [name, property] of Object.entries(schema.properties ?? {})) {
    if (
      /^(body|rawBody|query|queryText|secret|credential|fullUrl)$/i.test(name)
    ) {
      fail(
        `${path}.${name}: trace schemas must not expose body, query, full URL, or Secret data`,
      );
    }
    assertNoTracePayloadFields(openApi, `${path}.${name}`, property, seen);
  }
  if (schema.items) {
    assertNoTracePayloadFields(openApi, `${path}[]`, schema.items, seen);
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`schema lint failed: ${failure}`);
  }
  process.exit(1);
}

const totalSchemas = documents.reduce(
  (count, document) => count + Object.keys(getSchemas(document.openApi)).length,
  0,
);
console.log(
  `schema lint passed: ${totalSchemas} schemas checked across ${documents.length} OpenAPI documents`,
);

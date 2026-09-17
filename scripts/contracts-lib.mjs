import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const commonOpenApiPath = "packages/contracts/openapi/common.v1.json";
export const controlPlaneOpenApiPath =
  "packages/contracts/openapi/control-plane.v1.json";
export const releaseOpsOpenApiPath =
  "packages/contracts/openapi/release-ops.v1.json";
export const definitionRegistrySchemaPath =
  "packages/contracts/schema-registry/v1/definition.v1.schema.json";
export const generatedTypesPath = "packages/contracts/src/generated/common.ts";
export const generatedControlPlaneTypesPath =
  "packages/contracts/src/generated/control-plane.ts";
export const generatedReleaseOpsTypesPath =
  "packages/contracts/src/generated/release-ops.ts";
export const breakingBaselinePath =
  "packages/contracts/baselines/common.v1.public-surface.json";
export const controlPlaneBreakingBaselinePath =
  "packages/contracts/baselines/control-plane.v1.public-surface.json";
export const releaseOpsBreakingBaselinePath =
  "packages/contracts/baselines/release-ops.v1.public-surface.json";
export const definitionBreakingBaselinePath =
  "packages/contracts/baselines/definition.v1.public-surface.json";

export async function readJson(path) {
  return JSON.parse(await readFile(join(root, path), "utf8"));
}

export async function readCommonOpenApi() {
  return readJson(commonOpenApiPath);
}

export async function readControlPlaneOpenApi() {
  return readJson(controlPlaneOpenApiPath);
}

export async function readReleaseOpsOpenApi() {
  return readJson(releaseOpsOpenApiPath);
}

export async function readDefinitionRegistrySchema() {
  return readJson(definitionRegistrySchemaPath);
}

export function getSchemas(openApi) {
  return openApi.components?.schemas ?? {};
}

export function resolveRef(schemas, ref) {
  const prefix = "#/components/schemas/";
  const commonPrefix = "./common.v1.json#/components/schemas/";
  if (!ref.startsWith(prefix)) {
    if (ref.startsWith(commonPrefix)) {
      const name = ref.slice(commonPrefix.length);
      return {
        name: name === "PageInfo" ? "CommonPageInfo" : name,
        schema: { $ref: `#/components/schemas/${name}` },
      };
    }
    throw new Error(`unsupported external schema ref: ${ref}`);
  }
  const name = ref.slice(prefix.length);
  const schema = schemas[name];
  if (!schema) {
    throw new Error(`missing schema ref target: ${ref}`);
  }
  return { name, schema };
}

export function validateValue({ value, schema, schemas, path = "$" }) {
  const errors = [];

  function add(message) {
    errors.push(`${path}: ${message}`);
  }

  if (schema.$ref) {
    const resolved = resolveRef(schemas, schema.$ref);
    return validateValue({
      value,
      schema: resolved.schema,
      schemas,
      path,
    });
  }

  if (schema.allOf) {
    for (const [index, child] of schema.allOf.entries()) {
      errors.push(
        ...validateValue({
          value,
          schema: child,
          schemas,
          path: `${path}.allOf[${index}]`,
        }),
      );
    }
    return errors;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    add(`expected one of ${schema.enum.join(", ")}`);
    return errors;
  }

  if (!schema.type) {
    return errors;
  }

  if (schema.type === "string") {
    if (typeof value !== "string") {
      add("expected string");
      return errors;
    }
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      add(`expected minLength ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      add(`expected maxLength ${schema.maxLength}`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      add(`expected pattern ${schema.pattern}`);
    }
    if (schema.format === "date-time" && Number.isNaN(Date.parse(value))) {
      add("expected RFC3339 date-time");
    }
    return errors;
  }

  if (schema.type === "integer") {
    if (!Number.isInteger(value)) {
      add("expected integer");
      return errors;
    }
    if (schema.minimum !== undefined && value < schema.minimum) {
      add(`expected minimum ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      add(`expected maximum ${schema.maximum}`);
    }
    return errors;
  }

  if (schema.type === "boolean") {
    if (typeof value !== "boolean") {
      add("expected boolean");
    }
    return errors;
  }

  if (schema.type === "array") {
    if (!Array.isArray(value)) {
      add("expected array");
      return errors;
    }
    for (const [index, item] of value.entries()) {
      errors.push(
        ...validateValue({
          value: item,
          schema: schema.items ?? {},
          schemas,
          path: `${path}[${index}]`,
        }),
      );
    }
    return errors;
  }

  if (schema.type === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      add("expected object");
      return errors;
    }

    const required = schema.required ?? [];
    for (const property of required) {
      if (!Object.hasOwn(value, property)) {
        add(`missing required property ${property}`);
      }
    }

    const properties = schema.properties ?? {};
    if (schema.additionalProperties === false) {
      for (const property of Object.keys(value)) {
        if (!Object.hasOwn(properties, property)) {
          add(`unexpected property ${property}`);
        }
      }
    }

    for (const [property, propertySchema] of Object.entries(properties)) {
      if (Object.hasOwn(value, property)) {
        errors.push(
          ...validateValue({
            value: value[property],
            schema: propertySchema,
            schemas,
            path: `${path}.${property}`,
          }),
        );
      }
    }
    return errors;
  }

  add(`unsupported schema type ${schema.type}`);
  return errors;
}

const prohibitedErrorKeys = new Set([
  "cause",
  "credential",
  "rawBody",
  "secret",
  "stack",
  "stackTrace",
  "url",
]);

export function findProhibitedErrorDetails(value, path = "$") {
  const findings = [];
  if (typeof value !== "object" || value === null) {
    return findings;
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (prohibitedErrorKeys.has(key)) {
      findings.push(
        `${childPath}: prohibited internal or sensitive error detail`,
      );
    }
    findings.push(...findProhibitedErrorDetails(child, childPath));
  }
  return findings;
}

export function publicSurfaceFor(openApi) {
  const schemas = getSchemas(openApi);
  return publicSurfaceForSchemaMap(schemas);
}

export function publicSurfaceForDefinitionRegistry(rootSchema) {
  return publicSurfaceForSchemaMap(rootSchema.$defs ?? {});
}

function publicSurfaceForSchemaMap(schemas) {
  const surface = {};
  for (const [name, schema] of Object.entries(schemas)) {
    surface[name] = signatureFor(schema);
  }
  return surface;
}

function signatureFor(schema) {
  if (schema.$ref) {
    return { ref: schema.$ref };
  }
  if (schema.allOf) {
    return { allOf: schema.allOf.map(signatureFor) };
  }

  const signature = {};
  for (const key of [
    "type",
    "format",
    "pattern",
    "minimum",
    "maximum",
    "minItems",
    "maxItems",
    "minLength",
    "maxLength",
    "additionalProperties",
  ]) {
    if (schema[key] !== undefined) {
      signature[key] = schema[key];
    }
  }
  if (schema.enum) {
    signature.enum = [...schema.enum].sort();
  }
  if (schema.required) {
    signature.required = [...schema.required].sort();
  }
  if (schema.properties) {
    signature.properties = Object.fromEntries(
      Object.entries(schema.properties)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, property]) => [name, signatureFor(property)]),
    );
  }
  if (schema.items) {
    signature.items = signatureFor(schema.items);
  }
  return signature;
}

export function stableJson(value) {
  return `${JSON.stringify(sortDeep(value), null, 2)}\n`;
}

function sortDeep(value) {
  if (Array.isArray(value)) {
    return value.map(sortDeep);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortDeep(child)]),
  );
}

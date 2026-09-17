import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
export const registryPath = "schema-registry/registry.v1.json";
export const schemaPath = "schema-registry/v1/definition.v1.schema.json";
export const fixturesPath = "examples/definition/fixtures.json";
export const generatedTypesPath = "src/generated/definition.ts";

export async function readJson(path) {
  return JSON.parse(await readFile(join(packageRoot, path), "utf8"));
}

export async function readRegistrySchema() {
  return readJson(schemaPath);
}

export function schemaFor(rootSchema, name) {
  const schema = rootSchema.$defs?.[name];
  if (!schema) {
    throw new Error(`missing registry schema ${name}`);
  }
  return schema;
}

export function resolveRegistryRef(rootSchema, ref) {
  const prefix = "#/$defs/";
  if (!ref.startsWith(prefix)) {
    throw new Error(`unsupported registry ref ${ref}`);
  }
  const name = ref.slice(prefix.length);
  return { name, schema: schemaFor(rootSchema, name) };
}

export function validateRegistryValue({
  value,
  schema,
  rootSchema,
  path = "$",
}) {
  const errors = [];

  function add(message) {
    errors.push(`${path}: ${message}`);
  }

  if (schema.$ref) {
    const resolved = resolveRegistryRef(rootSchema, schema.$ref);
    return validateRegistryValue({
      value,
      schema: resolved.schema,
      rootSchema,
      path,
    });
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
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      add(`expected minItems ${schema.minItems}`);
    }
    for (const [index, item] of value.entries()) {
      errors.push(
        ...validateRegistryValue({
          value: item,
          schema: schema.items ?? {},
          rootSchema,
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
    for (const property of schema.required ?? []) {
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
    for (const [property, childSchema] of Object.entries(properties)) {
      if (Object.hasOwn(value, property)) {
        errors.push(
          ...validateRegistryValue({
            value: value[property],
            schema: childSchema,
            rootSchema,
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

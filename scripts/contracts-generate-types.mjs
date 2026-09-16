import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  generatedTypesPath,
  getSchemas,
  readCommonOpenApi,
  resolveRef,
  root,
} from "./contracts-lib.mjs";

const write = process.argv.includes("--write");
const openApi = await readCommonOpenApi();
const schemas = getSchemas(openApi);
const output = renderTypes(schemas);
const outputPath = join(root, generatedTypesPath);

if (write) {
  await writeFile(outputPath, output);
  console.log(`generated ${generatedTypesPath}`);
} else {
  const existing = await readFile(outputPath, "utf8");
  if (existing !== output) {
    console.error(
      `generated types are out of date: run pnpm --filter @modular-mcp/contracts generate:types`,
    );
    process.exit(1);
  }
  console.log(`generated types check passed: ${generatedTypesPath}`);
}

function renderTypes(allSchemas) {
  const lines = [
    "/* eslint-disable */",
    "// Generated from packages/contracts/openapi/common.v1.json. Do not edit by hand.",
    "",
  ];

  for (const [name, schema] of Object.entries(allSchemas)) {
    lines.push(renderSchema(name, schema));
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function renderSchema(name, schema) {
  if (schema.type === "object" && schema.properties) {
    const required = new Set(schema.required ?? []);
    const lines = [`export interface ${name} {`];
    for (const [property, propertySchema] of Object.entries(
      schema.properties,
    )) {
      const optional = required.has(property) ? "" : "?";
      lines.push(
        `  ${propertyName(property)}${optional}: ${typeFor(propertySchema)};`,
      );
    }
    lines.push("}");
    return lines.join("\n");
  }

  const renderedType = typeFor(schema);
  const separator = renderedType.startsWith("\n") ? "" : " ";
  return `export type ${name} =${separator}${renderedType};`;
}

function typeFor(schema) {
  if (schema.$ref) {
    return resolveRef(schemas, schema.$ref).name;
  }
  if (schema.allOf?.length === 1) {
    return typeFor(schema.allOf[0]);
  }
  if (schema.enum) {
    if (schema.enum.length === 1) {
      return JSON.stringify(schema.enum[0]);
    }
    return `\n  | ${schema.enum.map((value) => JSON.stringify(value)).join("\n  | ")}`;
  }
  if (schema.type === "string") {
    return "string";
  }
  if (schema.type === "integer" || schema.type === "number") {
    return "number";
  }
  if (schema.type === "boolean") {
    return "boolean";
  }
  if (schema.type === "array") {
    return `Array<${typeFor(schema.items ?? {})}>`;
  }
  if (schema.type === "object") {
    if (schema.properties) {
      const required = new Set(schema.required ?? []);
      const properties = Object.entries(schema.properties).map(
        ([property, propertySchema]) => {
          const optional = required.has(property) ? "" : "?";
          return `${propertyName(property)}${optional}: ${typeFor(propertySchema)}`;
        },
      );
      return `{ ${properties.join("; ")} }`;
    }
    return "Record<string, unknown>";
  }
  return "unknown";
}

function propertyName(name) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

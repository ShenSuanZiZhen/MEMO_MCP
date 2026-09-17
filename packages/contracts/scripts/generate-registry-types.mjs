import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import prettier from "prettier";
import {
  generatedTypesPath,
  packageRoot,
  readRegistrySchema,
  resolveRegistryRef,
} from "./registry-lib.mjs";

const write = process.argv.includes("--write");
const rootSchema = await readRegistrySchema();
const publicSchemas = [
  "ServiceDefinition",
  "ModuleManifest",
  "PolicyInput",
  "PolicyDecision",
  "DomainEvent",
];
const helperSchemas = [
  "OpaqueId",
  "UtcDateTime",
  "Sha256Digest",
  "ExactVersion",
  "Environment",
  "ModuleType",
  "RiskLevel",
  "EffectiveLimits",
];
const rendered = await prettier.format(renderTypes(), { parser: "typescript" });
const outputPath = join(packageRoot, generatedTypesPath);

if (write) {
  await writeFile(outputPath, rendered);
  console.log(`generated packages/contracts/${generatedTypesPath}`);
} else {
  const existing = await readFile(outputPath, "utf8");
  if (existing !== rendered) {
    console.error(
      "registry generated types are out of date: run pnpm --filter @modular-mcp/contracts generate:types",
    );
    process.exit(1);
  }
  console.log(
    `registry generated types check passed: packages/contracts/${generatedTypesPath}`,
  );
}

function renderTypes() {
  const lines = [
    "/* eslint-disable */",
    "// Generated from packages/contracts/schema-registry/v1/definition.v1.schema.json. Do not edit by hand.",
    "",
  ];
  for (const name of helperSchemas) {
    lines.push(renderSchema(name, rootSchema.$defs[name], false));
    lines.push("");
  }
  for (const name of publicSchemas) {
    lines.push(renderSchema(name, rootSchema.$defs[name], true));
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function renderSchema(name, schema, exported) {
  const prefix = exported ? "export " : "";
  if (schema.type === "object" && schema.properties) {
    const required = new Set(schema.required ?? []);
    const lines = [`${prefix}interface ${name} {`];
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
  return `${prefix}type ${name} = ${typeFor(schema)};`;
}

function typeFor(schema) {
  if (schema.$ref) {
    return resolveRegistryRef(rootSchema, schema.$ref).name;
  }
  if (schema.enum) {
    return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
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
    if (!schema.properties) {
      return "Record<string, unknown>";
    }
    const required = new Set(schema.required ?? []);
    const properties = Object.entries(schema.properties).map(
      ([property, propertySchema]) => {
        const optional = required.has(property) ? "" : "?";
        return `${propertyName(property)}${optional}: ${typeFor(propertySchema)}`;
      },
    );
    return `{ ${properties.join("; ")} }`;
  }
  return "unknown";
}

function propertyName(name) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

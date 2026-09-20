import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import prettier from "prettier";
import {
  generatedControlPlaneDecodersPath,
  generatedControlPlaneTypesPath,
  generatedReleaseOpsTypesPath,
  generatedTypesPath,
  getSchemas,
  readCommonOpenApi,
  readControlPlaneOpenApi,
  readReleaseOpsOpenApi,
  resolveRef,
  root,
} from "./contracts-lib.mjs";
import { renderControlPlaneDecoders } from "./contracts-runtime-decoders-lib.mjs";

const write = process.argv.includes("--write");
let currentSchemas = {};
const documents = [
  {
    path: generatedTypesPath,
    schemas: getSchemas(await readCommonOpenApi()),
    importsCommon: false,
  },
  {
    path: generatedControlPlaneTypesPath,
    sourcePath: "packages/contracts/openapi/control-plane.v1.json",
    schemas: getSchemas(await readControlPlaneOpenApi()),
    importsCommon: true,
  },
  {
    path: generatedReleaseOpsTypesPath,
    sourcePath: "packages/contracts/openapi/release-ops.v1.json",
    schemas: getSchemas(await readReleaseOpsOpenApi()),
    importsCommon: true,
  },
];

for (const document of documents) {
  const output = await prettier.format(
    renderTypes(document.schemas, document.importsCommon, document.sourcePath),
    {
      parser: "typescript",
    },
  );
  const outputPath = join(root, document.path);

  if (write) {
    await writeFile(outputPath, output);
    console.log(`generated ${document.path}`);
  } else {
    const existing = await readFile(outputPath, "utf8");
    if (existing !== output) {
      console.error(
        `generated types are out of date: run pnpm --filter @modular-mcp/contracts generate:types`,
      );
      process.exit(1);
    }
    console.log(`generated types check passed: ${document.path}`);
  }
}

const decoderOutput = await prettier.format(
  renderControlPlaneDecoders({
    commonSchemas: getSchemas(await readCommonOpenApi()),
    controlPlaneSchemas: getSchemas(await readControlPlaneOpenApi()),
  }),
  { parser: "typescript" },
);
const decoderOutputPath = join(root, generatedControlPlaneDecodersPath);
if (write) {
  await writeFile(decoderOutputPath, decoderOutput);
  console.log(`generated ${generatedControlPlaneDecodersPath}`);
} else {
  const existing = await readFile(decoderOutputPath, "utf8");
  if (existing !== decoderOutput) {
    console.error(
      `generated decoders are out of date: run pnpm --filter @modular-mcp/contracts generate:types`,
    );
    process.exit(1);
  }
  console.log(
    `generated decoders check passed: ${generatedControlPlaneDecodersPath}`,
  );
}

function renderTypes(allSchemas, importsCommon, sourcePath) {
  currentSchemas = allSchemas;
  const lines = [
    "/* eslint-disable */",
    `// Generated from ${sourcePath ?? "packages/contracts/openapi/common.v1.json"}. Do not edit by hand.`,
    "",
  ];
  if (importsCommon) {
    lines.push(
      'import type { AcceptedJobResponse, Cursor, ErrorEnvelope, Job, OpaqueId, PageInfo as CommonPageInfo, RequestId, TraceId, UtcDateTime } from "./common.js";',
    );
    lines.push("");
  }

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
    return resolveRef(currentSchemas, schema.$ref).name;
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

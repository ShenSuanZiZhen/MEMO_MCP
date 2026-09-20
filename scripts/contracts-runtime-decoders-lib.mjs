const controlPlaneDecoderSchemas = [
  "WorkspaceResponse",
  "WorkspaceListResponse",
  "ProjectResponse",
  "ProjectListResponse",
  "DraftResponse",
  "DraftListResponse",
  "DataSourceResponse",
  "DataSourceListResponse",
  "DataVersionResponse",
  "ModuleListResponse",
  "ModuleVersionResponse",
];

const commonDecoderSchemas = ["Job", "AcceptedJobResponse", "ErrorEnvelope"];

const annotationKeywords = new Set([
  "$id",
  "title",
  "description",
  "examples",
  "default",
  "deprecated",
]);

const supportedKeywords = new Set([
  "$ref",
  "additionalProperties",
  "allOf",
  "enum",
  "format",
  "items",
  "maximum",
  "maxItems",
  "maxLength",
  "minimum",
  "minItems",
  "minLength",
  "pattern",
  "properties",
  "required",
  "type",
]);

const supportedFormats = new Set(["date-time"]);

export const decoderSchemaNames = [
  ...controlPlaneDecoderSchemas,
  ...commonDecoderSchemas,
];

export function renderControlPlaneDecoders({
  commonSchemas,
  controlPlaneSchemas,
}) {
  const runtimeSchemas = collectRuntimeSchemas({
    commonSchemas,
    controlPlaneSchemas,
  });
  const schemaJson = JSON.stringify(
    Object.fromEntries(runtimeSchemas),
    null,
    2,
  );
  const imports = [
    'import type { AcceptedJobResponse, ErrorEnvelope, Job } from "./common.js";',
    `import type {
${controlPlaneDecoderSchemas.map((name) => `  ${name},`).join("\n")}
} from "./control-plane.js";`,
  ];
  const generatedExports = decoderSchemaNames
    .map(renderDecoderFunctions)
    .join("\n\n");
  const decoderEntries = decoderSchemaNames
    .map(
      (name) =>
        `  ${name}: Object.freeze({ decode: decode${name}, validate: validate${name}, assert: assert${name} }),`,
    )
    .join("\n");

  return `/* eslint-disable */
// Generated from packages/contracts/openapi/common.v1.json and packages/contracts/openapi/control-plane.v1.json. Do not edit by hand.

${imports.join("\n")}

export type ContractDecodeResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly string[] };

type RuntimeSchema = {
  readonly $ref?: string;
  readonly allOf?: readonly RuntimeSchema[];
  readonly enum?: readonly unknown[];
  readonly type?: "object" | "array" | "string" | "integer" | "number" | "boolean";
  readonly required?: readonly string[];
  readonly properties?: Readonly<Record<string, RuntimeSchema>>;
  readonly additionalProperties?: boolean | RuntimeSchema;
  readonly items?: RuntimeSchema;
  readonly pattern?: string;
  readonly format?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minItems?: number;
  readonly maxItems?: number;
};

export class ContractDecodeError extends TypeError {
  readonly errors: readonly string[];

  constructor(schemaName: string, errors: readonly string[]) {
    super(\`Invalid \${schemaName}: \${errors.join("; ")}\`);
    this.name = "ContractDecodeError";
    this.errors = Object.freeze([...errors]);
  }
}

const controlPlaneRuntimeDecoderSchemas: Readonly<Record<string, RuntimeSchema>> = deepFreeze(${schemaJson});

${decoderRuntime()}

${generatedExports}

export const controlPlaneDecoders = Object.freeze({
${decoderEntries}
});
`;
}

export function collectRuntimeSchemas({ commonSchemas, controlPlaneSchemas }) {
  const collected = new Map();

  for (const name of controlPlaneDecoderSchemas) {
    addSchema("control", name, `#/components/schemas/${name}`);
  }
  for (const name of commonDecoderSchemas) {
    addSchema("common", name, `./common.v1.json#/components/schemas/${name}`);
  }

  return new Map(
    [...collected.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );

  function addSchema(source, name, pointer) {
    const schemas = source === "common" ? commonSchemas : controlPlaneSchemas;
    const schema = schemas[name];
    if (!Object.hasOwn(schemas, name)) {
      throw new Error(`missing ${source} runtime decoder schema ${name}`);
    }
    assertSupportedSchemaNode(schema, {
      schemaName: name,
      pointer,
      allowRefSiblings: false,
    });
    const normalized = normalizeRuntimeSchema(schema, source, name, pointer);
    const existing = collected.get(name);
    if (existing !== undefined) {
      const existingJson = stableStringify(existing);
      const currentJson = stableStringify(normalized);
      if (existingJson !== currentJson) {
        throw new Error(
          `unsupported runtime decoder schema conflict: ${name} is defined differently in common/control-plane`,
        );
      }
      return;
    }
    collected.set(name, normalized);
    collectRefs(schema, source, name, pointer);
  }

  function collectRefs(schema, source, schemaName, pointer) {
    if (schema.$ref) {
      const target = decoderRefTarget(schema.$ref, source);
      addSchema(target.source, target.name, target.pointer);
    }
    for (const [index, child] of (schema.allOf ?? []).entries()) {
      collectRefs(child, source, schemaName, `${pointer}/allOf/${index}`);
    }
    if (schema.items !== undefined) {
      collectRefs(schema.items, source, schemaName, `${pointer}/items`);
    }
    if (
      typeof schema.additionalProperties === "object" &&
      schema.additionalProperties !== null
    ) {
      collectRefs(
        schema.additionalProperties,
        source,
        schemaName,
        `${pointer}/additionalProperties`,
      );
    }
    for (const [property, child] of Object.entries(schema.properties ?? {})) {
      collectRefs(
        child,
        source,
        schemaName,
        `${pointer}/properties/${escapeJsonPointer(property)}`,
      );
    }
  }
}

export function decoderPublicSurfaceForSource(source) {
  const functions = [
    ...source.matchAll(
      /export function ((?:decode|validate|assert)[A-Za-z0-9_]+)\(/g,
    ),
  ]
    .map((match) => match[1])
    .sort();
  const decoderObject =
    /export const controlPlaneDecoders = Object\.freeze\(\{([\s\S]*?)\n\}\);/.exec(
      source,
    )?.[1];
  const decoderSchemas =
    decoderObject === undefined
      ? []
      : [
          ...decoderObject.matchAll(
            /^\s+([A-Za-z][A-Za-z0-9_]*): Object\.freeze/gm,
          ),
        ]
          .map((match) => match[1])
          .sort();

  return {
    ContractDecodeError: source.includes("export class ContractDecodeError"),
    ContractDecodeResult: source.includes("export type ContractDecodeResult"),
    decoderSchemas,
    functions,
  };
}

function renderDecoderFunctions(name) {
  return `export function validate${name}(value: unknown): ContractDecodeResult<${name}> {
  const errors = validateControlPlaneSchema(${JSON.stringify(name)}, value);
  if (errors.length > 0) {
    return { ok: false, errors: Object.freeze([...errors]) };
  }
  return { ok: true, value: decode${name}(value) };
}

export function assert${name}(value: unknown): asserts value is ${name} {
  assertControlPlaneSchema(${JSON.stringify(name)}, value);
}

export function decode${name}(value: unknown): ${name} {
  assert${name}(value);
  return value;
}`;
}

function decoderRuntime() {
  return `const patternCache = new Map<string, RegExp>();

function validateControlPlaneSchema(
  schemaName: string,
  value: unknown,
): readonly string[] {
  const schema = schemaByName(schemaName);
  const errors: string[] = [];
  validateRuntimeSchema(value, schema, "$", errors);
  return Object.freeze([...errors]);
}

function assertControlPlaneSchema(schemaName: string, value: unknown): void {
  const errors = validateControlPlaneSchema(schemaName, value);
  if (errors.length > 0) {
    throw new ContractDecodeError(schemaName, errors);
  }
}

function schemaByName(schemaName: string): RuntimeSchema {
  const schema = controlPlaneRuntimeDecoderSchemas[schemaName];
  if (schema === undefined) {
    throw new Error(\`Unknown generated contract schema: \${schemaName}\`);
  }
  return schema;
}

function schemaByRef(ref: string): RuntimeSchema {
  const prefix = "#/schemas/";
  if (!ref.startsWith(prefix)) {
    throw new Error(\`Unsupported generated contract ref: \${ref}\`);
  }
  return schemaByName(ref.slice(prefix.length));
}

function validateRuntimeSchema(
  value: unknown,
  schema: RuntimeSchema,
  path: string,
  errors: string[],
): void {
  if (schema.$ref !== undefined) {
    validateRuntimeSchema(value, schemaByRef(schema.$ref), path, errors);
    return;
  }

  if (schema.allOf !== undefined) {
    for (const child of schema.allOf) {
      validateRuntimeSchema(value, child, path, errors);
    }
    if (schema.type === undefined) {
      return;
    }
  }

  if (
    schema.enum !== undefined &&
    !schema.enum.some((candidate) => Object.is(candidate, value))
  ) {
    errors.push(\`\${path}: expected one of \${schema.enum.join(", ")}\`);
    return;
  }

  if (schema.type === undefined) {
    return;
  }

  if (schema.type === "string") {
    validateString(value, schema, path, errors);
    return;
  }

  if (schema.type === "integer") {
    validateInteger(value, schema, path, errors);
    return;
  }

  if (schema.type === "number") {
    validateNumber(value, schema, path, errors);
    return;
  }

  if (schema.type === "boolean") {
    if (typeof value !== "boolean") {
      errors.push(\`\${path}: expected boolean\`);
    }
    return;
  }

  if (schema.type === "array") {
    validateArray(value, schema, path, errors);
    return;
  }

  if (schema.type === "object") {
    validateObject(value, schema, path, errors);
  }
}

function validateString(
  value: unknown,
  schema: RuntimeSchema,
  path: string,
  errors: string[],
): void {
  if (typeof value !== "string") {
    errors.push(\`\${path}: expected string\`);
    return;
  }
  if (schema.minLength !== undefined && value.length < schema.minLength) {
    errors.push(\`\${path}: expected minLength \${schema.minLength}\`);
  }
  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    errors.push(\`\${path}: expected maxLength \${schema.maxLength}\`);
  }
  if (schema.pattern !== undefined && !patternFor(schema.pattern).test(value)) {
    errors.push(\`\${path}: expected pattern \${schema.pattern}\`);
  }
  if (schema.format === "date-time" && !isStrictUtcDateTime(value)) {
    errors.push(\`\${path}: expected valid RFC3339 UTC date-time\`);
  }
}

function validateInteger(
  value: unknown,
  schema: RuntimeSchema,
  path: string,
  errors: string[],
): void {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    !Number.isSafeInteger(value)
  ) {
    errors.push(\`\${path}: expected safe integer\`);
    return;
  }
  validateNumberRange(value, schema, path, errors);
}

function validateNumber(
  value: unknown,
  schema: RuntimeSchema,
  path: string,
  errors: string[],
): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(\`\${path}: expected finite number\`);
    return;
  }
  validateNumberRange(value, schema, path, errors);
}

function validateNumberRange(
  value: number,
  schema: RuntimeSchema,
  path: string,
  errors: string[],
): void {
  if (schema.minimum !== undefined && value < schema.minimum) {
    errors.push(\`\${path}: expected minimum \${schema.minimum}\`);
  }
  if (schema.maximum !== undefined && value > schema.maximum) {
    errors.push(\`\${path}: expected maximum \${schema.maximum}\`);
  }
}

function validateArray(
  value: unknown,
  schema: RuntimeSchema,
  path: string,
  errors: string[],
): void {
  if (!Array.isArray(value)) {
    errors.push(\`\${path}: expected array\`);
    return;
  }
  if (schema.minItems !== undefined && value.length < schema.minItems) {
    errors.push(\`\${path}: expected minItems \${schema.minItems}\`);
  }
  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    errors.push(\`\${path}: expected maxItems \${schema.maxItems}\`);
  }
  const itemSchema = schema.items;
  if (itemSchema === undefined) {
    return;
  }
  for (const [index, item] of value.entries()) {
    validateRuntimeSchema(item, itemSchema, \`\${path}[\${index}]\`, errors);
  }
}

function validateObject(
  value: unknown,
  schema: RuntimeSchema,
  path: string,
  errors: string[],
): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    errors.push(\`\${path}: expected object\`);
    return;
  }

  const required = schema.required ?? [];
  for (const property of required) {
    if (!Object.hasOwn(value, property)) {
      errors.push(\`\${path}: missing required property \${property}\`);
    }
  }

  const properties = schema.properties ?? {};
  if (schema.additionalProperties === false) {
    for (const property of Object.keys(value)) {
      if (!Object.hasOwn(properties, property)) {
        errors.push(\`\${path}: unexpected property \${property}\`);
      }
    }
  } else if (
    typeof schema.additionalProperties === "object" &&
    schema.additionalProperties !== null
  ) {
    for (const [property, child] of Object.entries(value)) {
      if (!Object.hasOwn(properties, property)) {
        validateRuntimeSchema(
          child,
          schema.additionalProperties,
          \`\${path}.\${property}\`,
          errors,
        );
      }
    }
  }

  for (const [property, childSchema] of Object.entries(properties)) {
    if (Object.hasOwn(value, property)) {
      validateRuntimeSchema(
        Reflect.get(value, property),
        childSchema,
        \`\${path}.\${property}\`,
        errors,
      );
    }
  }
}

function isStrictUtcDateTime(value: string): boolean {
  const match = /^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2}):(\\d{2})(?:\\.\\d{1,6})?Z$/.exec(
    value,
  );
  if (match === null) {
    return false;
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);

  if (month < 1 || month > 12) {
    return false;
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return false;
  }
  const lastDay = daysInMonth(year, month);
  if (day < 1 || day > lastDay) {
    return false;
  }
  if (second < 0 || second > 60) {
    return false;
  }
  if (second === 60) {
    return hour === 23 && minute === 59 && day === lastDay;
  }
  return true;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return value;
}

function patternFor(pattern: string): RegExp {
  const cached = patternCache.get(pattern);
  if (cached !== undefined) {
    return cached;
  }
  const compiled = new RegExp(pattern);
  patternCache.set(pattern, compiled);
  return compiled;
}`;
}

function normalizeRuntimeSchema(schema, source, schemaName, pointer) {
  assertSupportedSchemaNode(schema, {
    schemaName,
    pointer,
    allowRefSiblings: false,
  });
  if (schema.$ref) {
    const target = decoderRefTarget(schema.$ref, source);
    return { $ref: `#/schemas/${target.name}` };
  }

  const normalized = {};
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
      normalized[key] = schema[key];
    }
  }
  if (schema.enum) {
    normalized.enum = schema.enum;
  }
  if (schema.required) {
    normalized.required = schema.required;
  }
  if (schema.allOf) {
    normalized.allOf = schema.allOf.map((child, index) =>
      normalizeRuntimeSchema(
        child,
        source,
        schemaName,
        `${pointer}/allOf/${index}`,
      ),
    );
  }
  if (schema.items !== undefined) {
    normalized.items = normalizeRuntimeSchema(
      schema.items,
      source,
      schemaName,
      `${pointer}/items`,
    );
  }
  if (
    typeof schema.additionalProperties === "object" &&
    schema.additionalProperties !== null
  ) {
    normalized.additionalProperties = normalizeRuntimeSchema(
      schema.additionalProperties,
      source,
      schemaName,
      `${pointer}/additionalProperties`,
    );
  }
  if (schema.properties) {
    normalized.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([property, child]) => [
        property,
        normalizeRuntimeSchema(
          child,
          source,
          schemaName,
          `${pointer}/properties/${escapeJsonPointer(property)}`,
        ),
      ]),
    );
  }
  return normalized;
}

function assertSupportedSchemaNode(
  schema,
  { schemaName, pointer, allowRefSiblings },
) {
  assertSchemaObject(schema, { schemaName, pointer });
  const keys = Object.keys(schema);
  for (const key of keys) {
    if (annotationKeywords.has(key) || supportedKeywords.has(key)) {
      continue;
    }
    throw new Error(
      `unsupported runtime decoder schema keyword: schema=${schemaName} pointer=${pointer} keyword=${key}`,
    );
  }
  if (schema.$ref && !allowRefSiblings) {
    for (const key of keys) {
      if (key === "$ref" || annotationKeywords.has(key)) {
        continue;
      }
      throw new Error(
        `unsupported runtime decoder schema keyword: schema=${schemaName} pointer=${pointer} keyword=${key}`,
      );
    }
  }
  if (schema.format !== undefined && !supportedFormats.has(schema.format)) {
    throw new Error(
      `unsupported runtime decoder schema keyword: schema=${schemaName} pointer=${pointer} keyword=format:${schema.format}`,
    );
  }
}

function assertSchemaObject(schema, { schemaName, pointer }) {
  if (typeof schema === "object" && schema !== null && !Array.isArray(schema)) {
    return;
  }
  throw new Error(
    `unsupported runtime decoder schema node: schema=${schemaName} pointer=${pointer} nodeType=${schemaNodeType(schema)} value=${stableStringify(schema)}`,
  );
}

function schemaNodeType(value) {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}

function decoderRefTarget(ref, source) {
  const localPrefix = "#/components/schemas/";
  const commonPrefix = "./common.v1.json#/components/schemas/";
  if (ref.startsWith(localPrefix)) {
    const name = ref.slice(localPrefix.length);
    return { source, name, pointer: `#/components/schemas/${name}` };
  }
  if (ref.startsWith(commonPrefix)) {
    const name = ref.slice(commonPrefix.length);
    return {
      source: "common",
      name,
      pointer: `./common.v1.json#/components/schemas/${name}`,
    };
  }
  throw new Error(`unsupported runtime decoder ref ${ref}`);
}

function escapeJsonPointer(value) {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function stableStringify(value) {
  return JSON.stringify(sortDeep(value));
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

/* eslint-disable */
// Generated from packages/contracts/openapi/common.v1.json and packages/contracts/openapi/control-plane.v1.json. Do not edit by hand.

import type { AcceptedJobResponse, ErrorEnvelope, Job } from "./common.js";
import type {
  WorkspaceResponse,
  WorkspaceListResponse,
  ProjectResponse,
  ProjectListResponse,
  DraftResponse,
  DraftListResponse,
  DataSourceResponse,
  DataSourceListResponse,
  DataVersionResponse,
  ModuleListResponse,
  ModuleVersionResponse,
} from "./control-plane.js";

export type ContractDecodeResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly string[] };

type RuntimeSchema = {
  readonly $ref?: string;
  readonly allOf?: readonly RuntimeSchema[];
  readonly enum?: readonly unknown[];
  readonly type?:
    | "object"
    | "array"
    | "string"
    | "integer"
    | "number"
    | "boolean";
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
    super(`Invalid ${schemaName}: ${errors.join("; ")}`);
    this.name = "ContractDecodeError";
    this.errors = Object.freeze([...errors]);
  }
}

const controlPlaneRuntimeDecoderSchemas: Readonly<
  Record<string, RuntimeSchema>
> = deepFreeze({
  AcceptedJobResponse: {
    type: "object",
    additionalProperties: false,
    required: ["jobId", "status", "statusUrl"],
    properties: {
      jobId: {
        $ref: "#/schemas/OpaqueId",
      },
      status: {
        $ref: "#/schemas/JobStatus",
      },
      statusUrl: {
        type: "string",
        pattern: "^/api/v1/jobs/[A-Za-z0-9_-]+$",
      },
    },
  },
  CredentialPreview: {
    type: "object",
    additionalProperties: false,
    required: ["authType", "lastFour", "updatedAt"],
    properties: {
      authType: {
        type: "string",
        enum: [
          "none",
          "api_key",
          "bearer",
          "basic",
          "oauth_client",
          "readonly_database",
        ],
      },
      lastFour: {
        type: "string",
        minLength: 4,
        maxLength: 4,
      },
      updatedAt: {
        $ref: "#/schemas/UtcDateTime",
      },
    },
  },
  Cursor: {
    type: "string",
    pattern: "^[A-Za-z0-9._~-]+$",
    minLength: 12,
    maxLength: 512,
  },
  DataSourceKind: {
    type: "string",
    enum: ["file_upload", "http_api", "object_storage", "readonly_database"],
  },
  DataSourceListResponse: {
    type: "object",
    additionalProperties: false,
    required: ["items", "pageInfo"],
    properties: {
      items: {
        type: "array",
        items: {
          $ref: "#/schemas/DataSourceResponse",
        },
      },
      pageInfo: {
        $ref: "#/schemas/PageInfo",
      },
    },
  },
  DataSourceResponse: {
    type: "object",
    additionalProperties: false,
    required: [
      "dataSourceId",
      "projectId",
      "environment",
      "kind",
      "displayName",
      "sensitivity",
      "versionStrategy",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      dataSourceId: {
        $ref: "#/schemas/OpaqueId",
      },
      projectId: {
        $ref: "#/schemas/OpaqueId",
      },
      environment: {
        $ref: "#/schemas/Environment",
      },
      kind: {
        $ref: "#/schemas/DataSourceKind",
      },
      displayName: {
        type: "string",
        minLength: 1,
        maxLength: 100,
      },
      sensitivity: {
        $ref: "#/schemas/Sensitivity",
      },
      versionStrategy: {
        $ref: "#/schemas/VersionStrategy",
      },
      credentialPreview: {
        $ref: "#/schemas/CredentialPreview",
      },
      createdAt: {
        $ref: "#/schemas/UtcDateTime",
      },
      updatedAt: {
        $ref: "#/schemas/UtcDateTime",
      },
    },
  },
  DataVersionResponse: {
    type: "object",
    additionalProperties: false,
    required: [
      "dataVersionId",
      "dataSourceId",
      "environment",
      "status",
      "processingStage",
      "createdAt",
    ],
    properties: {
      dataVersionId: {
        $ref: "#/schemas/OpaqueId",
      },
      dataSourceId: {
        $ref: "#/schemas/OpaqueId",
      },
      environment: {
        $ref: "#/schemas/Environment",
      },
      status: {
        $ref: "#/schemas/DataVersionStatus",
      },
      processingStage: {
        $ref: "#/schemas/ProcessingStage",
      },
      createdAt: {
        $ref: "#/schemas/UtcDateTime",
      },
      completedAt: {
        $ref: "#/schemas/UtcDateTime",
      },
      error: {
        $ref: "#/schemas/ErrorEnvelope",
      },
    },
  },
  DataVersionStatus: {
    type: "string",
    enum: [
      "created",
      "uploading",
      "uploaded",
      "processing",
      "completed",
      "partial",
      "failed",
      "cancelled",
      "expired",
    ],
  },
  DraftListResponse: {
    type: "object",
    additionalProperties: false,
    required: ["items", "pageInfo"],
    properties: {
      items: {
        type: "array",
        items: {
          $ref: "#/schemas/DraftResponse",
        },
      },
      pageInfo: {
        $ref: "#/schemas/PageInfo",
      },
    },
  },
  DraftResponse: {
    type: "object",
    additionalProperties: false,
    required: [
      "draftId",
      "projectId",
      "environment",
      "name",
      "status",
      "revision",
      "currentStep",
      "updatedAt",
    ],
    properties: {
      draftId: {
        $ref: "#/schemas/OpaqueId",
      },
      projectId: {
        $ref: "#/schemas/OpaqueId",
      },
      environment: {
        $ref: "#/schemas/Environment",
      },
      name: {
        type: "string",
        minLength: 1,
        maxLength: 80,
      },
      status: {
        $ref: "#/schemas/DraftStatus",
      },
      revision: {
        type: "integer",
        minimum: 1,
      },
      currentStep: {
        $ref: "#/schemas/WizardStep",
      },
      goal: {
        $ref: "#/schemas/GoalSelection",
      },
      updatedAt: {
        $ref: "#/schemas/UtcDateTime",
      },
    },
  },
  DraftStatus: {
    type: "string",
    enum: ["editing", "validating", "ready", "building", "built", "submitted"],
  },
  Environment: {
    type: "string",
    enum: ["development", "test", "production"],
  },
  Error: {
    type: "object",
    additionalProperties: false,
    required: [
      "code",
      "category",
      "message",
      "requestId",
      "retryable",
      "nextAction",
    ],
    properties: {
      code: {
        $ref: "#/schemas/ErrorCode",
      },
      category: {
        $ref: "#/schemas/ErrorCategory",
      },
      message: {
        type: "string",
        minLength: 1,
        maxLength: 300,
      },
      requestId: {
        $ref: "#/schemas/RequestId",
      },
      retryable: {
        type: "boolean",
      },
      nextAction: {
        type: "string",
        minLength: 1,
        maxLength: 300,
      },
      details: {
        $ref: "#/schemas/ErrorDetails",
      },
    },
  },
  ErrorCategory: {
    type: "string",
    enum: [
      "AUTHN",
      "AUTHZ",
      "DATA",
      "MODULE",
      "DEFINITION",
      "TEST",
      "DEPLOY",
      "QUOTA",
      "DEPENDENCY",
    ],
  },
  ErrorCode: {
    type: "string",
    enum: [
      "AUTHN_SESSION_EXPIRED",
      "AUTHZ_NOT_FOUND_OR_DENIED",
      "DATA_UPLOAD_INTERRUPTED",
      "DATA_FILE_QUARANTINED",
      "DATA_PARSE_PARTIAL",
      "DATA_CONNECTION_FAILED",
      "MODULE_DEPENDENCY_MISSING",
      "MODULE_CONFLICT",
      "DEFINITION_LIMIT_EXCEEDED",
      "DEFINITION_INVALID_REQUEST",
      "TEST_RUN_FAILED",
      "DEPLOY_DEFINITION_MISMATCH",
      "QUOTA_EXCEEDED",
      "DEPENDENCY_UNAVAILABLE",
    ],
  },
  ErrorDetails: {
    type: "object",
    additionalProperties: true,
  },
  ErrorEnvelope: {
    type: "object",
    additionalProperties: false,
    required: ["error"],
    properties: {
      error: {
        $ref: "#/schemas/Error",
      },
    },
  },
  GoalSelection: {
    type: "object",
    additionalProperties: false,
    required: ["description", "audience", "prohibitedUses", "capabilities"],
    properties: {
      description: {
        type: "string",
        minLength: 1,
        maxLength: 300,
      },
      audience: {
        type: "string",
        minLength: 1,
        maxLength: 80,
      },
      prohibitedUses: {
        type: "array",
        items: {
          type: "string",
        },
      },
      capabilities: {
        type: "array",
        items: {
          type: "string",
          enum: [
            "browse_catalog",
            "view_metadata",
            "search_content",
            "read_sections",
            "verify_citation",
          ],
        },
      },
    },
  },
  Job: {
    type: "object",
    additionalProperties: false,
    required: ["jobId", "requestId", "status", "createdAt", "updatedAt"],
    properties: {
      jobId: {
        $ref: "#/schemas/OpaqueId",
      },
      requestId: {
        $ref: "#/schemas/RequestId",
      },
      status: {
        $ref: "#/schemas/JobStatus",
      },
      createdAt: {
        $ref: "#/schemas/UtcDateTime",
      },
      updatedAt: {
        $ref: "#/schemas/UtcDateTime",
      },
      retryable: {
        type: "boolean",
      },
      resultUrl: {
        type: "string",
        pattern: "^/api/v1/.+",
      },
      error: {
        $ref: "#/schemas/ErrorEnvelope",
      },
    },
  },
  JobStatus: {
    type: "string",
    enum: ["accepted", "running", "succeeded", "failed", "cancelled"],
  },
  ModuleKind: {
    type: "string",
    enum: ["source", "capability", "output", "prompt"],
  },
  ModuleListResponse: {
    type: "object",
    additionalProperties: false,
    required: ["items", "pageInfo"],
    properties: {
      items: {
        type: "array",
        items: {
          $ref: "#/schemas/ModuleSummary",
        },
      },
      pageInfo: {
        $ref: "#/schemas/PageInfo",
      },
    },
  },
  ModuleSummary: {
    type: "object",
    additionalProperties: false,
    required: [
      "moduleId",
      "moduleVersion",
      "kind",
      "displayName",
      "riskLevel",
      "reviewStatus",
      "capabilities",
    ],
    properties: {
      moduleId: {
        type: "string",
        pattern: "^mod_[a-z0-9_]+$",
      },
      moduleVersion: {
        type: "string",
        pattern: "^\\d+\\.\\d+\\.\\d+$",
      },
      kind: {
        $ref: "#/schemas/ModuleKind",
      },
      displayName: {
        type: "string",
        minLength: 1,
        maxLength: 100,
      },
      riskLevel: {
        type: "string",
        enum: ["low", "medium", "high"],
      },
      reviewStatus: {
        $ref: "#/schemas/ReviewStatus",
      },
      capabilities: {
        type: "array",
        items: {
          type: "string",
        },
      },
    },
  },
  ModuleVersionResponse: {
    type: "object",
    additionalProperties: false,
    required: [
      "moduleId",
      "moduleVersion",
      "kind",
      "displayName",
      "riskLevel",
      "reviewStatus",
      "capabilities",
      "dependencies",
    ],
    properties: {
      moduleId: {
        type: "string",
        pattern: "^mod_[a-z0-9_]+$",
      },
      moduleVersion: {
        type: "string",
        pattern: "^\\d+\\.\\d+\\.\\d+$",
      },
      kind: {
        $ref: "#/schemas/ModuleKind",
      },
      displayName: {
        type: "string",
        minLength: 1,
        maxLength: 100,
      },
      riskLevel: {
        type: "string",
        enum: ["low", "medium", "high"],
      },
      reviewStatus: {
        $ref: "#/schemas/ReviewStatus",
      },
      capabilities: {
        type: "array",
        items: {
          type: "string",
        },
      },
      dependencies: {
        type: "array",
        items: {
          type: "string",
        },
      },
      conflicts: {
        type: "array",
        items: {
          type: "string",
        },
      },
    },
  },
  OpaqueId: {
    type: "string",
    pattern: "^[a-z][a-z0-9]*_[A-Za-z0-9_-]{8,128}$",
    minLength: 10,
    maxLength: 160,
  },
  PageInfo: {
    type: "object",
    additionalProperties: false,
    required: ["hasMore"],
    properties: {
      hasMore: {
        type: "boolean",
      },
      nextCursor: {
        $ref: "#/schemas/Cursor",
      },
    },
  },
  ProcessingStage: {
    type: "string",
    enum: [
      "upload",
      "security_scan",
      "format_detect",
      "parse",
      "normalize",
      "chunk",
      "index",
      "completed",
    ],
  },
  ProjectListResponse: {
    type: "object",
    additionalProperties: false,
    required: ["items", "pageInfo"],
    properties: {
      items: {
        type: "array",
        items: {
          $ref: "#/schemas/ProjectResponse",
        },
      },
      pageInfo: {
        $ref: "#/schemas/PageInfo",
      },
    },
  },
  ProjectResponse: {
    type: "object",
    additionalProperties: false,
    required: [
      "projectId",
      "workspaceId",
      "name",
      "defaultRegion",
      "defaultEnvironment",
      "status",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      projectId: {
        $ref: "#/schemas/OpaqueId",
      },
      workspaceId: {
        $ref: "#/schemas/OpaqueId",
      },
      name: {
        type: "string",
        minLength: 1,
        maxLength: 80,
      },
      description: {
        type: "string",
        maxLength: 500,
      },
      defaultRegion: {
        type: "string",
        minLength: 2,
        maxLength: 32,
      },
      defaultEnvironment: {
        $ref: "#/schemas/Environment",
      },
      status: {
        $ref: "#/schemas/ProjectStatus",
      },
      createdAt: {
        $ref: "#/schemas/UtcDateTime",
      },
      updatedAt: {
        $ref: "#/schemas/UtcDateTime",
      },
    },
  },
  ProjectStatus: {
    type: "string",
    enum: ["active", "archived"],
  },
  RequestId: {
    allOf: [
      {
        $ref: "#/schemas/OpaqueId",
      },
    ],
  },
  ReviewStatus: {
    type: "string",
    enum: ["testing", "submitted", "approved", "deprecated", "blocked"],
  },
  Sensitivity: {
    type: "string",
    enum: ["public", "internal", "confidential"],
  },
  UtcDateTime: {
    type: "string",
    format: "date-time",
    pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,6})?Z$",
  },
  VersionStrategy: {
    type: "string",
    enum: ["fixed", "manual_confirm_before_publish", "controlled_follow"],
  },
  WizardStep: {
    type: "string",
    enum: [
      "goal",
      "data",
      "modules",
      "configuration",
      "preview",
      "test",
      "publish",
    ],
  },
  WorkspaceKind: {
    type: "string",
    enum: ["personal", "team"],
  },
  WorkspaceListResponse: {
    type: "object",
    additionalProperties: false,
    required: ["items", "pageInfo"],
    properties: {
      items: {
        type: "array",
        items: {
          $ref: "#/schemas/WorkspaceResponse",
        },
      },
      pageInfo: {
        $ref: "#/schemas/PageInfo",
      },
    },
  },
  WorkspaceResponse: {
    type: "object",
    additionalProperties: false,
    required: ["workspaceId", "kind", "displayName", "createdAt", "updatedAt"],
    properties: {
      workspaceId: {
        $ref: "#/schemas/OpaqueId",
      },
      kind: {
        $ref: "#/schemas/WorkspaceKind",
      },
      displayName: {
        type: "string",
        minLength: 1,
        maxLength: 80,
      },
      region: {
        type: "string",
        minLength: 2,
        maxLength: 32,
      },
      createdAt: {
        $ref: "#/schemas/UtcDateTime",
      },
      updatedAt: {
        $ref: "#/schemas/UtcDateTime",
      },
    },
  },
});

const patternCache = new Map<string, RegExp>();

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
    throw new Error(`Unknown generated contract schema: ${schemaName}`);
  }
  return schema;
}

function schemaByRef(ref: string): RuntimeSchema {
  const prefix = "#/schemas/";
  if (!ref.startsWith(prefix)) {
    throw new Error(`Unsupported generated contract ref: ${ref}`);
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
    errors.push(`${path}: expected one of ${schema.enum.join(", ")}`);
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
      errors.push(`${path}: expected boolean`);
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
    errors.push(`${path}: expected string`);
    return;
  }
  if (schema.minLength !== undefined && value.length < schema.minLength) {
    errors.push(`${path}: expected minLength ${schema.minLength}`);
  }
  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    errors.push(`${path}: expected maxLength ${schema.maxLength}`);
  }
  if (schema.pattern !== undefined && !patternFor(schema.pattern).test(value)) {
    errors.push(`${path}: expected pattern ${schema.pattern}`);
  }
  if (schema.format === "date-time" && !isStrictUtcDateTime(value)) {
    errors.push(`${path}: expected valid RFC3339 UTC date-time`);
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
    errors.push(`${path}: expected safe integer`);
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
    errors.push(`${path}: expected finite number`);
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
    errors.push(`${path}: expected minimum ${schema.minimum}`);
  }
  if (schema.maximum !== undefined && value > schema.maximum) {
    errors.push(`${path}: expected maximum ${schema.maximum}`);
  }
}

function validateArray(
  value: unknown,
  schema: RuntimeSchema,
  path: string,
  errors: string[],
): void {
  if (!Array.isArray(value)) {
    errors.push(`${path}: expected array`);
    return;
  }
  if (schema.minItems !== undefined && value.length < schema.minItems) {
    errors.push(`${path}: expected minItems ${schema.minItems}`);
  }
  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    errors.push(`${path}: expected maxItems ${schema.maxItems}`);
  }
  const itemSchema = schema.items;
  if (itemSchema === undefined) {
    return;
  }
  for (const [index, item] of value.entries()) {
    validateRuntimeSchema(item, itemSchema, `${path}[${index}]`, errors);
  }
}

function validateObject(
  value: unknown,
  schema: RuntimeSchema,
  path: string,
  errors: string[],
): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    errors.push(`${path}: expected object`);
    return;
  }

  const required = schema.required ?? [];
  for (const property of required) {
    if (!Object.hasOwn(value, property)) {
      errors.push(`${path}: missing required property ${property}`);
    }
  }

  const properties = schema.properties ?? {};
  if (schema.additionalProperties === false) {
    for (const property of Object.keys(value)) {
      if (!Object.hasOwn(properties, property)) {
        errors.push(`${path}: unexpected property ${property}`);
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
          `${path}.${property}`,
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
        `${path}.${property}`,
        errors,
      );
    }
  }
}

function isStrictUtcDateTime(value: string): boolean {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?Z$/.exec(
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
}

export function validateWorkspaceResponse(
  value: unknown,
): ContractDecodeResult<WorkspaceResponse> {
  const errors = validateControlPlaneSchema("WorkspaceResponse", value);
  if (errors.length > 0) {
    return { ok: false, errors: Object.freeze([...errors]) };
  }
  return { ok: true, value: decodeWorkspaceResponse(value) };
}

export function assertWorkspaceResponse(
  value: unknown,
): asserts value is WorkspaceResponse {
  assertControlPlaneSchema("WorkspaceResponse", value);
}

export function decodeWorkspaceResponse(value: unknown): WorkspaceResponse {
  assertWorkspaceResponse(value);
  return value;
}

export function validateWorkspaceListResponse(
  value: unknown,
): ContractDecodeResult<WorkspaceListResponse> {
  const errors = validateControlPlaneSchema("WorkspaceListResponse", value);
  if (errors.length > 0) {
    return { ok: false, errors: Object.freeze([...errors]) };
  }
  return { ok: true, value: decodeWorkspaceListResponse(value) };
}

export function assertWorkspaceListResponse(
  value: unknown,
): asserts value is WorkspaceListResponse {
  assertControlPlaneSchema("WorkspaceListResponse", value);
}

export function decodeWorkspaceListResponse(
  value: unknown,
): WorkspaceListResponse {
  assertWorkspaceListResponse(value);
  return value;
}

export function validateProjectResponse(
  value: unknown,
): ContractDecodeResult<ProjectResponse> {
  const errors = validateControlPlaneSchema("ProjectResponse", value);
  if (errors.length > 0) {
    return { ok: false, errors: Object.freeze([...errors]) };
  }
  return { ok: true, value: decodeProjectResponse(value) };
}

export function assertProjectResponse(
  value: unknown,
): asserts value is ProjectResponse {
  assertControlPlaneSchema("ProjectResponse", value);
}

export function decodeProjectResponse(value: unknown): ProjectResponse {
  assertProjectResponse(value);
  return value;
}

export function validateProjectListResponse(
  value: unknown,
): ContractDecodeResult<ProjectListResponse> {
  const errors = validateControlPlaneSchema("ProjectListResponse", value);
  if (errors.length > 0) {
    return { ok: false, errors: Object.freeze([...errors]) };
  }
  return { ok: true, value: decodeProjectListResponse(value) };
}

export function assertProjectListResponse(
  value: unknown,
): asserts value is ProjectListResponse {
  assertControlPlaneSchema("ProjectListResponse", value);
}

export function decodeProjectListResponse(value: unknown): ProjectListResponse {
  assertProjectListResponse(value);
  return value;
}

export function validateDraftResponse(
  value: unknown,
): ContractDecodeResult<DraftResponse> {
  const errors = validateControlPlaneSchema("DraftResponse", value);
  if (errors.length > 0) {
    return { ok: false, errors: Object.freeze([...errors]) };
  }
  return { ok: true, value: decodeDraftResponse(value) };
}

export function assertDraftResponse(
  value: unknown,
): asserts value is DraftResponse {
  assertControlPlaneSchema("DraftResponse", value);
}

export function decodeDraftResponse(value: unknown): DraftResponse {
  assertDraftResponse(value);
  return value;
}

export function validateDraftListResponse(
  value: unknown,
): ContractDecodeResult<DraftListResponse> {
  const errors = validateControlPlaneSchema("DraftListResponse", value);
  if (errors.length > 0) {
    return { ok: false, errors: Object.freeze([...errors]) };
  }
  return { ok: true, value: decodeDraftListResponse(value) };
}

export function assertDraftListResponse(
  value: unknown,
): asserts value is DraftListResponse {
  assertControlPlaneSchema("DraftListResponse", value);
}

export function decodeDraftListResponse(value: unknown): DraftListResponse {
  assertDraftListResponse(value);
  return value;
}

export function validateDataSourceResponse(
  value: unknown,
): ContractDecodeResult<DataSourceResponse> {
  const errors = validateControlPlaneSchema("DataSourceResponse", value);
  if (errors.length > 0) {
    return { ok: false, errors: Object.freeze([...errors]) };
  }
  return { ok: true, value: decodeDataSourceResponse(value) };
}

export function assertDataSourceResponse(
  value: unknown,
): asserts value is DataSourceResponse {
  assertControlPlaneSchema("DataSourceResponse", value);
}

export function decodeDataSourceResponse(value: unknown): DataSourceResponse {
  assertDataSourceResponse(value);
  return value;
}

export function validateDataSourceListResponse(
  value: unknown,
): ContractDecodeResult<DataSourceListResponse> {
  const errors = validateControlPlaneSchema("DataSourceListResponse", value);
  if (errors.length > 0) {
    return { ok: false, errors: Object.freeze([...errors]) };
  }
  return { ok: true, value: decodeDataSourceListResponse(value) };
}

export function assertDataSourceListResponse(
  value: unknown,
): asserts value is DataSourceListResponse {
  assertControlPlaneSchema("DataSourceListResponse", value);
}

export function decodeDataSourceListResponse(
  value: unknown,
): DataSourceListResponse {
  assertDataSourceListResponse(value);
  return value;
}

export function validateDataVersionResponse(
  value: unknown,
): ContractDecodeResult<DataVersionResponse> {
  const errors = validateControlPlaneSchema("DataVersionResponse", value);
  if (errors.length > 0) {
    return { ok: false, errors: Object.freeze([...errors]) };
  }
  return { ok: true, value: decodeDataVersionResponse(value) };
}

export function assertDataVersionResponse(
  value: unknown,
): asserts value is DataVersionResponse {
  assertControlPlaneSchema("DataVersionResponse", value);
}

export function decodeDataVersionResponse(value: unknown): DataVersionResponse {
  assertDataVersionResponse(value);
  return value;
}

export function validateModuleListResponse(
  value: unknown,
): ContractDecodeResult<ModuleListResponse> {
  const errors = validateControlPlaneSchema("ModuleListResponse", value);
  if (errors.length > 0) {
    return { ok: false, errors: Object.freeze([...errors]) };
  }
  return { ok: true, value: decodeModuleListResponse(value) };
}

export function assertModuleListResponse(
  value: unknown,
): asserts value is ModuleListResponse {
  assertControlPlaneSchema("ModuleListResponse", value);
}

export function decodeModuleListResponse(value: unknown): ModuleListResponse {
  assertModuleListResponse(value);
  return value;
}

export function validateModuleVersionResponse(
  value: unknown,
): ContractDecodeResult<ModuleVersionResponse> {
  const errors = validateControlPlaneSchema("ModuleVersionResponse", value);
  if (errors.length > 0) {
    return { ok: false, errors: Object.freeze([...errors]) };
  }
  return { ok: true, value: decodeModuleVersionResponse(value) };
}

export function assertModuleVersionResponse(
  value: unknown,
): asserts value is ModuleVersionResponse {
  assertControlPlaneSchema("ModuleVersionResponse", value);
}

export function decodeModuleVersionResponse(
  value: unknown,
): ModuleVersionResponse {
  assertModuleVersionResponse(value);
  return value;
}

export function validateJob(value: unknown): ContractDecodeResult<Job> {
  const errors = validateControlPlaneSchema("Job", value);
  if (errors.length > 0) {
    return { ok: false, errors: Object.freeze([...errors]) };
  }
  return { ok: true, value: decodeJob(value) };
}

export function assertJob(value: unknown): asserts value is Job {
  assertControlPlaneSchema("Job", value);
}

export function decodeJob(value: unknown): Job {
  assertJob(value);
  return value;
}

export function validateAcceptedJobResponse(
  value: unknown,
): ContractDecodeResult<AcceptedJobResponse> {
  const errors = validateControlPlaneSchema("AcceptedJobResponse", value);
  if (errors.length > 0) {
    return { ok: false, errors: Object.freeze([...errors]) };
  }
  return { ok: true, value: decodeAcceptedJobResponse(value) };
}

export function assertAcceptedJobResponse(
  value: unknown,
): asserts value is AcceptedJobResponse {
  assertControlPlaneSchema("AcceptedJobResponse", value);
}

export function decodeAcceptedJobResponse(value: unknown): AcceptedJobResponse {
  assertAcceptedJobResponse(value);
  return value;
}

export function validateErrorEnvelope(
  value: unknown,
): ContractDecodeResult<ErrorEnvelope> {
  const errors = validateControlPlaneSchema("ErrorEnvelope", value);
  if (errors.length > 0) {
    return { ok: false, errors: Object.freeze([...errors]) };
  }
  return { ok: true, value: decodeErrorEnvelope(value) };
}

export function assertErrorEnvelope(
  value: unknown,
): asserts value is ErrorEnvelope {
  assertControlPlaneSchema("ErrorEnvelope", value);
}

export function decodeErrorEnvelope(value: unknown): ErrorEnvelope {
  assertErrorEnvelope(value);
  return value;
}

export const controlPlaneDecoders = Object.freeze({
  WorkspaceResponse: Object.freeze({
    decode: decodeWorkspaceResponse,
    validate: validateWorkspaceResponse,
    assert: assertWorkspaceResponse,
  }),
  WorkspaceListResponse: Object.freeze({
    decode: decodeWorkspaceListResponse,
    validate: validateWorkspaceListResponse,
    assert: assertWorkspaceListResponse,
  }),
  ProjectResponse: Object.freeze({
    decode: decodeProjectResponse,
    validate: validateProjectResponse,
    assert: assertProjectResponse,
  }),
  ProjectListResponse: Object.freeze({
    decode: decodeProjectListResponse,
    validate: validateProjectListResponse,
    assert: assertProjectListResponse,
  }),
  DraftResponse: Object.freeze({
    decode: decodeDraftResponse,
    validate: validateDraftResponse,
    assert: assertDraftResponse,
  }),
  DraftListResponse: Object.freeze({
    decode: decodeDraftListResponse,
    validate: validateDraftListResponse,
    assert: assertDraftListResponse,
  }),
  DataSourceResponse: Object.freeze({
    decode: decodeDataSourceResponse,
    validate: validateDataSourceResponse,
    assert: assertDataSourceResponse,
  }),
  DataSourceListResponse: Object.freeze({
    decode: decodeDataSourceListResponse,
    validate: validateDataSourceListResponse,
    assert: assertDataSourceListResponse,
  }),
  DataVersionResponse: Object.freeze({
    decode: decodeDataVersionResponse,
    validate: validateDataVersionResponse,
    assert: assertDataVersionResponse,
  }),
  ModuleListResponse: Object.freeze({
    decode: decodeModuleListResponse,
    validate: validateModuleListResponse,
    assert: assertModuleListResponse,
  }),
  ModuleVersionResponse: Object.freeze({
    decode: decodeModuleVersionResponse,
    validate: validateModuleVersionResponse,
    assert: assertModuleVersionResponse,
  }),
  Job: Object.freeze({
    decode: decodeJob,
    validate: validateJob,
    assert: assertJob,
  }),
  AcceptedJobResponse: Object.freeze({
    decode: decodeAcceptedJobResponse,
    validate: validateAcceptedJobResponse,
    assert: assertAcceptedJobResponse,
  }),
  ErrorEnvelope: Object.freeze({
    decode: decodeErrorEnvelope,
    validate: validateErrorEnvelope,
    assert: assertErrorEnvelope,
  }),
});

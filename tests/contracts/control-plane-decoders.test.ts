import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as contracts from "../../packages/contracts/src/index.js";
import {
  ContractDecodeError,
  controlPlaneDecoders,
  decodeAcceptedJobResponse,
  decodeDataSourceListResponse,
  decodeDataSourceResponse,
  decodeDataVersionResponse,
  decodeDraftListResponse,
  decodeDraftResponse,
  decodeErrorEnvelope,
  decodeJob,
  decodeModuleListResponse,
  decodeModuleVersionResponse,
  decodeProjectListResponse,
  decodeProjectResponse,
  decodeWorkspaceListResponse,
  decodeWorkspaceResponse,
  validateDraftResponse,
  validateWorkspaceResponse,
} from "../../packages/contracts/src/index.js";
import {
  collectRuntimeSchemas,
  decoderPublicSurfaceForSource,
} from "../../scripts/contracts-runtime-decoders-lib.mjs";

const workspaceId = "ws_01HZY8T3M6R7P9K2Q4V5X6Y7Z8";
const projectId = "prj_01HZY8T3M6R7P9K2Q4V5X6Y7Z8";
const draftId = "drf_01HZY8T3M6R7P9K2Q4V5X6Y7Z8";
const dataSourceId = "ds_01HZY8T3M6R7P9K2Q4V5X6Y7Z8";
const dataVersionId = "dv_01HZY8T3M6R7P9K2Q4V5X6Y7Z8";
const jobId = "job_01HZY8T3M6R7P9K2Q4V5X6Y7Z8";
const requestId = "req_01HZY8T3M6R7P9K2Q4V5X6Y7Z8";
const cursor = "cur_01HZY8T3M6R7P9K2Q4V5X6Y7Z8";
const now = "2026-09-19T08:30:00Z";

const workspace = {
  workspaceId,
  kind: "team",
  displayName: "Knowledge Ops",
  region: "us",
  createdAt: now,
  updatedAt: now,
};

const project = {
  projectId,
  workspaceId,
  name: "Support Knowledge",
  description: "Internal material",
  defaultRegion: "us",
  defaultEnvironment: "development",
  status: "active",
  createdAt: now,
  updatedAt: now,
};

const draft = {
  draftId,
  projectId,
  environment: "development",
  name: "Support Draft",
  status: "editing",
  revision: 1,
  currentStep: "goal",
  goal: {
    description: "Answer support questions",
    audience: "Support agents",
    prohibitedUses: ["legal advice"],
    capabilities: ["search_content"],
  },
  updatedAt: now,
};

const dataSource = {
  dataSourceId,
  projectId,
  environment: "development",
  kind: "file_upload",
  displayName: "Support Docs",
  sensitivity: "internal",
  versionStrategy: "manual_confirm_before_publish",
  credentialPreview: {
    authType: "api_key",
    lastFour: "1234",
    updatedAt: now,
  },
  createdAt: now,
  updatedAt: now,
};

const dataVersion = {
  dataVersionId,
  dataSourceId,
  environment: "development",
  status: "created",
  processingStage: "upload",
  createdAt: now,
};

const moduleSummary = {
  moduleId: "mod_search",
  moduleVersion: "1.2.3",
  kind: "capability",
  displayName: "Search",
  riskLevel: "low",
  reviewStatus: "approved",
  capabilities: ["search_content"],
};

const moduleVersion = {
  ...moduleSummary,
  dependencies: ["mod_source@1.0.0"],
  conflicts: [],
};

const pageInfo = { hasMore: true, nextCursor: cursor };

const errorEnvelope = {
  error: {
    code: "AUTHZ_NOT_FOUND_OR_DENIED",
    category: "AUTHZ",
    message: "Not found or denied.",
    requestId,
    retryable: false,
    nextAction: "Request access or verify the resource identifier.",
  },
};

describe("generated control-plane runtime decoders", () => {
  it.each([
    ["WorkspaceResponse", decodeWorkspaceResponse, workspace],
    [
      "WorkspaceListResponse",
      decodeWorkspaceListResponse,
      { items: [workspace], pageInfo },
    ],
    ["ProjectResponse", decodeProjectResponse, project],
    [
      "ProjectListResponse",
      decodeProjectListResponse,
      { items: [project], pageInfo },
    ],
    ["DraftResponse", decodeDraftResponse, draft],
    [
      "DraftListResponse",
      decodeDraftListResponse,
      { items: [draft], pageInfo },
    ],
    ["DataSourceResponse", decodeDataSourceResponse, dataSource],
    [
      "DataSourceListResponse",
      decodeDataSourceListResponse,
      { items: [dataSource], pageInfo },
    ],
    ["DataVersionResponse", decodeDataVersionResponse, dataVersion],
    [
      "ModuleListResponse",
      decodeModuleListResponse,
      { items: [moduleSummary], pageInfo },
    ],
    ["ModuleVersionResponse", decodeModuleVersionResponse, moduleVersion],
    [
      "Job",
      decodeJob,
      {
        jobId,
        requestId,
        status: "running",
        createdAt: now,
        updatedAt: now,
        retryable: true,
        resultUrl: "/api/v1/jobs/job_01HZY8T3M6R7P9K2Q4V5X6Y7Z8/result",
      },
    ],
    [
      "AcceptedJobResponse",
      decodeAcceptedJobResponse,
      {
        jobId,
        status: "accepted",
        statusUrl: "/api/v1/jobs/job_01HZY8T3M6R7P9K2Q4V5X6Y7Z8",
      },
    ],
    ["ErrorEnvelope", decodeErrorEnvelope, errorEnvelope],
  ])("accepts valid %s payloads", (_schemaName, decode, value) => {
    expect(decode(value)).toEqual(value);
  });

  it("exports stable direct and frozen registry-style browser decoder APIs", () => {
    expect(controlPlaneDecoders.WorkspaceResponse.decode(workspace)).toEqual(
      workspace,
    );
    expect(controlPlaneDecoders.ErrorEnvelope.validate(errorEnvelope)).toEqual({
      ok: true,
      value: errorEnvelope,
    });
    expect(Object.hasOwn(contracts, "controlPlaneRuntimeDecoderSchemas")).toBe(
      false,
    );
    expect(Object.isFrozen(controlPlaneDecoders)).toBe(true);
    expect(Object.isFrozen(controlPlaneDecoders.WorkspaceResponse)).toBe(true);
  });

  it("does not allow registry mutation to bypass invalid payload rejection", () => {
    const invalidWorkspace = { ...workspace, workspaceId: "value_001" };

    expect(() =>
      Object.defineProperty(controlPlaneDecoders, "WorkspaceResponse", {
        value: {
          decode: (value: unknown) => value,
          validate: (value: unknown) => ({ ok: true, value }),
          assert: () => undefined,
        },
      }),
    ).toThrow(TypeError);
    expect(() =>
      Object.defineProperty(controlPlaneDecoders.WorkspaceResponse, "decode", {
        value: (value: unknown) => value,
      }),
    ).toThrow(TypeError);

    expect(() => decodeWorkspaceResponse(invalidWorkspace)).toThrow(
      ContractDecodeError,
    );
    expect(() =>
      controlPlaneDecoders.WorkspaceResponse.decode(invalidWorkspace),
    ).toThrow(ContractDecodeError);
  });

  it("returns immutable decoder error arrays", () => {
    const result = validateWorkspaceResponse({
      ...workspace,
      workspaceId: "value_001",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.isFrozen(result.errors)).toBe(true);
      expect(() => {
        (result.errors as string[]).push("synthetic");
      }).toThrow(TypeError);
    }

    try {
      decodeWorkspaceResponse({ ...workspace, workspaceId: "value_001" });
      throw new Error("expected decode failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ContractDecodeError);
      if (error instanceof ContractDecodeError) {
        expect(Object.isFrozen(error.errors)).toBe(true);
        expect(() => {
          (error.errors as string[]).push("synthetic");
        }).toThrow(TypeError);
      }
    }
  });

  it("rejects missing required fields, additional properties, and bad roots", () => {
    const { workspaceId: _omitted, ...workspaceWithoutId } = workspace;

    expect(() => decodeWorkspaceResponse(workspaceWithoutId)).toThrow(
      ContractDecodeError,
    );
    expect(() =>
      decodeWorkspaceResponse({ ...workspace, secret: "synthetic" }),
    ).toThrow(/unexpected property secret/);

    for (const value of [null, [], "workspace", 1]) {
      expect(validateWorkspaceResponse(value).ok).toBe(false);
    }
  });

  it("rejects invalid enum, OpaqueId, UTC timestamp, and revision values", () => {
    expect(() =>
      decodeWorkspaceResponse({ ...workspace, kind: "organization" }),
    ).toThrow(/expected one of personal, team/);
    expect(() =>
      decodeWorkspaceResponse({ ...workspace, workspaceId: "value_001" }),
    ).toThrow(/expected/);
    expect(() =>
      decodeWorkspaceResponse({
        ...workspace,
        createdAt: "2026-09-19T16:30:00+08:00",
      }),
    ).toThrow(/expected pattern/);

    expect(validateDraftResponse({ ...draft, revision: 0 }).ok).toBe(false);
    expect(
      validateDraftResponse({
        ...draft,
        revision: Number.MAX_SAFE_INTEGER + 1,
      }).ok,
    ).toBe(false);
  });

  it.each([
    "2026-02-29T00:00:00Z",
    "2026-02-31T00:00:00Z",
    "2026-13-01T00:00:00Z",
    "2026-01-01T24:00:00Z",
    "2026-01-01T00:60:00Z",
    "2026-01-01T00:00:60Z",
    "2026-12-31T23:58:60Z",
    "2026-12-30T23:59:60Z",
    "2026-01-01T00:00:00+08:00",
    "2026-01-01T00:00:00.1234567Z",
  ])("rejects invalid UTC timestamp %s", (createdAt) => {
    expect(validateWorkspaceResponse({ ...workspace, createdAt }).ok).toBe(
      false,
    );
  });

  it.each([
    "1990-12-31T23:59:60Z",
    "2024-02-29T00:00:00Z",
    "2026-01-01T00:00:00Z",
    "2026-01-01T00:00:00.1Z",
    "2026-01-01T00:00:00.12Z",
    "2026-01-01T00:00:00.123Z",
    "2026-01-01T00:00:00.1234Z",
    "2026-01-01T00:00:00.12345Z",
    "2026-01-01T00:00:00.123456Z",
  ])("accepts valid UTC timestamp %s", (createdAt) => {
    expect(validateWorkspaceResponse({ ...workspace, createdAt }).ok).toBe(
      true,
    );
  });

  it("rejects invalid nested list items and shared common DTO enums", () => {
    expect(() =>
      decodeWorkspaceListResponse({
        items: [{ ...workspace, updatedAt: "2026-09-19T16:30:00+08:00" }],
        pageInfo,
      }),
    ).toThrow(/\$\.items\[0\]\.updatedAt/);

    expect(() =>
      decodeAcceptedJobResponse({
        jobId,
        status: "queued",
        statusUrl: "/api/v1/jobs/job_01HZY8T3M6R7P9K2Q4V5X6Y7Z8",
      }),
    ).toThrow(
      /expected one of accepted, running, succeeded, failed, cancelled/,
    );
  });

  it("keeps the generated runtime decoder browser-compatible", () => {
    const source = readFileSync(
      new URL(
        "../../packages/contracts/src/generated/control-plane-decoders.ts",
        import.meta.url,
      ),
      "utf8",
    );

    expect(source).not.toMatch(/from ["']node:/);
    expect(source).not.toMatch(/from ["']fs["']/);
    expect(source).not.toContain("eval(");
    expect(source).not.toContain("new Function");
    expect(source).not.toMatch(/as WorkspaceResponse|as ProjectResponse|as T/);
  });

  it("freezes decoder public surface through breaking-check metadata", () => {
    const source = readDecoderSource();
    const surface = decoderPublicSurfaceForSource(source);
    expect(surface.functions).toContain("decodeWorkspaceResponse");
    expect(surface.decoderSchemas).toContain("WorkspaceResponse");

    const withoutDecode = decoderPublicSurfaceForSource(
      source.replace(/export function decodeWorkspaceResponse[\s\S]*?\n\}/, ""),
    );
    const withoutRegistryEntry = decoderPublicSurfaceForSource(
      source.replace(
        /  WorkspaceResponse: Object\.freeze\([\s\S]*?\n  \}\),\n/,
        "",
      ),
    );

    expect(withoutDecode.functions).not.toContain("decodeWorkspaceResponse");
    expect(withoutRegistryEntry.decoderSchemas).not.toContain(
      "WorkspaceResponse",
    );
  });
});

describe("runtime decoder generator fail-closed checks", () => {
  it.each([
    [
      "oneOf",
      (schemas: SchemaMaps) => (schemas.control.WorkspaceResponse.oneOf = []),
    ],
    [
      "const",
      (schemas: SchemaMaps) =>
        (schemas.control.WorkspaceResponse.properties.displayName.const =
          "Knowledge Ops"),
    ],
    [
      "uniqueItems",
      (schemas: SchemaMaps) =>
        (schemas.control.WorkspaceResponse.required = [
          ...schemas.control.WorkspaceResponse.required,
        ]) && (schemas.control.WorkspaceResponse.uniqueItems = true),
    ],
    [
      "exclusiveMinimum",
      (schemas: SchemaMaps) =>
        (schemas.control.DraftResponse.properties.revision.exclusiveMinimum = 0),
    ],
  ])("rejects unsupported JSON Schema keyword %s", (_name, mutate) => {
    const schemas = schemaMaps();
    mutate(schemas);

    expect(() =>
      collectRuntimeSchemas({
        commonSchemas: schemas.common,
        controlPlaneSchemas: schemas.control,
      }),
    ).toThrow(/unsupported runtime decoder schema keyword/);
  });

  it.each([
    [
      "root false",
      (schemas: SchemaMaps) => (schemas.control.WorkspaceResponse = false),
      /schema=WorkspaceResponse pointer=#\/components\/schemas\/WorkspaceResponse nodeType=boolean value=false/,
    ],
    [
      "property false",
      (schemas: SchemaMaps) =>
        (schemas.control.WorkspaceResponse.properties.displayName = false),
      /schema=WorkspaceResponse pointer=#\/components\/schemas\/WorkspaceResponse\/properties\/displayName nodeType=boolean value=false/,
    ],
    [
      "property true",
      (schemas: SchemaMaps) =>
        (schemas.control.WorkspaceResponse.properties.displayName = true),
      /schema=WorkspaceResponse pointer=#\/components\/schemas\/WorkspaceResponse\/properties\/displayName nodeType=boolean value=true/,
    ],
    [
      "items false",
      (schemas: SchemaMaps) =>
        (schemas.control.WorkspaceListResponse.properties.items.items = false),
      /schema=WorkspaceListResponse pointer=#\/components\/schemas\/WorkspaceListResponse\/properties\/items\/items nodeType=boolean value=false/,
    ],
    [
      "allOf false",
      (schemas: SchemaMaps) =>
        (schemas.control.WorkspaceResponse.allOf = [false]),
      /schema=WorkspaceResponse pointer=#\/components\/schemas\/WorkspaceResponse\/allOf\/0 nodeType=boolean value=false/,
    ],
  ])("rejects unsupported boolean schema node: %s", (_name, mutate, error) => {
    const schemas = schemaMaps();
    mutate(schemas);

    expect(() =>
      collectRuntimeSchemas({
        commonSchemas: schemas.common,
        controlPlaneSchemas: schemas.control,
      }),
    ).toThrow(error);
  });

  it("rejects unknown string formats", () => {
    const schemas = schemaMaps();
    schemas.common.UtcDateTime.format = "email";

    expect(() =>
      collectRuntimeSchemas({
        commonSchemas: schemas.common,
        controlPlaneSchemas: schemas.control,
      }),
    ).toThrow(/keyword=format:email/);
  });

  it("rejects $ref with validation siblings", () => {
    const schemas = schemaMaps();
    schemas.control.WorkspaceResponse.properties.workspaceId.minLength = 1;

    expect(() =>
      collectRuntimeSchemas({
        commonSchemas: schemas.common,
        controlPlaneSchemas: schemas.control,
      }),
    ).toThrow(/schema=WorkspaceResponse.*keyword=minLength/);
  });

  it("rejects common/control-plane schema name conflicts", () => {
    const schemas = schemaMaps();
    schemas.control.WorkspaceResponse.properties.workspaceId = {
      $ref: "#/components/schemas/OpaqueId",
    };
    schemas.control.OpaqueId = {
      type: "string",
      pattern: "^bad_[A-Za-z0-9]+$",
    };

    expect(() =>
      collectRuntimeSchemas({
        commonSchemas: schemas.common,
        controlPlaneSchemas: schemas.control,
      }),
    ).toThrow(/defined differently in common\/control-plane/);
  });

  it("allows supported annotations without changing validation semantics", () => {
    const schemas = schemaMaps();
    schemas.control.WorkspaceResponse.description = "Synthetic annotation";
    schemas.control.WorkspaceResponse.examples = [workspace];

    expect(() =>
      collectRuntimeSchemas({
        commonSchemas: schemas.common,
        controlPlaneSchemas: schemas.control,
      }),
    ).not.toThrow();
  });

  it("direct probe: synthetic oneOf fails generation instead of being ignored", () => {
    const schemas = schemaMaps();
    schemas.control.WorkspaceResponse.oneOf = [];

    expect(() =>
      collectRuntimeSchemas({
        commonSchemas: schemas.common,
        controlPlaneSchemas: schemas.control,
      }),
    ).toThrow(
      /schema=WorkspaceResponse pointer=#\/components\/schemas\/WorkspaceResponse keyword=oneOf/,
    );
  });
});

function readDecoderSource(): string {
  return readFileSync(
    new URL(
      "../../packages/contracts/src/generated/control-plane-decoders.ts",
      import.meta.url,
    ),
    "utf8",
  );
}

interface SchemaMaps {
  readonly common: Record<string, any>;
  readonly control: Record<string, any>;
}

function schemaMaps(): SchemaMaps {
  return {
    common: JSON.parse(
      readFileSync(
        new URL(
          "../../packages/contracts/openapi/common.v1.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ).components.schemas,
    control: JSON.parse(
      readFileSync(
        new URL(
          "../../packages/contracts/openapi/control-plane.v1.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ).components.schemas,
  };
}

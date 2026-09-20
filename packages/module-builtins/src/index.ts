import type { JsonSchema, TypedModuleManifest } from "@modular-mcp/module-sdk";

export const packageLayer = "module-builtins" as const;

const limits = {
  requestsPerMinute: 60,
  maxConcurrency: 5,
  timeoutMs: 15000,
  maxResults: 10,
  maxSections: 5,
  maxResponseBytes: 65536,
} as const;

export const builtinModuleConfigSchemas = {
  "schemas/normalized-documents.config.json": {
    type: "object",
    additionalProperties: false,
    required: ["collection"],
    properties: {
      collection: { type: "string", minLength: 1, maxLength: 80 },
    },
  },
  "schemas/search-documents.config.json": {
    type: "object",
    additionalProperties: false,
    required: ["maxResults"],
    properties: {
      maxResults: { type: "integer", minimum: 1, maximum: 10 },
      includeSnippets: { type: "boolean" },
    },
  },
  "schemas/citation-guard.config.json": {
    type: "object",
    additionalProperties: false,
    required: ["required"],
    properties: {
      required: { type: "boolean" },
    },
  },
  "schemas/search-and-answer.config.json": {
    type: "object",
    additionalProperties: false,
    required: ["tone"],
    properties: {
      tone: { type: "string", enum: ["concise", "standard"] },
    },
  },
} as const satisfies Readonly<Record<string, JsonSchema>>;

export const builtinModuleManifests = [
  {
    id: "source.normalized-documents",
    version: "1.0.0",
    type: "source",
    apiVersion: "studio.mcp/v1",
    implementation:
      "builtin:normalized-documents@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    requires: [],
    conflicts: ["source.unversioned-live-read"],
    provides: ["source.normalized-documents"],
    configSchemaRef: "schemas/normalized-documents.config.json",
    permissions: ["data:read"],
    risk: "low",
    limits,
    artifactDigest:
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    signature: {
      keyId: "platform-root-1",
      value: "sig_synthetic_normalized_documents_00000000",
    },
  },
  {
    id: "capability.search-documents",
    version: "1.2.3",
    type: "capability",
    apiVersion: "studio.mcp/v1",
    implementation:
      "builtin:search-documents@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    requires: ["source.normalized-documents@1.0.0"],
    conflicts: ["source.unversioned-live-read"],
    provides: ["resource.documents", "tool.search_documents"],
    configSchemaRef: "schemas/search-documents.config.json",
    inputSchemaRef: "schemas/search-documents.input.json",
    outputSchemaRef: "schemas/search-documents.output.json",
    permissions: ["data:search", "resource:read", "tool:provide"],
    risk: "medium",
    limits,
    artifactDigest:
      "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    signature: {
      keyId: "platform-root-1",
      value: "sig_synthetic_search_documents_0000000000",
    },
  },
  {
    id: "output.citation-guard",
    version: "1.0.0",
    type: "output",
    apiVersion: "studio.mcp/v1",
    implementation:
      "builtin:citation-guard@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    requires: ["capability.search-documents@1.2.3"],
    conflicts: [],
    provides: ["output.citations"],
    configSchemaRef: "schemas/citation-guard.config.json",
    permissions: ["output:guard"],
    risk: "low",
    limits,
    artifactDigest:
      "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    signature: {
      keyId: "platform-root-1",
      value: "sig_synthetic_citation_guard_000000000000",
    },
  },
  {
    id: "prompt.search-and-answer",
    version: "1.0.0",
    type: "prompt",
    apiVersion: "studio.mcp/v1",
    implementation:
      "builtin:search-and-answer@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    requires: ["capability.search-documents@1.2.3"],
    conflicts: [],
    provides: ["prompt.search_and_answer"],
    configSchemaRef: "schemas/search-and-answer.config.json",
    permissions: ["prompt:compose"],
    risk: "medium",
    limits,
    artifactDigest:
      "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    signature: {
      keyId: "platform-root-1",
      value: "sig_synthetic_search_answer_0000000000000",
    },
  },
] as const satisfies readonly TypedModuleManifest[];

export const builtinModuleFixtureIds = builtinModuleManifests.map(
  (manifest) => `${manifest.id}@${manifest.version}`,
);

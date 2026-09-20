import { describe, expect, it } from "vitest";
import {
  builtinModuleConfigSchemas,
  builtinModuleFixtureIds,
  builtinModuleManifests,
} from "../../packages/module-builtins/src/index.js";
import {
  canonicalizeJson,
  catalogModuleNameForManifestId,
  createModuleRegistry,
  loadModuleManifest,
  moduleRegistryKey,
  validateModuleConfig,
  validateModuleManifest,
  validateProductionModuleReference,
  type JsonSchema,
} from "../../packages/module-sdk/src/index.js";

const searchManifest = builtinModuleManifests.find(
  (manifest) => manifest.id === "capability.search-documents",
);

if (searchManifest === undefined) {
  throw new Error("missing search fixture");
}

function configSchemaResolver(ref: string): JsonSchema | undefined {
  return builtinModuleConfigSchemas[
    ref as keyof typeof builtinModuleConfigSchemas
  ];
}

function issueCodes(
  result: ReturnType<typeof validateModuleManifest>,
): string[] {
  return result.ok ? [] : result.issues.map((entry) => entry.code);
}

describe("module manifest loader", () => {
  it("accepts built-in fixtures for all four module types", () => {
    expect(builtinModuleFixtureIds).toEqual([
      "source.normalized-documents@1.0.0",
      "capability.search-documents@1.2.3",
      "output.citation-guard@1.0.0",
      "prompt.search-and-answer@1.0.0",
    ]);

    for (const manifest of builtinModuleManifests) {
      expect(loadModuleManifest(manifest)).toMatchObject({
        ok: true,
        value: {
          registryKey: moduleRegistryKey(manifest.id, manifest.version),
        },
      });
    }
  });

  it("rejects illegal type, apiVersion, permissions, and floating dependencies", () => {
    expect(
      issueCodes({
        ...validateModuleManifest({
          ...searchManifest,
          type: "executor",
          apiVersion: "studio.mcp/v2",
          requires: ["source.normalized-documents@^1"],
          permissions: ["data:write"],
        }),
      }),
    ).toEqual(
      expect.arrayContaining([
        "invalid_type",
        "incompatible_api_version",
        "floating_dependency",
        "invalid_permission",
      ]),
    );
  });

  it("rejects custom execution fields from the frozen WP-01D schema", () => {
    const result = validateModuleManifest({
      ...searchManifest,
      customExecution: { command: "run-user-code" },
    });

    expect(result).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          pointer: "/customExecution",
          code: "additional_property",
        }),
      ]),
    });
  });

  it("normalizes manifest order into stable canonical JSON", () => {
    const shuffled = {
      signature: searchManifest.signature,
      artifactDigest: searchManifest.artifactDigest,
      limits: {
        maxResponseBytes: searchManifest.limits.maxResponseBytes,
        maxSections: searchManifest.limits.maxSections,
        maxResults: searchManifest.limits.maxResults,
        timeoutMs: searchManifest.limits.timeoutMs,
        maxConcurrency: searchManifest.limits.maxConcurrency,
        requestsPerMinute: searchManifest.limits.requestsPerMinute,
      },
      risk: searchManifest.risk,
      permissions: [...searchManifest.permissions].reverse(),
      outputSchemaRef: searchManifest.outputSchemaRef,
      inputSchemaRef: searchManifest.inputSchemaRef,
      configSchemaRef: searchManifest.configSchemaRef,
      provides: [...searchManifest.provides].reverse(),
      conflicts: [...searchManifest.conflicts].reverse(),
      requires: [...searchManifest.requires].reverse(),
      implementation: searchManifest.implementation,
      apiVersion: searchManifest.apiVersion,
      type: searchManifest.type,
      version: searchManifest.version,
      id: searchManifest.id,
    };

    const first = loadModuleManifest(searchManifest);
    const second = loadModuleManifest(shuffled);

    expect(first).toMatchObject({ ok: true });
    expect(second).toMatchObject({ ok: true });
    if (first.ok && second.ok) {
      expect(second.value.canonicalJson).toBe(first.value.canonicalJson);
    }
  });
});

describe("module config validation", () => {
  it("validates configSchema and returns JSON Pointer locations", () => {
    const result = validateModuleConfig(
      searchManifest,
      { maxResults: 20, unknown: true },
      { resolveConfigSchema: configSchemaResolver },
    );

    expect(result).toEqual({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ pointer: "/maxResults", code: "maximum" }),
        expect.objectContaining({
          pointer: "/unknown",
          code: "additional_property",
        }),
      ]),
    });
  });

  it("returns a stable normalized config object", () => {
    expect(
      validateModuleConfig(
        searchManifest,
        { includeSnippets: true, maxResults: 3 },
        { resolveConfigSchema: configSchemaResolver },
      ),
    ).toEqual({
      ok: true,
      value: { includeSnippets: true, maxResults: 3 },
    });
  });
});

describe("module registry", () => {
  it("requires exact production versions and matching artifact digests", () => {
    expect(
      validateProductionModuleReference({
        moduleId: "capability.search-documents",
        exactVersion: "^1.2.0",
        artifactDigest: searchManifest.artifactDigest,
      }),
    ).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ pointer: "/exactVersion" }),
      ]),
    });

    const registry = createModuleRegistry(builtinModuleManifests);
    expect(registry).toMatchObject({ ok: true });
    if (!registry.ok) {
      throw new Error("registry should be valid");
    }
    expect(
      registry.value.get({
        moduleId: searchManifest.id,
        exactVersion: searchManifest.version,
        artifactDigest: searchManifest.artifactDigest,
      })?.manifest.id,
    ).toBe(searchManifest.id);
    expect(
      registry.value.get({
        moduleId: searchManifest.id,
        exactVersion: searchManifest.version,
        artifactDigest:
          "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      }),
    ).toBeUndefined();
  });

  it("maps manifest IDs to stable database catalog names", () => {
    expect(catalogModuleNameForManifestId("capability.search-documents")).toBe(
      "capability_search_documents",
    );
    expect(() => catalogModuleNameForManifestId("invalid")).toThrow(
      "moduleId must match ModuleManifestV1",
    );
  });

  it("canonicalizes arbitrary JSON objects with sorted object keys", () => {
    expect(canonicalizeJson({ b: 1, a: { d: 4, c: 3 } })).toBe(
      '{"a":{"c":3,"d":4},"b":1}',
    );
  });
});

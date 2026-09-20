import { describe, expect, it } from "vitest";
import {
  catalogModuleNameForManifestId,
  createModuleCatalogRepository,
  type DatabaseTransaction,
  type SqlResult,
  type SqlValue,
} from "../../packages/database/src/index.js";

describe("module catalog repository adapter", () => {
  it("looks up only approved exact module versions with matching artifact digest", async () => {
    const calls: Array<{
      readonly sql: string;
      readonly params: readonly SqlValue[];
    }> = [];
    const transaction: DatabaseTransaction = {
      context: {
        actorId: "usr_018f0000-0000-7000-8000-000000000101",
        scope: {
          workspaceId: "018f0000-0000-7000-8000-000000000001",
          projectId: "018f0000-0000-7000-8000-000000000201",
          environment: "production",
        },
      },
      async query<Row extends object>(
        sql: string,
        params: readonly SqlValue[] = [],
      ): Promise<SqlResult<Row>> {
        calls.push({ sql, params });
        return {
          rowCount: 1,
          rows: [
            {
              module_version_id: "018f0000-0000-7000-8000-000000004001",
              module_name: "capability_search_documents",
              module_kind: "capability",
              version: "1.2.3",
              status: "approved",
              artifact_digest:
                "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              signature_digest:
                "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
            } as Row,
          ],
        };
      },
    };

    const repository = createModuleCatalogRepository(transaction);
    await expect(
      repository.findApprovedExact({
        moduleId: "capability.search-documents",
        exactVersion: "1.2.3",
        artifactDigest:
          "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      }),
    ).resolves.toMatchObject({
      moduleId: "capability.search-documents",
      exactVersion: "1.2.3",
      artifactDigest:
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      moduleName: "capability_search_documents",
      status: "approved",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain("FROM app.module_versions");
    expect(calls[0]?.params).toEqual([
      "capability_search_documents",
      "1.2.3",
      "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    ]);
  });

  it("does not return unapproved module versions as production approved", async () => {
    const transaction: DatabaseTransaction = {
      context: {
        actorId: "usr_018f0000-0000-7000-8000-000000000101",
        scope: {
          workspaceId: "018f0000-0000-7000-8000-000000000001",
          projectId: "018f0000-0000-7000-8000-000000000201",
          environment: "production",
        },
      },
      async query<Row extends object>(): Promise<SqlResult<Row>> {
        return {
          rowCount: 1,
          rows: [
            {
              module_version_id: "018f0000-0000-7000-8000-000000004001",
              module_name: "capability_search_documents",
              module_kind: "capability",
              version: "1.2.3",
              status: "submitted",
              artifact_digest:
                "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              signature_digest:
                "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
            } as Row,
          ],
        };
      },
    };
    const repository = createModuleCatalogRepository(transaction);

    await expect(
      repository.findExact({
        moduleId: "capability.search-documents",
        exactVersion: "1.2.3",
        artifactDigest:
          "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      }),
    ).resolves.toMatchObject({ status: "submitted" });
    await expect(
      repository.findApprovedExact({
        moduleId: "capability.search-documents",
        exactVersion: "1.2.3",
        artifactDigest:
          "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      }),
    ).resolves.toBeNull();
  });

  it("fails closed when catalog rows have invalid runtime shape", async () => {
    const invalidRows = [
      { module_version_id: "not-a-uuidv7" },
      { status: "unknown" },
      { signature_digest: "sha256:not-valid" },
      { module_kind: "invalid" },
    ];

    for (const partialRow of invalidRows) {
      const transaction: DatabaseTransaction = {
        context: {
          actorId: "usr_018f0000-0000-7000-8000-000000000101",
          scope: {
            workspaceId: "018f0000-0000-7000-8000-000000000001",
            projectId: "018f0000-0000-7000-8000-000000000201",
            environment: "production",
          },
        },
        async query<Row extends object>(): Promise<SqlResult<Row>> {
          return {
            rowCount: 1,
            rows: [
              {
                module_version_id: "018f0000-0000-7000-8000-000000004001",
                module_name: "capability_search_documents",
                module_kind: "capability",
                version: "1.2.3",
                status: "approved",
                artifact_digest:
                  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                signature_digest:
                  "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
                ...partialRow,
              } as Row,
            ],
          };
        },
      };

      await expect(
        createModuleCatalogRepository(transaction).findExact({
          moduleId: "capability.search-documents",
          exactVersion: "1.2.3",
          artifactDigest:
            "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        }),
      ).resolves.toBeNull();
    }
  });

  it("lists tenant-scoped service versions affected by a blocked module", async () => {
    const calls: Array<{
      readonly sql: string;
      readonly params: readonly SqlValue[];
    }> = [];
    const transaction: DatabaseTransaction = {
      context: {
        actorId: "usr_018f0000-0000-7000-8000-000000000101",
        scope: {
          workspaceId: "018f0000-0000-7000-8000-000000000001",
          projectId: "018f0000-0000-7000-8000-000000000201",
          environment: "production",
        },
      },
      async query<Row extends object>(
        sql: string,
        params: readonly SqlValue[] = [],
      ): Promise<SqlResult<Row>> {
        calls.push({ sql, params });
        return {
          rowCount: 1,
          rows: [
            {
              service_version_id: "018f0000-0000-7000-8000-000000005001",
              service_id: "018f0000-0000-7000-8000-000000001001",
              service_version: "2.0.0",
              definition_id: "018f0000-0000-7000-8000-000000001201",
              definition_digest:
                "sha256:1111111111111111111111111111111111111111111111111111111111111111",
              status: "published",
            } as Row,
          ],
        };
      },
    };

    await expect(
      createModuleCatalogRepository(transaction).findAffectedServiceVersions({
        moduleId: "capability.search-documents",
        exactVersion: "1.2.3",
        artifactDigest:
          "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      }),
    ).resolves.toEqual([
      {
        serviceVersionId: "018f0000-0000-7000-8000-000000005001",
        serviceId: "018f0000-0000-7000-8000-000000001001",
        serviceVersion: "2.0.0",
        definitionId: "018f0000-0000-7000-8000-000000001201",
        definitionDigest:
          "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        status: "published",
      },
    ]);
    expect(calls[0]?.sql).toContain("FROM app.definition_modules dm");
    expect(calls[0]?.params).toEqual([
      "018f0000-0000-7000-8000-000000000001",
      "018f0000-0000-7000-8000-000000000201",
      "production",
      "capability_search_documents",
      "1.2.3",
      "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    ]);
  });

  it("rejects invalid manifest ids before querying", async () => {
    const transaction: DatabaseTransaction = {
      context: {
        actorId: "usr_018f0000-0000-7000-8000-000000000101",
        scope: {
          workspaceId: "018f0000-0000-7000-8000-000000000001",
          projectId: "018f0000-0000-7000-8000-000000000201",
          environment: "production",
        },
      },
      async query(): Promise<SqlResult<Record<string, unknown>>> {
        throw new Error("query should not be reached");
      },
    };

    expect(catalogModuleNameForManifestId("capability.search-documents")).toBe(
      "capability_search_documents",
    );
    await expect(
      createModuleCatalogRepository(transaction).findApprovedExact({
        moduleId: "bad-module-id",
        exactVersion: "1.0.0",
        artifactDigest:
          "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      }),
    ).rejects.toThrow("moduleId must match ModuleManifestV1");
  });
});

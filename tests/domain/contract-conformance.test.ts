import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ENVIRONMENTS,
  OPAQUE_ID_PATTERN,
  stateMachines,
} from "../../packages/domain/src/index.js";

interface SchemaDocument {
  readonly components: {
    readonly schemas: Record<
      string,
      {
        readonly pattern?: string;
        readonly enum?: readonly string[];
        readonly required?: readonly string[];
        readonly properties?: Record<string, unknown>;
      }
    >;
  };
}

function readSchemaDocument(relativePath: string): SchemaDocument {
  return JSON.parse(
    readFileSync(new URL(relativePath, import.meta.url), "utf8"),
  ) as SchemaDocument;
}

const common = readSchemaDocument(
  "../../packages/contracts/openapi/common.v1.json",
);
const controlPlane = readSchemaDocument(
  "../../packages/contracts/openapi/control-plane.v1.json",
);
const releaseOps = readSchemaDocument(
  "../../packages/contracts/openapi/release-ops.v1.json",
);

function schemaEnum(
  document: SchemaDocument,
  schemaName: string,
): readonly string[] {
  const values = document.components.schemas[schemaName]?.enum;
  if (values === undefined) {
    throw new Error(`missing enum schema ${schemaName}`);
  }
  return values;
}

describe("domain contract conformance", () => {
  it("uses the exact common OpaqueId pattern", () => {
    expect(OPAQUE_ID_PATTERN).toBe(common.components.schemas.OpaqueId?.pattern);
  });

  it("keeps Environment identical across contracts and domain", () => {
    expect(ENVIRONMENTS).toEqual(schemaEnum(controlPlane, "Environment"));
    expect(ENVIRONMENTS).toEqual(schemaEnum(releaseOps, "ReleaseEnvironment"));
  });

  it("keeps core status enums aligned with public contracts", () => {
    expect(stateMachines.draft.states).toEqual(
      schemaEnum(controlPlane, "DraftStatus"),
    );
    expect(stateMachines.upload.states).toEqual(
      schemaEnum(controlPlane, "DataVersionStatus"),
    );
    expect(stateMachines.candidate.states).toEqual(
      schemaEnum(releaseOps, "CandidateStatus"),
    );
    expect(stateMachines.deployment.states).toEqual(
      schemaEnum(releaseOps, "DeploymentStatus"),
    );
    expect(stateMachines.credential.states).toEqual(
      schemaEnum(releaseOps, "CredentialStatus"),
    );
    expect(stateMachines.serviceVersion.states).toEqual(
      schemaEnum(releaseOps, "ServiceVersionStatus"),
    );
  });

  it("keeps operations summary status fields explicit and schema-backed", () => {
    const operationsSummary =
      releaseOps.components.schemas.OperationsSummaryResponse;

    expect(operationsSummary?.properties?.status).toBeUndefined();
    expect(operationsSummary?.required).toContain("serviceVersionStatus");
    expect(operationsSummary?.required).toContain("deploymentStatus");
    expect(operationsSummary?.properties?.serviceVersionStatus).toMatchObject({
      $ref: "#/components/schemas/ServiceVersionStatus",
    });
    expect(operationsSummary?.properties?.deploymentStatus).toMatchObject({
      $ref: "#/components/schemas/DeploymentStatus",
    });
  });
});

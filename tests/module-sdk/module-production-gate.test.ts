import {
  createHash,
  generateKeyPairSync,
  sign as signPayload,
} from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  catalogModuleNameForManifestId,
  createEd25519ModuleSignatureVerifier,
  createInMemoryModuleArtifactVerifier,
  moduleSignatureDigest,
  moduleSignaturePayload,
  validateHistoricalRuntimeModules,
  validateNewProductionPublishModules,
  type ModuleArtifactVerifier,
  type ModuleReviewStatus,
  type ProductionModuleCatalogPort,
  type ProductionModuleReference,
  type ReviewedModuleCatalogRecord,
  type TypedModuleManifest,
} from "../../packages/module-sdk/src/index.js";
import { manifest } from "./module-graph-fixtures.js";

const trusted = generateKeyPairSync("ed25519");
const wrong = generateKeyPairSync("ed25519");
const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
const testKeyId = "test-root-ed25519";
const defaultArtifact = Buffer.from("artifact-a", "utf8");

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function signedManifest(
  input: {
    readonly id?: string;
    readonly keyId?: string;
    readonly privateKey?: typeof trusted.privateKey;
    readonly artifact?: Uint8Array;
    readonly risk?: TypedModuleManifest["risk"];
  } = {},
): TypedModuleManifest {
  const artifact = input.artifact ?? defaultArtifact;
  const artifactDigest = sha256(artifact);
  const unsigned = manifest({
    id: input.id ?? "capability.signed",
    type: "capability",
    risk: input.risk,
    digestSeed: "a",
  });
  const draft = {
    ...unsigned,
    implementation: `builtin:${(input.id ?? "capability.signed").split(".")[1] ?? "signed"}@${artifactDigest}`,
    artifactDigest,
    signature: { keyId: input.keyId ?? testKeyId, value: "" },
  };
  const signature = signPayload(
    null,
    Buffer.from(moduleSignaturePayload(draft), "utf8"),
    input.privateKey ?? trusted.privateKey,
  ).toString("base64url");
  return { ...draft, signature: { ...draft.signature, value: signature } };
}

function referenceFor(
  manifest: TypedModuleManifest,
): ProductionModuleReference {
  return {
    moduleId: manifest.id,
    exactVersion: manifest.version,
    artifactDigest: manifest.artifactDigest,
  };
}

function catalogFor(
  manifest: TypedModuleManifest,
  status: ModuleReviewStatus,
): ReviewedModuleCatalogRecord {
  return {
    ...referenceFor(manifest),
    moduleVersionId: "018f0000-0000-7000-8000-000000004001",
    moduleName: catalogModuleNameForManifestId(manifest.id),
    moduleKind: manifest.type,
    status,
    signatureDigest: moduleSignatureDigest(manifest.signature.value),
  };
}

function catalogPort(records: readonly unknown[]): ProductionModuleCatalogPort {
  const byKey = new Map(
    records
      .filter(
        (entry): entry is ReviewedModuleCatalogRecord =>
          typeof entry === "object" &&
          entry !== null &&
          "moduleId" in entry &&
          "exactVersion" in entry &&
          "artifactDigest" in entry,
      )
      .map((entry) => [
        `${entry.moduleId}@${entry.exactVersion}:${entry.artifactDigest}`,
        entry,
      ]),
  );
  return {
    async findExact(reference) {
      return (
        byKey.get(
          `${reference.moduleId}@${reference.exactVersion}:${reference.artifactDigest}`,
        ) ?? null
      );
    },
  };
}

function artifactVerifierFor(
  manifest: TypedModuleManifest,
  bytes: Uint8Array = defaultArtifact,
): ModuleArtifactVerifier {
  return createInMemoryModuleArtifactVerifier({
    [manifest.artifactDigest]: bytes,
  });
}

const verifier = createEd25519ModuleSignatureVerifier([
  {
    keyId: testKeyId,
    algorithm: "ed25519",
    publicKey: trusted.publicKey,
  },
]);

describe("production module gate", () => {
  it("accepts only approved exact modules with matching digest, signature, and artifact bytes", async () => {
    const approved = signedManifest();

    await expect(
      validateNewProductionPublishModules({
        knownManifests: [approved],
        references: [referenceFor(approved)],
        catalog: catalogPort([catalogFor(approved, "approved")]),
        signatureVerifier: verifier,
        artifactVerifier: artifactVerifierFor(approved),
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: [
        expect.objectContaining({
          registryKey: "capability.signed@1.0.0",
          catalog: expect.objectContaining({ status: "approved" }),
        }),
      ],
    });
  });

  it("separately blocks reference digest tampering and actual artifact replacement", async () => {
    const approved = signedManifest();
    const tamperedReference = {
      ...referenceFor(approved),
      artifactDigest:
        "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    };

    await expect(
      validateNewProductionPublishModules({
        knownManifests: [approved],
        references: [tamperedReference],
        catalog: catalogPort([catalogFor(approved, "approved")]),
        signatureVerifier: verifier,
        artifactVerifier: artifactVerifierFor(approved),
      }),
    ).resolves.toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: "artifact_digest_mismatch" })],
    });
    await expect(
      validateNewProductionPublishModules({
        knownManifests: [approved],
        references: [referenceFor(approved)],
        catalog: catalogPort([catalogFor(approved, "approved")]),
        signatureVerifier: verifier,
        artifactVerifier: artifactVerifierFor(
          approved,
          Buffer.from("artifact-b", "utf8"),
        ),
      }),
    ).resolves.toMatchObject({
      ok: false,
      issues: [
        expect.objectContaining({
          code: "module_artifact_verification_failed",
        }),
      ],
    });
  });

  it("blocks implementation digest mismatches before artifact verification succeeds", async () => {
    const approved = signedManifest();
    const mismatchedImplementation = {
      ...approved,
      implementation:
        "builtin:signed@sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    };

    await expect(
      validateNewProductionPublishModules({
        knownManifests: [mismatchedImplementation],
        references: [referenceFor(mismatchedImplementation)],
        catalog: catalogPort([
          catalogFor(mismatchedImplementation, "approved"),
        ]),
        signatureVerifier: verifier,
        artifactVerifier: artifactVerifierFor(mismatchedImplementation),
      }),
    ).resolves.toMatchObject({
      ok: false,
      issues: [
        expect.objectContaining({
          code: "module_implementation_digest_mismatch",
        }),
      ],
    });
  });

  it("blocks tampered manifest fields even if a caller passes the original payload shape", async () => {
    const signed = signedManifest({ id: "capability.tampered" });
    const mutations: readonly TypedModuleManifest[] = [
      { ...signed, provides: ["tool.tampered_after_signing"] },
      { ...signed, permissions: ["resource:read"] },
      { ...signed, limits: { ...signed.limits, maxResults: 9 } },
      {
        ...signed,
        implementation: `builtin:other@${signed.artifactDigest}`,
      },
      {
        ...signed,
        artifactDigest:
          "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      },
      { ...signed, signature: { ...signed.signature, keyId: "other-key" } },
    ];

    for (const tampered of mutations) {
      await expect(
        validateNewProductionPublishModules({
          knownManifests: [tampered],
          references: [referenceFor(tampered)],
          catalog: catalogPort([catalogFor(tampered, "approved")]),
          signatureVerifier: verifier,
          artifactVerifier: artifactVerifierFor(tampered),
        }),
      ).resolves.toMatchObject({
        ok: false,
        issues: expect.arrayContaining([
          expect.objectContaining({
            code: expect.stringMatching(
              /module_signature_invalid|module_implementation_digest_mismatch|artifact_digest_mismatch/,
            ),
          }),
        ]),
      });
    }

    const maliciousInput = {
      manifest: { ...signed, provides: ["tool.changed"] },
      canonicalPayload: moduleSignaturePayload(signed),
    };
    expect(verifier.verifyModuleSignature(maliciousInput)).toMatchObject({
      ok: false,
    });
  });

  it("blocks mismatched signature digests, wrong keys, and verifier failures", async () => {
    const approved = signedManifest();
    const wrongKey = signedManifest({
      id: "capability.wrong-key",
      privateKey: wrong.privateKey,
    });
    const throwingVerifier = {
      verifyModuleSignature() {
        throw new Error("verifier unavailable");
      },
    };

    await expect(
      validateNewProductionPublishModules({
        knownManifests: [approved],
        references: [referenceFor(approved)],
        catalog: catalogPort([
          {
            ...catalogFor(approved, "approved"),
            signatureDigest:
              "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
          },
        ]),
        signatureVerifier: verifier,
        artifactVerifier: artifactVerifierFor(approved),
      }),
    ).resolves.toMatchObject({
      ok: false,
      issues: [
        expect.objectContaining({
          code: "module_signature_digest_mismatch",
        }),
      ],
    });
    await expect(
      validateNewProductionPublishModules({
        knownManifests: [wrongKey],
        references: [referenceFor(wrongKey)],
        catalog: catalogPort([catalogFor(wrongKey, "approved")]),
        signatureVerifier: verifier,
        artifactVerifier: artifactVerifierFor(wrongKey),
      }),
    ).resolves.toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: "module_signature_invalid" })],
    });
    await expect(
      validateNewProductionPublishModules({
        knownManifests: [approved],
        references: [referenceFor(approved)],
        catalog: catalogPort([catalogFor(approved, "approved")]),
        signatureVerifier: throwingVerifier,
        artifactVerifier: artifactVerifierFor(approved),
      }),
    ).resolves.toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: "module_signature_invalid" })],
    });
  });

  it("rejects non-canonical or non-64-byte Ed25519 signatures", () => {
    const signed = signedManifest();
    const invalidValues = [
      "",
      `${signed.signature.value}=`,
      ` ${signed.signature.value}`,
      `${signed.signature.value}\n`,
      signed.signature.value.replaceAll("-", "+"),
      Buffer.alloc(63).toString("base64url"),
      Buffer.alloc(65).toString("base64url"),
    ];

    for (const value of invalidValues) {
      expect(
        verifier.verifyModuleSignature({
          manifest: { ...signed, signature: { ...signed.signature, value } },
        }),
      ).toMatchObject({ ok: false });
    }
  });

  it("rejects duplicate, private, non-Ed25519, and invalid trust roots", () => {
    expect(() =>
      createEd25519ModuleSignatureVerifier([
        {
          keyId: testKeyId,
          algorithm: "ed25519",
          publicKey: trusted.publicKey,
        },
        {
          keyId: testKeyId,
          algorithm: "ed25519",
          publicKey: trusted.publicKey,
        },
      ]),
    ).toThrow("duplicate module signature trust root");
    expect(() =>
      createEd25519ModuleSignatureVerifier([
        {
          keyId: "private",
          algorithm: "ed25519",
          publicKey: trusted.privateKey,
        },
      ]),
    ).toThrow("public key");
    expect(() =>
      createEd25519ModuleSignatureVerifier([
        { keyId: "rsa", algorithm: "ed25519", publicKey: rsa.publicKey },
      ]),
    ).toThrow("Ed25519");
    expect(() =>
      createEd25519ModuleSignatureVerifier([
        { keyId: "bad", algorithm: "ed25519", publicKey: "not a pem" },
      ]),
    ).toThrow("parseable");
  });

  it("validates catalog records defensively before status or signature checks", async () => {
    const approved = signedManifest();
    const valid = catalogFor(approved, "approved");
    const invalidRecords = [
      { ...valid, moduleId: "capability.other" },
      { ...valid, exactVersion: "2.0.0" },
      {
        ...valid,
        artifactDigest:
          "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      },
      { ...valid, moduleKind: "source" },
      { ...valid, status: "unknown" },
      { ...valid, signatureDigest: "sha256:not-valid" },
      { ...valid, moduleVersionId: undefined },
    ];

    for (const catalogRecord of invalidRecords) {
      await expect(
        validateNewProductionPublishModules({
          knownManifests: [approved],
          references: [referenceFor(approved)],
          catalog: {
            async findExact() {
              return catalogRecord as never;
            },
          },
          signatureVerifier: verifier,
          artifactVerifier: artifactVerifierFor(approved),
        }),
      ).resolves.toMatchObject({
        ok: false,
        issues: [expect.objectContaining({ code: "module_catalog_mismatch" })],
      });
    }
  });

  it("separates new-publish and historical-runtime deprecated semantics", async () => {
    const deprecated = signedManifest({ id: "capability.deprecated" });
    const blocked = signedManifest({ id: "capability.blocked" });
    const testing = signedManifest({ id: "capability.testing" });

    await expect(
      validateNewProductionPublishModules({
        knownManifests: [deprecated],
        references: [referenceFor(deprecated)],
        catalog: catalogPort([catalogFor(deprecated, "deprecated")]),
        signatureVerifier: verifier,
        artifactVerifier: artifactVerifierFor(deprecated),
      }),
    ).resolves.toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: "module_deprecated" })],
    });
    await expect(
      validateHistoricalRuntimeModules({
        knownManifests: [deprecated],
        references: [referenceFor(deprecated)],
        catalog: catalogPort([catalogFor(deprecated, "deprecated")]),
        signatureVerifier: verifier,
        artifactVerifier: artifactVerifierFor(deprecated),
      }),
    ).resolves.toMatchObject({ ok: true });

    for (const validate of [
      validateNewProductionPublishModules,
      validateHistoricalRuntimeModules,
    ]) {
      await expect(
        validate({
          knownManifests: [blocked],
          references: [referenceFor(blocked)],
          catalog: catalogPort([catalogFor(blocked, "blocked")]),
          signatureVerifier: verifier,
          artifactVerifier: artifactVerifierFor(blocked),
        }),
      ).resolves.toMatchObject({
        ok: false,
        issues: [expect.objectContaining({ code: "module_blocked" })],
      });
      await expect(
        validate({
          knownManifests: [testing],
          references: [referenceFor(testing)],
          catalog: catalogPort([catalogFor(testing, "testing")]),
          signatureVerifier: verifier,
          artifactVerifier: artifactVerifierFor(testing),
        }),
      ).resolves.toMatchObject({
        ok: false,
        issues: [expect.objectContaining({ code: "module_not_approved" })],
      });
    }
  });

  it("fails closed when the artifact verifier throws and freezes successful output", async () => {
    const approved = signedManifest();
    const throwingArtifactVerifier = {
      async verifyModuleArtifact() {
        throw new Error("artifact store unavailable");
      },
    };

    await expect(
      validateNewProductionPublishModules({
        knownManifests: [approved],
        references: [referenceFor(approved)],
        catalog: catalogPort([catalogFor(approved, "approved")]),
        signatureVerifier: verifier,
        artifactVerifier: throwingArtifactVerifier,
      }),
    ).resolves.toMatchObject({
      ok: false,
      issues: [
        expect.objectContaining({
          code: "module_artifact_verification_failed",
        }),
      ],
    });

    const references = [referenceFor(approved)];
    const result = await validateNewProductionPublishModules({
      knownManifests: [approved],
      references,
      catalog: catalogPort([catalogFor(approved, "approved")]),
      signatureVerifier: verifier,
      artifactVerifier: artifactVerifierFor(approved),
    });
    references[0] = {
      moduleId: "capability.changed",
      exactVersion: "9.9.9",
      artifactDigest:
        "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    };

    expect(result).toMatchObject({
      ok: true,
      value: [
        expect.objectContaining({ registryKey: "capability.signed@1.0.0" }),
      ],
    });
    if (result.ok) {
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(Object.isFrozen(result.value[0]?.manifest)).toBe(true);
      expect(() => {
        (result.value as ApprovedProductionModuleMutable[]).push(
          result.value[0] as ApprovedProductionModuleMutable,
        );
      }).toThrow();
    }
  });
});

interface ApprovedProductionModuleMutable {
  registryKey: string;
}

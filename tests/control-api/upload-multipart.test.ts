import { describe, expect, it } from "vitest";
import {
  abortMultipartUpload,
  completeMultipartUpload,
  confirmMultipartUploadPart,
  createMultipartUpload,
  signMultipartUploadPart,
  recoverMultipartUpload,
  type MultipartObjectStoragePort,
  type MultipartUploadRecord,
  type MultipartUploadRepository,
  type UploadedPartRecord,
} from "../../apps/control-api/src/index.js";
import {
  authorizeControlPlane,
  createDevelopmentIdentityProvider,
  createOidcActorAuthenticator,
  type ActorContext,
  type ActorMembershipRecord,
  type ControlPlaneAuthorizationScope,
  type RbacRole,
} from "../../packages/authz/src/index.js";

const actorId = "usr_018f0000-0000-7000-8000-000000000101";
const workspaceId = "ws_018f0000-0000-7000-8000-000000000001";
const projectId = "prj_018f0000-0000-7000-8000-000000000201";
const otherProjectId = "prj_018f0000-0000-7000-8000-000000000202";
const draftId = "drf_018f0000-0000-7000-8000-000000000501";
const dataSourceId = "ds_018f0000-0000-7000-8000-000000000301";
const uploadId = "upl_018f0000-0000-7000-8000-000000000601";
const dataVersionId = "dv_018f0000-0000-7000-8000-000000000701";
const scope: ControlPlaneAuthorizationScope = {
  kind: "project",
  workspaceId,
  projectId,
  environment: "production",
};
const now = () => new Date("2026-09-20T00:00:00.000Z");
const part: UploadedPartRecord = {
  partNumber: 1,
  sizeBytes: 12,
  checksumSha256:
    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  etag: "etag-1",
  confirmedAt: "2026-09-20T00:01:00.000Z",
};

function idp() {
  const provider = createDevelopmentIdentityProvider({
    enabled: true,
    runtimeEnvironment: "development",
  });
  if (!provider) {
    throw new Error("expected development IdP");
  }
  return provider;
}

async function actorContext(role: RbacRole): Promise<ActorContext> {
  const provider = idp();
  const records: readonly ActorMembershipRecord[] = [
    {
      actorId,
      workspaceId,
      roles: [role],
      capabilities: [],
    },
    {
      actorId,
      workspaceId,
      projectId,
      environment: "production",
      roles: [role],
      capabilities: [],
    },
  ];
  const authenticator = createOidcActorAuthenticator(
    {
      issuer: provider.issuer,
      audience: provider.audience,
      environment: provider.environment,
      jwks: provider.jwks,
    },
    {
      async resolveMemberships() {
        return records;
      },
    },
  );
  const result = await authenticator.authenticateBearerToken(
    provider.issueToken({ subject: "editor@example.test" }),
  );
  if (!result.ok) {
    throw new Error(result.error.category);
  }
  return result.value;
}

class MemoryUploadRepository implements MultipartUploadRepository {
  readonly uploads = new Map<string, MultipartUploadRecord>();

  async create(input: Parameters<MultipartUploadRepository["create"]>[0]) {
    const active = [...this.uploads.values()].filter(
      (upload) =>
        upload.draftId === input.draftId && upload.status !== "cancelled",
    );
    const total = active.reduce(
      (sum, upload) => sum + upload.declaredSizeBytes,
      0,
    );
    if (
      active.length + 1 > input.limits.maxFilesPerDraft ||
      total + input.declaredSizeBytes > input.limits.maxDraftTotalBytes
    ) {
      return { ok: false as const, error: "limit_exceeded" as const };
    }
    const upload: MultipartUploadRecord = {
      uploadId: input.uploadId,
      draftId: input.draftId,
      dataSourceId: input.dataSourceId,
      dataVersionId: input.dataVersionId,
      objectKey: input.objectKey,
      storageUploadId: input.storageUploadId,
      declaredFileName: input.declaredFileName,
      declaredSizeBytes: input.declaredSizeBytes,
      status: "uploading",
      expiresAt: input.expiresAt,
      revision: 1,
      parts: [],
    };
    this.uploads.set(input.uploadId, upload);
    return { ok: true as const, value: upload };
  }

  async getActive(
    input: Parameters<MultipartUploadRepository["getActive"]>[0],
  ) {
    const upload = this.uploads.get(input.uploadId);
    if (!upload || input.scope.projectId !== projectId) {
      return { ok: false as const, error: "not_found_or_forbidden" as const };
    }
    if (
      upload.status === "uploading" &&
      Date.parse(upload.expiresAt) <= Date.parse(input.now)
    ) {
      return { ok: false as const, error: "expired" as const };
    }
    return { ok: true as const, value: upload };
  }

  async recordPart(
    input: Parameters<MultipartUploadRepository["recordPart"]>[0],
  ) {
    const upload = this.uploads.get(input.uploadId);
    if (!upload || upload.status !== "uploading") {
      return { ok: false as const, error: "invalid_state" as const };
    }
    const existing = upload.parts.find(
      (candidate) => candidate.partNumber === input.part.partNumber,
    );
    if (
      existing &&
      (existing.sizeBytes !== input.part.sizeBytes ||
        existing.checksumSha256 !== input.part.checksumSha256)
    ) {
      return { ok: false as const, error: "part_mismatch" as const };
    }
    if (!existing) {
      this.uploads.set(input.uploadId, {
        ...upload,
        revision: upload.revision + 1,
        parts: [...upload.parts, input.part],
      });
    }
    return { ok: true as const, value: this.uploads.get(input.uploadId)! };
  }

  async complete(input: Parameters<MultipartUploadRepository["complete"]>[0]) {
    const upload = this.uploads.get(input.uploadId);
    if (!upload) {
      return { ok: false as const, error: "not_found_or_forbidden" as const };
    }
    if (upload.status === "uploaded") {
      return { ok: true as const, value: upload };
    }
    const completed: MultipartUploadRecord = {
      ...upload,
      status: "uploaded",
      serverSizeBytes: input.sizeBytes,
      serverChecksumSha256: input.checksumSha256,
      revision: upload.revision + 1,
    };
    this.uploads.set(input.uploadId, completed);
    return { ok: true as const, value: completed };
  }

  async abort(input: Parameters<MultipartUploadRepository["abort"]>[0]) {
    const upload = this.uploads.get(input.uploadId);
    if (!upload) {
      return { ok: false as const, error: "not_found_or_forbidden" as const };
    }
    if (upload.status === "uploaded") {
      return { ok: false as const, error: "invalid_state" as const };
    }
    const cancelled: MultipartUploadRecord = {
      ...upload,
      status: "cancelled",
      revision:
        upload.status === "cancelled" ? upload.revision : upload.revision + 1,
    };
    this.uploads.set(input.uploadId, cancelled);
    return { ok: true as const, value: cancelled };
  }

  async recoverExpired(
    input: Parameters<MultipartUploadRepository["recoverExpired"]>[0],
  ) {
    const upload = this.uploads.get(input.uploadId);
    if (!upload || input.parts.length === 0) {
      return { ok: false as const, error: "expired" as const };
    }
    const recovered: MultipartUploadRecord = {
      ...upload,
      expiresAt: input.expiresAt,
      revision: upload.revision + 1,
      parts: input.parts,
    };
    this.uploads.set(input.uploadId, recovered);
    return { ok: true as const, value: recovered };
  }
}

class MemoryStorage implements MultipartObjectStoragePort {
  readonly parts = new Map<string, UploadedPartRecord>();
  completeCalls = 0;
  abortCalls = 0;

  async createMultipartUpload() {
    return { storageUploadId: "storage-upload-1" };
  }

  async presignUploadPart(input: {
    readonly objectKey: string;
    readonly storageUploadId: string;
    readonly partNumber: number;
    readonly expiresAt: Date;
  }) {
    return {
      method: "PUT" as const,
      url: `https://minio.local/${encodeURIComponent(input.objectKey)}?uploadId=${input.storageUploadId}&partNumber=${input.partNumber}`,
      expiresAt: input.expiresAt.toISOString(),
      signedHeaders: ["host"],
    };
  }

  async inspectUploadedPart(input: { readonly partNumber: number }) {
    return this.parts.get(String(input.partNumber)) ?? null;
  }

  async listUploadedParts() {
    return [...this.parts.values()];
  }

  async completeMultipartUpload() {
    this.completeCalls += 1;
    return {
      sizeBytes: 12,
      checksumSha256:
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    };
  }

  async abortMultipartUpload() {
    this.abortCalls += 1;
  }
}

async function createStartedUpload(
  repository = new MemoryUploadRepository(),
  storage = new MemoryStorage(),
) {
  const context = await actorContext("editor");
  const created = await createMultipartUpload({
    actorContext: context,
    scope,
    draftId,
    dataSourceId,
    declaredFileName: "guide.pdf",
    declaredContentType: "application/pdf",
    declaredSizeBytes: 12,
    repository,
    storage,
    authorize: authorizeControlPlane,
    now,
    ids: {
      uploadId: () => uploadId,
      dataVersionId: () => dataVersionId,
    },
  });
  expect(created.ok).toBe(true);
  return { context, repository, storage, upload: created.value.upload };
}

describe("multipart upload use-cases", () => {
  it("creates isolated object keys, signs stable part URLs, confirms parts with a fixed clock, and completes idempotently", async () => {
    const { context, repository, storage, upload } =
      await createStartedUpload();
    expect(upload.objectKey).toContain(encodeURIComponent(workspaceId));
    expect(upload.objectKey).toContain(encodeURIComponent(projectId));
    expect(upload.objectKey).toContain(encodeURIComponent(draftId));
    expect(upload.objectKey).toContain(encodeURIComponent(uploadId));

    const firstSign = await signMultipartUploadPart({
      actorContext: context,
      scope,
      uploadId,
      partNumber: 1,
      repository,
      storage,
      authorize: authorizeControlPlane,
      now,
    });
    const secondSign = await signMultipartUploadPart({
      actorContext: context,
      scope,
      uploadId,
      partNumber: 1,
      repository,
      storage,
      authorize: authorizeControlPlane,
      now,
    });
    expect(firstSign).toEqual(secondSign);

    storage.parts.set("1", part);
    const confirmed = await confirmMultipartUploadPart({
      actorContext: context,
      scope,
      uploadId,
      objectKey: upload.objectKey,
      partNumber: 1,
      sizeBytes: 12,
      checksumSha256: part.checksumSha256,
      repository,
      storage,
      authorize: authorizeControlPlane,
      now,
    });
    expect(confirmed.ok).toBe(true);
    expect(confirmed.value.upload.parts).toHaveLength(1);

    const completed = await completeMultipartUpload({
      actorContext: context,
      scope,
      uploadId,
      repository,
      storage,
      authorize: authorizeControlPlane,
      now,
    });
    const replayed = await completeMultipartUpload({
      actorContext: context,
      scope,
      uploadId,
      repository,
      storage,
      authorize: authorizeControlPlane,
      now,
    });
    expect(completed).toEqual(replayed);
    expect(storage.completeCalls).toBe(1);
  });

  it("checks upload permission on every operation and hides cross-project uploads", async () => {
    const { context, repository, storage } = await createStartedUpload();
    const deniedScope = { ...scope, projectId: otherProjectId };
    const signed = await signMultipartUploadPart({
      actorContext: context,
      scope: deniedScope,
      uploadId,
      partNumber: 1,
      repository,
      storage,
      authorize: authorizeControlPlane,
      now,
    });
    expect(signed).toMatchObject({
      ok: false,
      error: { status: 404 },
    });

    const observer = await actorContext("observer");
    const aborted = await abortMultipartUpload({
      actorContext: observer,
      scope,
      uploadId,
      repository,
      storage,
      authorize: authorizeControlPlane,
      now,
    });
    expect(aborted).toMatchObject({
      ok: false,
      error: { status: 404 },
    });
  });

  it("rejects tampered key, part, size, checksum, and invalid clocks", async () => {
    const { context, repository, storage, upload } =
      await createStartedUpload();
    storage.parts.set("1", part);
    for (const request of [
      {
        objectKey: `${upload.objectKey}.evil`,
        partNumber: 1,
        sizeBytes: 12,
        checksumSha256: part.checksumSha256,
      },
      {
        objectKey: upload.objectKey,
        partNumber: 2,
        sizeBytes: 12,
        checksumSha256: part.checksumSha256,
      },
      {
        objectKey: upload.objectKey,
        partNumber: 1,
        sizeBytes: 13,
        checksumSha256: part.checksumSha256,
      },
      {
        objectKey: upload.objectKey,
        partNumber: 1,
        sizeBytes: 12,
        checksumSha256:
          "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      },
    ]) {
      const result = await confirmMultipartUploadPart({
        actorContext: context,
        scope,
        uploadId,
        repository,
        storage,
        authorize: authorizeControlPlane,
        now,
        ...request,
      });
      expect(result.ok).toBe(false);
      expect(result.error.body.error.category).not.toBe("upload_expired");
    }

    const invalidClock = await confirmMultipartUploadPart({
      actorContext: context,
      scope,
      uploadId,
      objectKey: upload.objectKey,
      partNumber: 1,
      sizeBytes: 12,
      checksumSha256: part.checksumSha256,
      repository,
      storage,
      authorize: authorizeControlPlane,
      now: () => new Date("not-a-date"),
    });
    expect(invalidClock).toMatchObject({
      ok: false,
      error: {
        status: 503,
        body: {
          error: {
            code: "DEPENDENCY_UNAVAILABLE",
            category: "invalid_upload_clock",
          },
        },
      },
    });

    const throwingClock = await confirmMultipartUploadPart({
      actorContext: context,
      scope,
      uploadId,
      objectKey: upload.objectKey,
      partNumber: 1,
      sizeBytes: 12,
      checksumSha256: part.checksumSha256,
      repository,
      storage,
      authorize: authorizeControlPlane,
      now: () => {
        throw new Error("synthetic clock failure");
      },
    });
    expect(throwingClock).toMatchObject({
      ok: false,
      error: {
        status: 503,
        body: {
          error: {
            code: "DEPENDENCY_UNAVAILABLE",
            category: "invalid_upload_clock",
          },
        },
      },
    });
  });

  it("enforces draft limits and recovers valid expired parts", async () => {
    const repository = new MemoryUploadRepository();
    const storage = new MemoryStorage();
    const context = await actorContext("editor");
    const limited = await createMultipartUpload({
      actorContext: context,
      scope,
      draftId,
      dataSourceId,
      declaredFileName: "too-large.bin",
      declaredContentType: "application/octet-stream",
      declaredSizeBytes: 13,
      repository,
      storage,
      authorize: authorizeControlPlane,
      limits: { maxSingleFileBytes: 12 },
      now,
      ids: {
        uploadId: () => uploadId,
        dataVersionId: () => dataVersionId,
      },
    });
    expect(limited).toMatchObject({
      ok: false,
      error: {
        status: 400,
        body: { error: { code: "UPLOAD_LIMIT_EXCEEDED" } },
      },
    });

    const created = await createStartedUpload(repository, storage);
    storage.parts.set("1", part);
    created.repository.uploads.set(uploadId, {
      ...created.upload,
      expiresAt: "2026-09-19T00:00:00.000Z",
    });
    const recovered = await recoverMultipartUpload({
      actorContext: created.context,
      scope,
      uploadId,
      repository,
      storage,
      authorize: authorizeControlPlane,
      now,
    });
    expect(recovered.ok).toBe(true);
    expect(recovered.value.upload.parts).toEqual([part]);
    expect(recovered.value.upload.expiresAt).toBe("2026-09-21T00:00:00.000Z");
  });
});

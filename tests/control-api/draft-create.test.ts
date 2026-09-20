import { describe, expect, it } from "vitest";
import {
  authorizeControlPlane,
  controlPlaneCapabilities,
  type ActorContext,
} from "../../packages/authz/src/index.js";
import {
  buildDraftGoalSummary,
  completeDraftGoalStep,
  createDraft,
  draftTemplates,
  listDraftTemplates,
  saveDraftGoal,
  updateDraft,
  type CopyableServiceVersion,
  type DraftCreationRepository,
  type DraftGoalRepository,
  type DraftGoalResponse,
  type DraftRecord,
  type DraftScope,
  type DraftStatus,
  type DraftUpdateRepository,
  type GoalSelection,
  type WizardStep,
} from "../../apps/control-api/src/index.js";

const actorId = "usr_018f0000-0000-7000-8000-000000000101";
const workspaceId = "ws_018f0000-0000-7000-8000-000000000001";
const projectId = "prj_018f0000-0000-7000-8000-000000000201";
const sourceVersionId = "sv_018f0000-0000-7000-8000-000000001501";
const definitionId = "def_018f0000-0000-7000-8000-000000001201";
const digest =
  "sha256:1111111111111111111111111111111111111111111111111111111111111111";
const now = new Date("2026-09-20T00:00:00.000Z");

const scope: DraftScope = {
  workspaceId,
  projectId,
  environment: "development",
};

const defaultGoal: GoalSelection = {
  description: "Search support content",
  audience: "internal_members",
  prohibitedUses: ["bulk_export"],
  capabilities: ["search_content", "verify_citation"],
};

function actorContext(canEdit = true): ActorContext {
  const capabilities = canEdit
    ? [
        controlPlaneCapabilities.draftEdit,
        controlPlaneCapabilities.projectRead,
        controlPlaneCapabilities.workspaceRead,
      ]
    : [
        controlPlaneCapabilities.projectRead,
        controlPlaneCapabilities.workspaceRead,
      ];
  return {
    schemaVersion: "authz.actor-context.v1",
    actorId,
    identity: {
      issuer: "https://issuer.example.test",
      subject: "person@example.test",
    },
    environment: "development",
    workspaces: [
      {
        workspaceId,
        roles: ["editor"],
        capabilities,
        projects: [
          {
            projectId,
            environment: "development",
            roles: ["editor"],
            capabilities,
          },
        ],
      },
    ],
  } as unknown as ActorContext;
}

class InMemoryDraftRepository implements DraftCreationRepository {
  readonly created: Parameters<DraftCreationRepository["createDraft"]>[0][] =
    [];
  readonly sources = new Map<string, CopyableServiceVersion>();
  readonly idempotency = new Map<
    string,
    {
      readonly requestDigest: string;
      readonly draft: Awaited<
        ReturnType<DraftCreationRepository["createDraft"]>
      > extends { readonly draft: infer Draft }
        ? Draft
        : never;
    }
  >();

  async findCopyableServiceVersion(input: {
    readonly sourceVersionId: string;
  }): Promise<CopyableServiceVersion | null> {
    return this.sources.get(input.sourceVersionId) ?? null;
  }

  async createDraft(
    input: Parameters<DraftCreationRepository["createDraft"]>[0],
  ) {
    const previous = this.idempotency.get(input.idempotencyKey);
    if (previous) {
      if (previous.requestDigest !== input.requestDigest) {
        return { kind: "idempotency_conflict" as const };
      }
      return { kind: "replayed" as const, draft: previous.draft };
    }
    if (
      input.sourceVersionId !== null &&
      !this.sources.has(input.sourceVersionId)
    ) {
      return { kind: "source_version_not_found" as const };
    }
    this.created.push(input);
    const goal = input.document.goal;
    const draft = {
      draftId: input.draftId,
      projectId: input.scope.projectId,
      environment: input.scope.environment,
      name: input.name,
      status: "editing" as DraftStatus,
      revision: 1,
      currentStep: "goal" as WizardStep,
      ...(goal ? { goal } : {}),
      document: input.document,
      updatedAt: input.occurredAt,
    };
    this.idempotency.set(input.idempotencyKey, {
      requestDigest: input.requestDigest,
      draft,
    });
    return { kind: "created" as const, draft };
  }
}

class InMemoryDraftGoalRepository implements DraftGoalRepository {
  readonly saved: Parameters<DraftGoalRepository["saveGoal"]>[0][] = [];
  readonly completed: Parameters<DraftGoalRepository["completeGoalStep"]>[0][] =
    [];

  async saveGoal(input: Parameters<DraftGoalRepository["saveGoal"]>[0]) {
    this.saved.push(input);
    return {
      kind: "saved" as const,
      draft: this.response(input, "incomplete"),
    };
  }

  async completeGoalStep(
    input: Parameters<DraftGoalRepository["completeGoalStep"]>[0],
  ) {
    this.completed.push(input);
    return {
      kind: "completed" as const,
      draft: this.response(input, "complete"),
    };
  }

  private response(
    input:
      | Parameters<DraftGoalRepository["saveGoal"]>[0]
      | Parameters<DraftGoalRepository["completeGoalStep"]>[0],
    stepStatus: "incomplete" | "complete",
  ): DraftGoalResponse {
    return {
      draftId: input.draftId,
      projectId: input.scope.projectId,
      environment: input.scope.environment,
      revision: input.expectedRevision + 1,
      currentStep: stepStatus === "complete" ? "data" : "goal",
      goal: input.goal,
      stepStatus,
      validation: input.validation,
      summary: input.summary,
      invalidation: input.invalidation,
      updatedAt: input.occurredAt,
    };
  }
}

class InMemoryDraftUpdateRepository implements DraftUpdateRepository {
  draft: DraftRecord;
  readonly baseDocuments = new Map<number, unknown>();
  readonly idempotency = new Map<
    string,
    {
      readonly requestDigest: string;
      readonly result: Awaited<
        ReturnType<DraftUpdateRepository["updateDraft"]>
      >;
    }
  >();
  updateCount = 0;

  constructor(document: Record<string, unknown>) {
    this.draft = {
      draftId: draftId(701),
      projectId,
      environment: "development",
      name: "Support Search",
      status: "editing",
      revision: 1,
      currentStep: "goal",
      document: this.clone(document),
      updatedAt: now.toISOString(),
    };
    this.baseDocuments.set(1, this.clone(document));
  }

  async updateDraft(
    input: Parameters<DraftUpdateRepository["updateDraft"]>[0],
  ) {
    const replay = this.idempotency.get(input.idempotencyKey);
    if (replay) {
      if (replay.requestDigest !== input.requestDigest) {
        return { kind: "idempotency_conflict" as const };
      }
      return replay.result;
    }
    if (input.expectedRevision !== this.draft.revision) {
      return {
        kind: "conflict" as const,
        serverRevision: this.draft.revision,
        serverDocument: this.clone(this.draft.document),
        baseDocument: this.clone(
          this.baseDocuments.get(input.expectedRevision),
        ),
        updatedAt: this.draft.updatedAt,
      };
    }
    const nextDocument = this.applyPatch(this.draft.document, input.patch);
    const updated: DraftRecord = {
      ...this.draft,
      revision: this.draft.revision + 1,
      currentStep: input.currentStep ?? this.draft.currentStep,
      document: nextDocument as DraftRecord["document"],
      updatedAt: input.occurredAt,
    };
    this.updateCount += 1;
    this.draft = updated;
    this.baseDocuments.set(updated.revision, this.clone(updated.document));
    const result = { kind: "updated" as const, draft: updated };
    this.idempotency.set(input.idempotencyKey, {
      requestDigest: input.requestDigest,
      result,
    });
    return result;
  }

  private clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private applyPatch(target: unknown, patch: unknown): unknown {
    if (
      target === null ||
      typeof target !== "object" ||
      Array.isArray(target) ||
      patch === null ||
      typeof patch !== "object" ||
      Array.isArray(patch)
    ) {
      return this.clone(patch);
    }
    const base = { ...(target as Record<string, unknown>) };
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) {
        delete base[key];
      } else {
        base[key] = this.applyPatch(base[key], value);
      }
    }
    return base;
  }
}

function draftId(sequence: number): string {
  return `drf_018f0000-0000-7000-8000-${sequence.toString().padStart(12, "0")}`;
}

function idFactory() {
  let sequence = 701;
  return () => draftId(sequence++);
}

describe("draft template catalog", () => {
  it("publishes the three P0 templates with forced platform protections", () => {
    expect(listDraftTemplates().map((template) => template.templateId)).toEqual(
      [
        "tpl_knowledge_search_v1",
        "tpl_data_validation_v1",
        "tpl_catalog_browse_v1",
      ],
    );
    for (const template of draftTemplates) {
      expect(template.platformProtections).toMatchObject({
        authenticationRequired: true,
        authorizationRequired: true,
        tenantIsolationRequired: true,
        quotaEnforced: true,
        outputGuardEnforced: true,
        auditEnforced: true,
        rawFileDownloadDisabled: true,
        wholeDocumentReadDisabled: true,
        writeActionsDisabled: true,
        externalWriteDisabled: true,
      });
      expect(template.unavailableCapabilities.length).toBeGreaterThan(0);
      expect(template.dataRequirements.length).toBeGreaterThan(0);
    }
  });
});

describe("draft goal step", () => {
  const draft = draftId(701);
  const completeGoal = {
    name: "Support Search",
    description: "Search support articles with citations.",
    audience: "internal_members",
    prohibitedUses: ["bulk_export", "reverse_identification"],
    defaultLanguage: "en",
    capabilities: ["search_content", "read_sections", "verify_citation"],
  } as const;

  it("saves incomplete required fields without completing the goal step", async () => {
    const repository = new InMemoryDraftGoalRepository();
    const result = await saveDraftGoal({
      actorContext: actorContext(),
      scope,
      draftId: draft,
      expectedRevision: 1,
      goal: {
        name: "Support Search",
        capabilities: ["search_content"],
      },
      repository,
      authorize: authorizeControlPlane,
      now: () => now,
    });

    expect(result.ok && result.value.body.stepStatus).toBe("incomplete");
    expect(result.ok && result.value.body.currentStep).toBe("goal");
    expect(result.ok && result.value.body.validation.canComplete).toBe(false);
    expect(
      result.ok &&
        result.value.body.validation.issues.map((issue) => issue.code),
    ).toEqual(
      expect.arrayContaining([
        "missing_description",
        "missing_audience",
        "missing_prohibited_uses",
        "missing_default_language",
      ]),
    );
    expect(repository.saved).toHaveLength(1);
    expect(repository.completed).toHaveLength(0);
  });

  it("does not complete the goal step until all required fields are valid", async () => {
    const repository = new InMemoryDraftGoalRepository();
    const incomplete = await completeDraftGoalStep({
      actorContext: actorContext(),
      scope,
      draftId: draft,
      expectedRevision: 1,
      goal: {
        name: "Support Search",
        capabilities: ["search_content"],
      },
      repository,
      authorize: authorizeControlPlane,
      now: () => now,
    });

    expect(incomplete).toMatchObject({
      ok: false,
      error: {
        status: 409,
        body: { error: { code: "DEFINITION_INVALID_REQUEST" } },
      },
    });
    expect(repository.completed).toHaveLength(0);

    const complete = await completeDraftGoalStep({
      actorContext: actorContext(),
      scope,
      draftId: draft,
      expectedRevision: 1,
      goal: completeGoal,
      repository,
      authorize: authorizeControlPlane,
      now: () => now,
    });

    expect(complete.ok && complete.value.body.stepStatus).toBe("complete");
    expect(complete.ok && complete.value.body.currentStep).toBe("data");
    expect(repository.completed).toHaveLength(1);
  });

  it("rejects write, delete, whole-document, and original-file capabilities", async () => {
    const repository = new InMemoryDraftGoalRepository();
    const result = await saveDraftGoal({
      actorContext: actorContext(),
      scope,
      draftId: draft,
      expectedRevision: 1,
      goal: {
        ...completeGoal,
        capabilities: [
          "search_content",
          "write_data",
          "delete_data",
          "read_whole_document",
          "download_original",
        ],
      },
      repository,
      authorize: authorizeControlPlane,
      now: () => now,
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        status: 409,
        body: { error: { code: "DEFINITION_INVALID_REQUEST" } },
      },
    });
    expect(repository.saved).toHaveLength(0);
  });

  it("builds a stable traceable summary for supported capability combinations", () => {
    const first = buildDraftGoalSummary({
      name: completeGoal.name,
      description: completeGoal.description,
      audience: completeGoal.audience,
      prohibitedUses: completeGoal.prohibitedUses,
      defaultLanguage: completeGoal.defaultLanguage,
      capabilities: ["verify_citation", "read_sections", "search_content"],
    });
    const second = buildDraftGoalSummary({
      name: completeGoal.name,
      description: completeGoal.description,
      audience: completeGoal.audience,
      prohibitedUses: completeGoal.prohibitedUses,
      defaultLanguage: completeGoal.defaultLanguage,
      capabilities: ["search_content", "read_sections", "verify_citation"],
    });

    expect(first).toEqual(second);
    expect(first.expectedTools).toEqual([
      "get_document_section",
      "search_documents",
      "verify_citation",
    ]);
    expect(first.expectedResources).toEqual(["citations", "sections"]);
    expect(first.expectedPrompts).toEqual(["search_and_answer"]);
    expect(first.defaultOutputLimits).toEqual({
      maxResults: 10,
      maxSections: 5,
      citationsRequired: true,
    });
    expect(first.explicitlyDisabled).toEqual([
      "原文件下载",
      "整篇读取",
      "数据写入",
      "数据删除",
      "外部动作执行",
    ]);
    expect(first.trace.map((item) => item.capability)).toEqual([
      "search_content",
      "read_sections",
      "verify_citation",
    ]);
  });

  it("returns downstream invalidation signals when target changes affect recommendations", async () => {
    const repository = new InMemoryDraftGoalRepository();
    const previousSummary = buildDraftGoalSummary({
      name: "Catalog",
      description: "Browse catalog metadata.",
      audience: "internal_members",
      prohibitedUses: ["bulk_export"],
      defaultLanguage: "en",
      capabilities: ["browse_catalog", "view_metadata"],
    });

    const result = await saveDraftGoal({
      actorContext: actorContext(),
      scope,
      draftId: draft,
      expectedRevision: 3,
      goal: completeGoal,
      previousSummary,
      repository,
      authorize: authorizeControlPlane,
      now: () => now,
    });

    expect(result.ok && result.value.body.invalidation).toEqual([
      {
        reason: "goal_changed",
        invalidates: ["modules", "configuration", "preview", "test", "publish"],
      },
      {
        reason: "capability_set_changed",
        invalidates: ["modules", "configuration", "preview", "test", "publish"],
      },
      {
        reason: "recommended_inputs_changed",
        invalidates: ["data", "modules", "preview", "test", "publish"],
      },
    ]);
  });

  it("fails closed before saving when draft.edit is missing", async () => {
    const repository = new InMemoryDraftGoalRepository();
    const result = await saveDraftGoal({
      actorContext: actorContext(false),
      scope,
      draftId: draft,
      expectedRevision: 1,
      goal: completeGoal,
      repository,
      authorize: authorizeControlPlane,
      now: () => now,
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        status: 404,
        body: { error: { code: "NOT_FOUND_OR_FORBIDDEN" } },
      },
    });
    expect(repository.saved).toHaveLength(0);
  });
});

describe("draft revision update", () => {
  const initialDocument = {
    goal: {
      name: "Support Search",
      capabilities: ["search_content"],
    },
    configuration: {
      outputLimits: {
        maxResults: 10,
      },
    },
    draftNotes: "local note",
  };

  it("requires matching If-Match revision and returns the next ETag on success", async () => {
    const repository = new InMemoryDraftUpdateRepository(initialDocument);
    const result = await updateDraft({
      actorContext: actorContext(),
      scope,
      draftId: draftId(701),
      ifMatch: "rev-1",
      idempotencyKey: "idem_update_0001",
      request: {
        revision: 1,
        currentStep: "data",
        patch: {
          goal: {
            name: "Support Search v2",
          },
        },
      },
      repository,
      authorize: authorizeControlPlane,
      now: () => now,
    });

    expect(result.ok && result.value.body.etag).toBe("rev-2");
    expect(result.ok && result.value.body.draft.revision).toBe(2);
    expect(result.ok && result.value.body.draft.currentStep).toBe("data");
    expect(result.ok && result.value.body.invalidation).toEqual({
      previewConfirmationInvalidated: true,
      testConfirmationInvalidated: true,
      reasons: ["critical_field_changed:/goal/name"],
    });
    expect(repository.updateCount).toBe(1);
  });

  it("replays the same idempotent update without incrementing revision again", async () => {
    const repository = new InMemoryDraftUpdateRepository(initialDocument);
    const request = {
      revision: 1,
      patch: {
        draftNotes: "saved note",
      },
    };

    const first = await updateDraft({
      actorContext: actorContext(),
      scope,
      draftId: draftId(701),
      ifMatch: "rev-1",
      idempotencyKey: "idem_update_replay_0001",
      request,
      repository,
      authorize: authorizeControlPlane,
      now: () => now,
    });
    const second = await updateDraft({
      actorContext: actorContext(),
      scope,
      draftId: draftId(701),
      ifMatch: "rev-1",
      idempotencyKey: "idem_update_replay_0001",
      request,
      repository,
      authorize: authorizeControlPlane,
      now: () => now,
    });

    expect(first.ok && second.ok && first.value.body.draft.revision).toBe(2);
    expect(second.ok && second.value.body.draft.revision).toBe(2);
    expect(repository.updateCount).toBe(1);
    expect(second.ok && second.value.body.invalidation).toEqual({
      previewConfirmationInvalidated: false,
      testConfirmationInvalidated: false,
      reasons: [],
    });
  });

  it("allows only one concurrent update for the same revision and returns comparable conflict changes", async () => {
    const repository = new InMemoryDraftUpdateRepository(initialDocument);
    const first = await updateDraft({
      actorContext: actorContext(),
      scope,
      draftId: draftId(701),
      ifMatch: "rev-1",
      idempotencyKey: "idem_concurrent_a_0001",
      request: {
        revision: 1,
        patch: {
          goal: {
            name: "Server Winner",
          },
        },
      },
      repository,
      authorize: authorizeControlPlane,
      now: () => now,
    });
    const second = await updateDraft({
      actorContext: actorContext(),
      scope,
      draftId: draftId(701),
      ifMatch: "rev-1",
      idempotencyKey: "idem_concurrent_b_0001",
      request: {
        revision: 1,
        patch: {
          goal: {
            name: "Client Loser",
          },
        },
      },
      repository,
      authorize: authorizeControlPlane,
      now: () => now,
    });

    expect(first.ok && first.value.body.etag).toBe("rev-2");
    expect(second).toMatchObject({
      ok: false,
      error: {
        status: 412,
        body: {
          error: {
            code: "DEFINITION_INVALID_REQUEST",
            category: "DRAFT_CONFLICT",
            conflict: {
              kind: "DRAFT_CONFLICT",
              baseRevision: 1,
              serverRevision: 2,
              serverETag: "rev-2",
              overlapPaths: ["/goal/name"],
            },
          },
        },
      },
    });
    if (!second.ok && second.error.status === 412) {
      expect(second.error.body.error.conflict.clientChanges).toEqual([
        {
          path: "/goal/name",
          before: "Support Search",
          after: "Client Loser",
        },
      ]);
      expect(second.error.body.error.conflict.serverChanges).toEqual([
        {
          path: "/goal/name",
          before: "Support Search",
          after: "Server Winner",
        },
      ]);
    }
  });

  it("redacts sensitive values from conflict diffs", async () => {
    const repository = new InMemoryDraftUpdateRepository({
      configuration: {
        displayName: "safe",
        token: "old-secret",
      },
    });
    await updateDraft({
      actorContext: actorContext(),
      scope,
      draftId: draftId(701),
      ifMatch: "rev-1",
      idempotencyKey: "idem_secret_a_0001",
      request: {
        revision: 1,
        patch: {
          configuration: {
            displayName: "server",
          },
        },
      },
      repository,
      authorize: authorizeControlPlane,
      now: () => now,
    });
    repository.draft = {
      ...repository.draft,
      document: {
        ...(repository.draft.document as Record<string, unknown>),
        configuration: {
          displayName: "server",
          token: "server-secret",
        },
      },
    };

    const result = await updateDraft({
      actorContext: actorContext(),
      scope,
      draftId: draftId(701),
      ifMatch: "rev-1",
      idempotencyKey: "idem_secret_b_0001",
      request: {
        revision: 1,
        patch: {
          configuration: {
            displayName: "client",
          },
        },
      },
      repository,
      authorize: authorizeControlPlane,
      now: () => now,
    });

    expect(JSON.stringify(result)).not.toContain("server-secret");
    expect(JSON.stringify(result)).not.toContain("old-secret");
    expect(JSON.stringify(result)).toContain("[REDACTED]");
  });

  it("rejects missing or mismatched If-Match before repository writes", async () => {
    const repository = new InMemoryDraftUpdateRepository(initialDocument);
    const result = await updateDraft({
      actorContext: actorContext(),
      scope,
      draftId: draftId(701),
      ifMatch: "rev-2",
      idempotencyKey: "idem_bad_match_0001",
      request: {
        revision: 1,
        patch: { draftNotes: "ignored" },
      },
      repository,
      authorize: authorizeControlPlane,
      now: () => now,
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        status: 409,
        body: { error: { code: "DEFINITION_INVALID_REQUEST" } },
      },
    });
    expect(repository.updateCount).toBe(0);
  });
});

describe("createDraft", () => {
  it("creates isolated blank, template, and copied-version drafts", async () => {
    const repository = new InMemoryDraftRepository();
    repository.sources.set(sourceVersionId, {
      sourceVersionId,
      definitionId,
      definitionDigest: digest,
      definition: {
        goal: defaultGoal,
        modules: [{ moduleId: "capability.search-documents" }],
        dataBindings: [
          { dataVersionId: "dv_018f0000-0000-7000-8000-000000000301" },
        ],
        configuration: { maxResults: 5 },
        credentials: [{ secret: "do-not-copy" }],
        usage: { requests: 100 },
      },
    });
    const nextId = idFactory();

    const blank = await createDraft({
      actorContext: actorContext(),
      scope,
      idempotencyKey: "idem_blank_0001",
      request: {
        creationMode: "blank",
        name: "Blank Draft",
        goal: defaultGoal,
      },
      repository,
      authorize: authorizeControlPlane,
      newDraftId: nextId,
      now: () => now,
    });
    const template = await createDraft({
      actorContext: actorContext(),
      scope,
      idempotencyKey: "idem_template_0001",
      request: {
        creationMode: "template",
        templateId: "tpl_knowledge_search_v1",
        name: "Template Draft",
        platform: { protections: { writeActionsDisabled: false } },
      },
      repository,
      authorize: authorizeControlPlane,
      newDraftId: nextId,
      now: () => now,
    });
    const copied = await createDraft({
      actorContext: actorContext(),
      scope,
      idempotencyKey: "idem_copy_0001",
      request: {
        creationMode: "copy_version",
        sourceVersionId,
        name: "Copied Draft",
      },
      repository,
      authorize: authorizeControlPlane,
      newDraftId: nextId,
      now: () => now,
    });

    expect(blank.ok && blank.value.body.draftId).toBe(draftId(701));
    expect(template.ok && template.value.body.draftId).toBe(draftId(702));
    expect(copied.ok && copied.value.body.draftId).toBe(draftId(703));
    expect(new Set(repository.created.map((item) => item.draftId)).size).toBe(
      3,
    );
    expect(
      repository.created.map((item) => item.document.creationMode),
    ).toEqual(["blank", "template", "copy_version"]);

    const templateDocument = repository.created[1]?.document;
    expect(templateDocument?.platform.protections.writeActionsDisabled).toBe(
      true,
    );
    expect(templateDocument?.template?.expectedTools).toContain(
      "search_documents",
    );

    const copiedDocument = repository.created[2]?.document;
    expect(copiedDocument?.copy).toEqual({
      sourceVersionId,
      sourceDefinitionId: definitionId,
      sourceDefinitionDigest: digest,
    });
    expect(JSON.stringify(copiedDocument)).not.toContain("credentials");
    expect(JSON.stringify(copiedDocument)).not.toContain("usage");
    expect(JSON.stringify(copiedDocument)).not.toContain("do-not-copy");
  });

  it("replays repeated idempotent create requests without creating another draft", async () => {
    const repository = new InMemoryDraftRepository();
    const nextId = idFactory();
    const request = {
      creationMode: "blank",
      name: "Idempotent Draft",
      goal: defaultGoal,
    };

    const first = await createDraft({
      actorContext: actorContext(),
      scope,
      idempotencyKey: "idem_repeat_0001",
      request,
      repository,
      authorize: authorizeControlPlane,
      newDraftId: nextId,
      now: () => now,
    });
    const second = await createDraft({
      actorContext: actorContext(),
      scope,
      idempotencyKey: "idem_repeat_0001",
      request,
      repository,
      authorize: authorizeControlPlane,
      newDraftId: nextId,
      now: () => now,
    });

    expect(first.ok && first.value.replayed).toBe(false);
    expect(second.ok && second.value.replayed).toBe(true);
    expect(first.ok && second.ok && first.value.body).toEqual(
      second.ok && second.value.body,
    );
    expect(repository.created).toHaveLength(1);
  });

  it("fails closed before repository writes when project draft.edit is missing", async () => {
    const repository = new InMemoryDraftRepository();
    const result = await createDraft({
      actorContext: actorContext(false),
      scope,
      idempotencyKey: "idem_denied_0001",
      request: {
        creationMode: "blank",
        name: "Denied Draft",
      },
      repository,
      authorize: authorizeControlPlane,
      newDraftId: idFactory(),
      now: () => now,
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        status: 404,
        body: { error: { code: "NOT_FOUND_OR_FORBIDDEN" } },
      },
    });
    expect(repository.created).toHaveLength(0);
  });

  it("returns a conflict when the same idempotency key is reused with a different request", async () => {
    const repository = new InMemoryDraftRepository();
    const nextId = idFactory();
    await createDraft({
      actorContext: actorContext(),
      scope,
      idempotencyKey: "idem_conflict_0001",
      request: {
        creationMode: "blank",
        name: "Original Draft",
      },
      repository,
      authorize: authorizeControlPlane,
      newDraftId: nextId,
      now: () => now,
    });

    const result = await createDraft({
      actorContext: actorContext(),
      scope,
      idempotencyKey: "idem_conflict_0001",
      request: {
        creationMode: "blank",
        name: "Changed Draft",
      },
      repository,
      authorize: authorizeControlPlane,
      newDraftId: nextId,
      now: () => now,
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        status: 409,
        body: { error: { code: "DEFINITION_INVALID_REQUEST" } },
      },
    });
    expect(repository.created).toHaveLength(1);
  });
});

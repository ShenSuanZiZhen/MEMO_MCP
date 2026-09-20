import { describe, expect, it } from "vitest";
import {
  executeHighImpactAction,
  type AtomicHighImpactActionResult,
  type HighImpactActionAuditRecord,
  type HighImpactActionRepository,
  type StepUpIntentVerifier,
  type StepUpIntentVerifierResult,
} from "../../apps/control-api/src/index.js";
import {
  authorizeControlPlane,
  controlPlaneCapabilities,
  createDevelopmentIdentityProvider,
  createOidcActorAuthenticator,
  type ActorContext,
  type ActorMembershipRecord,
  type ControlPlaneAuthorizationScope,
  type ControlPlaneCapability,
  type HighImpactActionKind,
  type HighImpactActionTarget,
  type RbacRole,
  type StepUpIntentClaims,
} from "../../packages/authz/src/index.js";

const actorId = "usr_018f0000-0000-7000-8000-000000000101";
const otherActorId = "usr_018f0000-0000-7000-8000-000000000102";
const workspaceId = "ws_018f0000-0000-7000-8000-000000000001";
const otherWorkspaceId = "ws_018f0000-0000-7000-8000-000000000002";
const projectId = "prj_018f0000-0000-7000-8000-000000000201";
const otherProjectId = "prj_018f0000-0000-7000-8000-000000000202";
const scope = {
  kind: "project" as const,
  workspaceId,
  projectId,
  environment: "production" as const,
};
const workspaceScope = {
  kind: "workspace" as const,
  workspaceId,
};
const target: HighImpactActionTarget = {
  kind: "deployment",
  id: "dep_018f0000-0000-7000-8000-000000001601",
  revision: 7,
};
const token = "stepup-token-018f0000-0000-7000";
const now = new Date("2026-09-20T00:00:00.000Z");

const actionCases = [
  {
    action: "deployment.publish",
    target: {
      kind: "deployment",
      id: "dep_018f0000-0000-7000-8000-000000001601",
      revision: 7,
    },
    capability: controlPlaneCapabilities.deploymentPublish,
    allowedRoles: ["owner", "admin", "publisher"],
  },
  {
    action: "deployment.pause",
    target: {
      kind: "deployment",
      id: "dep_018f0000-0000-7000-8000-000000001601",
      revision: 7,
    },
    capability: controlPlaneCapabilities.deploymentPause,
    allowedRoles: ["owner", "admin", "publisher"],
  },
  {
    action: "credential.revoke",
    target: {
      kind: "credential",
      id: "cred_018f0000-0000-7000-8000-000000001803",
      revision: 3,
    },
    capability: controlPlaneCapabilities.credentialRevoke,
    allowedRoles: ["owner"],
  },
  {
    action: "service_version.retire",
    target: {
      kind: "service_version",
      id: "sv_018f0000-0000-7000-8000-000000001501",
      revision: 4,
    },
    capability: controlPlaneCapabilities.serviceVersionRetire,
    allowedRoles: ["owner"],
  },
  {
    action: "scope.expand.data",
    target: {
      kind: "data_scope",
      id: "dscope_018f0000-0000-7000-8000-000000001901",
      revision: 5,
    },
    capability: controlPlaneCapabilities.dataScopeExpand,
    allowedRoles: ["owner"],
  },
  {
    action: "scope.expand.output",
    target: {
      kind: "output_scope",
      id: "oscope_018f0000-0000-7000-8000-000000001902",
      revision: 6,
    },
    capability: controlPlaneCapabilities.outputScopeExpand,
    allowedRoles: ["owner"],
  },
] as const satisfies readonly {
  readonly action: HighImpactActionKind;
  readonly target: HighImpactActionTarget;
  readonly capability: ControlPlaneCapability;
  readonly allowedRoles: readonly RbacRole[];
}[];

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

function workspaceRecord(role: RbacRole) {
  return {
    actorId,
    workspaceId,
    roles: [role],
    capabilities: [],
  } satisfies ActorMembershipRecord;
}

function projectRecord(role: RbacRole) {
  return {
    actorId,
    workspaceId,
    projectId,
    environment: "production",
    roles: [role],
    capabilities: [],
  } satisfies ActorMembershipRecord;
}

async function actorContext(
  records: readonly ActorMembershipRecord[],
): Promise<ActorContext> {
  const provider = idp();
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
    provider.issueToken({ subject: "step-up-action@example.test" }),
  );
  if (!result.ok) {
    throw new Error(result.error.category);
  }
  return result.value;
}

function intent(
  overrides: Partial<StepUpIntentClaims> = {},
): StepUpIntentClaims {
  return {
    intentId: "intent-018f0000-0000-7000-8000-000000000001",
    actorId,
    action: "deployment.publish",
    scope,
    target,
    authenticatedAt: "2026-09-19T23:58:00.000Z",
    issuedAt: "2026-09-19T23:59:00.000Z",
    expiresAt: "2026-09-20T00:03:00.000Z",
    ...overrides,
  };
}

function verifier(claims: StepUpIntentClaims = intent()): StepUpIntentVerifier {
  return {
    async verifyStepUpIntentToken(value) {
      if (value !== token) {
        return { kind: "invalid" };
      }
      return { kind: "verified", claims };
    },
  };
}

function verifierResult(
  result: StepUpIntentVerifierResult | unknown,
): StepUpIntentVerifier {
  return {
    async verifyStepUpIntentToken() {
      return result;
    },
  };
}

function notFoundOrForbidden() {
  return {
    ok: false,
    error: {
      status: 404,
      body: {
        error: {
          code: "NOT_FOUND_OR_FORBIDDEN",
        },
      },
    },
  } as const;
}

function dependencyUnavailable() {
  return {
    ok: false,
    error: {
      status: 503,
      body: {
        error: {
          code: "DEPENDENCY_UNAVAILABLE",
          category: "identity_dependency_unavailable",
        },
      },
    },
  } as const;
}

class FakeHighImpactRepository implements HighImpactActionRepository {
  readonly consumed = new Set<string>();
  readonly targetRevisions = new Map<string, number>([[target.id, 7]]);
  readonly audits: HighImpactActionAuditRecord[] = [];
  authorizationChanged = false;
  expireInTransaction = false;
  failAction = false;
  failAudit = false;
  overrideResultRevision: number | undefined;
  observedInputs: Parameters<
    HighImpactActionRepository["executeHighImpactActionAndRecordAudit"]
  >[0][] = [];

  constructor() {
    for (const actionCase of actionCases) {
      this.targetRevisions.set(
        actionCase.target.id,
        actionCase.target.revision,
      );
    }
  }

  async executeHighImpactActionAndRecordAudit(
    input: Parameters<
      HighImpactActionRepository["executeHighImpactActionAndRecordAudit"]
    >[0],
  ): Promise<AtomicHighImpactActionResult> {
    this.observedInputs.push(input);
    if (this.expireInTransaction) {
      return { kind: "intent_expired" };
    }
    if (this.authorizationChanged) {
      return { kind: "authorization_changed" };
    }
    if (this.consumed.has(input.verifiedIntent.intentId)) {
      return { kind: "intent_replayed" };
    }
    const currentRevision = this.targetRevisions.get(input.target.id);
    if (currentRevision === undefined) {
      return { kind: "not_found_or_forbidden" };
    }
    if (currentRevision !== input.target.revision) {
      return { kind: "target_revision_conflict" };
    }
    if (this.failAction) {
      throw new Error("synthetic action failure with internals");
    }

    this.consumed.add(input.verifiedIntent.intentId);
    const nextRevision = currentRevision + 1;
    this.targetRevisions.set(input.target.id, nextRevision);
    const audit = {
      actorId: input.actorId,
      action: input.action,
      scope: input.scope,
      target: input.target,
      targetRevision: nextRevision,
      reason: input.reason,
      requestId: input.requestId,
      stepUpIntentId: input.verifiedIntent.intentId,
      occurredAt: input.occurredAt,
    };

    if (this.failAudit) {
      this.consumed.delete(input.verifiedIntent.intentId);
      this.targetRevisions.set(input.target.id, currentRevision);
      throw new Error("synthetic audit failure with internals");
    }

    this.audits.push(audit);
    return {
      kind: "executed",
      targetRevision: this.overrideResultRevision ?? nextRevision,
    };
  }
}

async function runAction(input: {
  readonly actorRole?: RbacRole;
  readonly projectRole?: RbacRole;
  readonly action?: HighImpactActionKind;
  readonly scope?: ControlPlaneAuthorizationScope;
  readonly target?: HighImpactActionTarget;
  readonly tokenValue?: unknown;
  readonly stepUpVerifier?: StepUpIntentVerifier;
  readonly repository?: HighImpactActionRepository;
  readonly authorize?: typeof authorizeControlPlane;
  readonly now?: () => Date;
}) {
  const context = await actorContext([
    workspaceRecord(input.actorRole ?? "owner"),
    projectRecord(input.projectRole ?? input.actorRole ?? "owner"),
  ]);
  const action = input.action ?? "deployment.publish";
  const targetValue = input.target ?? target;
  return executeHighImpactAction({
    actorContext: context,
    action,
    scope: input.scope ?? scope,
    target: targetValue,
    reason: "Promote reviewed production deployment.",
    requestId: "req-018f0000-0000-7000-8000-000000000901",
    stepUpToken: input.tokenValue ?? token,
    stepUpVerifier:
      input.stepUpVerifier ??
      verifier(
        intent({
          action,
          scope: input.scope ?? scope,
          target: targetValue,
        }),
      ),
    repository: input.repository ?? new FakeHighImpactRepository(),
    authorize: input.authorize ?? authorizeControlPlane,
    now: input.now ?? (() => now),
  });
}

describe("high-impact step-up action execution", () => {
  it("verifies an opaque step-up token before executing and ignores forged structured claims", async () => {
    const repository = new FakeHighImpactRepository();

    await expect(
      runAction({
        repository,
      }),
    ).resolves.toEqual({
      ok: true,
      value: {
        action: "deployment.publish",
        target,
        targetRevision: 8,
      },
    });

    expect(repository.audits).toEqual([
      {
        actorId,
        action: "deployment.publish",
        scope,
        target,
        targetRevision: 8,
        reason: "Promote reviewed production deployment.",
        requestId: "req-018f0000-0000-7000-8000-000000000901",
        stepUpIntentId: "intent-018f0000-0000-7000-8000-000000000001",
        occurredAt: "2026-09-20T00:00:00.000Z",
      },
    ]);
    expect(repository.observedInputs[0]).toMatchObject({
      verifiedIntent: {
        intentId: "intent-018f0000-0000-7000-8000-000000000001",
        expiresAt: "2026-09-20T00:03:00.000Z",
      },
      requiredCapability: controlPlaneCapabilities.deploymentPublish,
    });
    expect(JSON.stringify(repository.audits)).not.toContain(token);
    expect(JSON.stringify(repository.observedInputs)).not.toContain(token);

    await expect(
      executeHighImpactAction({
        actorContext: await actorContext([
          workspaceRecord("owner"),
          projectRecord("owner"),
        ]),
        action: "deployment.publish",
        scope,
        target,
        reason: "Forged claims without token.",
        requestId: "req-018f0000-0000-7000-8000-000000000902",
        stepUpToken: undefined,
        stepUpVerifier: verifier(intent()),
        repository: new FakeHighImpactRepository(),
        authorize: authorizeControlPlane,
        now: () => now,
        stepUpIntent: intent({ target: { ...target, revision: 999 } }),
      } as Parameters<typeof executeHighImpactAction>[0] & {
        readonly stepUpIntent: StepUpIntentClaims;
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        status: 403,
        body: {
          error: {
            code: "STEP_UP_REQUIRED",
            category: "missing_step_up_intent",
          },
        },
      },
    });
  });

  it("rejects malformed, unknown, forged, expired, and dependency-failed tokens without leaking internals", async () => {
    for (const tokenValue of ["short", "x".repeat(161), "unknown-token"]) {
      await expect(
        runAction({
          tokenValue,
        }),
      ).resolves.toMatchObject({
        ok: false,
        error: {
          status: 403,
          body: {
            error: {
              code: "STEP_UP_REQUIRED",
            },
          },
        },
      });
    }

    await expect(
      runAction({
        stepUpVerifier: verifierResult({ kind: "expired" }),
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        status: 403,
        body: {
          error: {
            code: "STEP_UP_REQUIRED",
            category: "step_up_intent_expired",
          },
        },
      },
    });
    await expect(
      runAction({
        stepUpVerifier: verifierResult({ kind: "dependency_unavailable" }),
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        status: 503,
        body: {
          error: {
            code: "DEPENDENCY_UNAVAILABLE",
          },
        },
      },
    });
    await expect(
      runAction({
        stepUpVerifier: {
          async verifyStepUpIntentToken() {
            throw new Error("raw verifier stack and factor details");
          },
        },
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        status: 503,
        body: {
          error: {
            code: "DEPENDENCY_UNAVAILABLE",
            category: "identity_dependency_unavailable",
          },
        },
      },
    });
  });

  it("treats malformed verifier results as dependency failures without calling the repository", async () => {
    const throwingScope = {
      kind: "project",
      get workspaceId() {
        throw new Error("raw nested scope getter secret");
      },
      projectId,
      environment: "production",
    };
    const throwingTarget = {
      kind: "deployment",
      id: target.id,
      get revision() {
        throw new Error("raw nested target getter secret");
      },
    };
    const throwingScopeProxy = new Proxy(
      {
        kind: "project",
        workspaceId,
        projectId,
        environment: "production",
      },
      {
        ownKeys() {
          throw new Error("raw nested scope proxy secret");
        },
      },
    );
    const malformedClaims = [
      {},
      { ...intent(), action: undefined },
      { ...intent(), scope: undefined },
      { ...intent(), target: undefined },
      { ...intent(), authenticatedAt: undefined },
      { ...intent(), issuedAt: undefined },
      { ...intent(), expiresAt: undefined },
      { ...intent(), scope: throwingScope },
      { ...intent(), scope: throwingScopeProxy },
      { ...intent(), target: throwingTarget },
    ];
    const malformedResults: readonly unknown[] = [
      undefined,
      null,
      {},
      [],
      "verified",
      { kind: "verified" },
      { kind: "verified", claims: null },
      { kind: "unknown" },
      { kind: "invalid", claims: intent() },
      {
        kind: "verified",
        claims: intent(),
        targetRevision: target.revision + 1,
      },
      {
        kind: "verified",
        claims: { ...intent(), factorSecret: "totp-secret-should-not-pass" },
      },
      ...malformedClaims.map((claims) => ({ kind: "verified", claims })),
      {
        get kind() {
          throw new Error("raw verifier getter secret");
        },
      },
      {
        kind: "verified",
        get claims() {
          throw new Error("raw claims getter secret");
        },
      },
    ];

    for (const result of malformedResults) {
      const repository = new FakeHighImpactRepository();
      await expect(
        runAction({
          repository,
          stepUpVerifier: verifierResult(result),
        }),
      ).resolves.toEqual({
        ok: false,
        error: {
          status: 503,
          body: {
            error: {
              code: "DEPENDENCY_UNAVAILABLE",
              category: "identity_dependency_unavailable",
            },
          },
        },
      });
      expect(repository.observedInputs).toEqual([]);
      expect(repository.audits).toEqual([]);
    }
  });

  it("rejects every actor, action, scope, environment, target kind, target id, and revision mismatch", async () => {
    const mismatches: readonly Partial<StepUpIntentClaims>[] = [
      { actorId: "usr_018f0000-0000-7000-8000-000000000102" },
      { action: "deployment.pause" },
      { scope: workspaceScope },
      {
        scope: {
          ...scope,
          environment: "test",
        },
      },
      {
        target: {
          ...target,
          kind: "credential",
        },
      },
      {
        target: {
          ...target,
          id: "dep_018f0000-0000-7000-8000-000000001602",
        },
      },
      {
        target: {
          ...target,
          revision: target.revision + 1,
        },
      },
    ];

    for (const mismatch of mismatches) {
      await expect(
        runAction({
          stepUpVerifier: verifier(intent(mismatch)),
        }),
      ).resolves.toMatchObject({
        ok: false,
        error: {
          status: 403,
          body: {
            error: {
              code: "STEP_UP_REQUIRED",
              category: "invalid_step_up_intent",
            },
          },
        },
      });
    }
  });

  it("rejects cross-project and cross-environment intents without repository side effects", async () => {
    const mismatchedScopes: readonly ControlPlaneAuthorizationScope[] = [
      {
        ...scope,
        projectId: "prj_018f0000-0000-7000-8000-000000000202",
      },
      {
        ...scope,
        environment: "test",
      },
    ];

    for (const mismatchedScope of mismatchedScopes) {
      const repository = new FakeHighImpactRepository();
      let verifierCalls = 0;
      await expect(
        runAction({
          repository,
          stepUpVerifier: {
            async verifyStepUpIntentToken() {
              verifierCalls += 1;
              return {
                kind: "verified",
                claims: intent({ scope: mismatchedScope }),
              };
            },
          },
        }),
      ).resolves.toMatchObject({
        ok: false,
        error: {
          status: 403,
          body: {
            error: {
              category: "invalid_step_up_intent",
            },
          },
        },
      });
      expect(verifierCalls).toBe(1);
      expect(repository.observedInputs).toEqual([]);
      expect(repository.audits).toEqual([]);
    }
  });

  it("handles transaction-time expiry, authorization revocation, action failure, audit failure, replay, and revision drift atomically", async () => {
    const expires = new FakeHighImpactRepository();
    expires.expireInTransaction = true;
    await expect(runAction({ repository: expires })).resolves.toMatchObject({
      ok: false,
      error: {
        status: 403,
        body: {
          error: {
            category: "step_up_intent_expired",
          },
        },
      },
    });

    const revoked = new FakeHighImpactRepository();
    revoked.authorizationChanged = true;
    await expect(runAction({ repository: revoked })).resolves.toEqual(
      notFoundOrForbidden(),
    );

    const actionFailure = new FakeHighImpactRepository();
    actionFailure.failAction = true;
    await expect(runAction({ repository: actionFailure })).resolves.toEqual({
      ok: false,
      error: {
        status: 503,
        body: {
          error: {
            code: "DEPENDENCY_UNAVAILABLE",
            category: "identity_dependency_unavailable",
          },
        },
      },
    });
    expect(actionFailure.consumed.size).toBe(0);
    expect(actionFailure.audits).toEqual([]);
    actionFailure.failAction = false;
    await expect(
      runAction({ repository: actionFailure }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        targetRevision: target.revision + 1,
      },
    });

    const auditFailure = new FakeHighImpactRepository();
    auditFailure.failAudit = true;
    await expect(
      runAction({ repository: auditFailure }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        status: 503,
      },
    });
    expect(auditFailure.consumed.size).toBe(0);
    expect(auditFailure.targetRevisions.get(target.id)).toBe(target.revision);
    expect(auditFailure.audits).toEqual([]);
    auditFailure.failAudit = false;
    await expect(
      runAction({ repository: auditFailure }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        targetRevision: target.revision + 1,
      },
    });

    const replay = new FakeHighImpactRepository();
    replay.consumed.add("intent-018f0000-0000-7000-8000-000000000001");
    await expect(runAction({ repository: replay })).resolves.toMatchObject({
      ok: false,
      error: {
        status: 403,
        body: {
          error: {
            category: "step_up_intent_replayed",
          },
        },
      },
    });

    const drift = new FakeHighImpactRepository();
    drift.targetRevisions.set(target.id, target.revision + 1);
    await expect(runAction({ repository: drift })).resolves.toEqual(
      notFoundOrForbidden(),
    );
    expect(drift.consumed.size).toBe(0);
    expect(drift.audits).toEqual([]);
  });

  it("allows only explicitly authorized roles for every high-impact action in project scope", async () => {
    const roles: readonly RbacRole[] = [
      "owner",
      "admin",
      "editor",
      "publisher",
      "reviewer",
      "observer",
      "operator",
    ];

    for (const actionCase of actionCases) {
      for (const role of roles) {
        const result = await runAction({
          actorRole: role,
          projectRole: role,
          action: actionCase.action,
          scope,
          target: actionCase.target,
        });
        expect({
          action: actionCase.action,
          capability: actionCase.capability,
          scopeKind: scope.kind,
          role,
          ok: result.ok,
        }).toEqual({
          action: actionCase.action,
          capability: actionCase.capability,
          scopeKind: "project",
          role,
          ok: actionCase.allowedRoles.includes(role),
        });
      }
    }

    await expect(
      runAction({
        actorRole: "owner",
        projectRole: "observer",
      }),
    ).resolves.toEqual(notFoundOrForbidden());
  });

  it("rejects workspace-only scope for every high-impact action before verifier or repository calls", async () => {
    for (const actionCase of actionCases) {
      const repository = new FakeHighImpactRepository();
      let verifierCalls = 0;
      const countingVerifier: StepUpIntentVerifier = {
        async verifyStepUpIntentToken() {
          verifierCalls += 1;
          return {
            kind: "verified",
            claims: intent({
              action: actionCase.action,
              scope: workspaceScope,
              target: actionCase.target,
            }),
          };
        },
      };

      await expect(
        runAction({
          actorRole: "owner",
          projectRole: "owner",
          action: actionCase.action,
          scope: workspaceScope,
          target: actionCase.target,
          repository,
          stepUpVerifier: countingVerifier,
        }),
      ).resolves.toEqual(notFoundOrForbidden());
      expect(verifierCalls).toBe(0);
      expect(repository.observedInputs).toEqual([]);
      expect(repository.audits).toEqual([]);
    }
  });

  it("rejects unknown action, missing scope, wrong target kind, and invalid repository revisions", async () => {
    await expect(
      executeHighImpactAction({
        actorContext: await actorContext([
          workspaceRecord("owner"),
          projectRecord("owner"),
        ]),
        action: "service.delete",
        scope,
        target,
        reason: "Unknown action.",
        requestId: "req-018f0000-0000-7000-8000-000000000903",
        stepUpToken: token,
        stepUpVerifier: verifier(intent()),
        repository: new FakeHighImpactRepository(),
        authorize: authorizeControlPlane,
        now: () => now,
      }),
    ).resolves.toEqual(notFoundOrForbidden());
    await expect(
      executeHighImpactAction({
        actorContext: await actorContext([
          workspaceRecord("owner"),
          projectRecord("owner"),
        ]),
        action: "deployment.publish",
        scope: undefined,
        target,
        reason: "Missing scope.",
        requestId: "req-018f0000-0000-7000-8000-000000000904",
        stepUpToken: token,
        stepUpVerifier: verifier(intent()),
        repository: new FakeHighImpactRepository(),
        authorize: authorizeControlPlane,
        now: () => now,
      }),
    ).resolves.toEqual(notFoundOrForbidden());
    await expect(
      runAction({
        target: {
          kind: "credential",
          id: target.id,
          revision: target.revision,
        },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        status: 403,
        body: {
          error: {
            category: "invalid_step_up_intent",
          },
        },
      },
    });

    for (const overrideResultRevision of [
      target.revision,
      target.revision + 2,
      -1,
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      const repository = new FakeHighImpactRepository();
      repository.overrideResultRevision = overrideResultRevision;
      await expect(runAction({ repository })).resolves.toEqual({
        ok: false,
        error: {
          status: 503,
          body: {
            error: {
              code: "DEPENDENCY_UNAVAILABLE",
              category: "identity_dependency_unavailable",
            },
          },
        },
      });
    }

    await expect(
      runAction({
        target: {
          ...target,
          revision: Number.MAX_SAFE_INTEGER,
        },
      }),
    ).resolves.toEqual(notFoundOrForbidden());
  });

  it("fails closed when the clock or authorizer throws or returns malformed decisions", async () => {
    const invalidClockRepository = new FakeHighImpactRepository();
    await expect(
      runAction({
        repository: invalidClockRepository,
        now: () => {
          throw new Error("raw clock stack");
        },
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        status: 503,
        body: {
          error: {
            code: "DEPENDENCY_UNAVAILABLE",
            category: "identity_dependency_unavailable",
          },
        },
      },
    });
    expect(invalidClockRepository.observedInputs).toEqual([]);

    const invalidDateRepository = new FakeHighImpactRepository();
    await expect(
      runAction({
        repository: invalidDateRepository,
        now: () => new Date("not-a-date"),
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        status: 503,
      },
    });
    expect(invalidDateRepository.observedInputs).toEqual([]);

    const malformedAuthorizers: readonly unknown[] = [
      () => {
        throw new Error("raw authorizer sql and stack");
      },
      () => undefined,
      () => null,
      () => ({}),
      () => [],
      () => ({ allow: true }),
      () => ({ allow: true, actorId, scope }),
      () => ({ allow: "yes" }),
      () => ({ allow: false, reason: "sql says no" }),
      () => ({
        allow: false,
        reason: "not_found_or_forbidden",
        sql: "select secret",
      }),
      () => ({
        get allow() {
          throw new Error("raw allow getter secret");
        },
      }),
    ];

    for (const authorize of malformedAuthorizers) {
      const repository = new FakeHighImpactRepository();
      await expect(
        runAction({
          repository,
          authorize: authorize as typeof authorizeControlPlane,
        }),
      ).resolves.toEqual({
        ok: false,
        error: {
          status: 503,
          body: {
            error: {
              code: "DEPENDENCY_UNAVAILABLE",
              category: "identity_dependency_unavailable",
            },
          },
        },
      });
      expect(repository.observedInputs).toEqual([]);
      expect(repository.audits).toEqual([]);
    }
  });

  it("rejects allow decisions that are not exactly bound to the verified actor, project scope, and capability", async () => {
    const throwingScopeGetter = {
      allow: true,
      actorId,
      get scope() {
        throw new Error("raw scope getter secret");
      },
      capability: controlPlaneCapabilities.deploymentPublish,
    };
    const throwingCapabilityGetter = {
      allow: true,
      actorId,
      scope,
      get capability() {
        throw new Error("raw capability getter secret");
      },
    };
    const throwingActorGetter = {
      allow: true,
      get actorId() {
        throw new Error("raw actor getter secret");
      },
      scope,
      capability: controlPlaneCapabilities.deploymentPublish,
    };
    const nestedScopeGetter = {
      allow: true,
      actorId,
      scope: {
        kind: "project",
        get workspaceId() {
          throw new Error("raw nested workspace getter secret");
        },
        projectId,
        environment: "production",
      },
      capability: controlPlaneCapabilities.deploymentPublish,
    };
    const nestedScopeProxy = {
      allow: true,
      actorId,
      scope: new Proxy(
        {
          kind: "project",
          workspaceId,
          projectId,
          environment: "production",
        },
        {
          ownKeys() {
            throw new Error("raw nested scope proxy secret");
          },
        },
      ),
      capability: controlPlaneCapabilities.deploymentPublish,
    };
    const invalidDecisions: readonly unknown[] = [
      {
        allow: true,
        actorId: otherActorId,
        scope,
        capability: controlPlaneCapabilities.deploymentPublish,
      },
      {
        allow: true,
        actorId,
        scope: { ...scope, workspaceId: otherWorkspaceId },
        capability: controlPlaneCapabilities.deploymentPublish,
      },
      {
        allow: true,
        actorId,
        scope: { ...scope, projectId: otherProjectId },
        capability: controlPlaneCapabilities.deploymentPublish,
      },
      {
        allow: true,
        actorId,
        scope: { ...scope, environment: "test" },
        capability: controlPlaneCapabilities.deploymentPublish,
      },
      {
        allow: true,
        actorId,
        scope: workspaceScope,
        capability: controlPlaneCapabilities.deploymentPublish,
      },
      {
        allow: true,
        actorId,
        scope,
        capability: controlPlaneCapabilities.deploymentPause,
      },
      {
        allow: true,
        actorId,
        scope,
        capability: controlPlaneCapabilities.projectRead,
      },
      {
        allow: true,
        actorId,
        scope,
        capability: "credential.super_revoke",
      },
      {
        allow: true,
        scope,
        capability: controlPlaneCapabilities.deploymentPublish,
      },
      {
        allow: true,
        actorId,
        capability: controlPlaneCapabilities.deploymentPublish,
      },
      { allow: true, actorId, scope },
      {
        allow: true,
        actorId,
        scope,
        capability: controlPlaneCapabilities.deploymentPublish,
        rawSql: "select token from secrets",
      },
      {
        allow: true,
        actorId,
        scope: {
          ...scope,
          factorSecret: "totp-secret-should-not-pass",
        },
        capability: controlPlaneCapabilities.deploymentPublish,
      },
      throwingScopeGetter,
      throwingCapabilityGetter,
      throwingActorGetter,
      nestedScopeGetter,
      nestedScopeProxy,
    ];

    for (const decision of invalidDecisions) {
      const repository = new FakeHighImpactRepository();
      await expect(
        runAction({
          repository,
          authorize: (() => decision) as typeof authorizeControlPlane,
        }),
      ).resolves.toEqual(dependencyUnavailable());
      expect(repository.observedInputs).toEqual([]);
      expect(repository.audits).toEqual([]);
    }

    for (const capability of [
      controlPlaneCapabilities.deploymentPause,
      controlPlaneCapabilities.projectRead,
    ]) {
      const repository = new FakeHighImpactRepository();
      await expect(
        runAction({
          action: "credential.revoke",
          target: actionCases[2].target,
          repository,
          authorize: (() => ({
            allow: true,
            actorId,
            scope,
            capability,
          })) as typeof authorizeControlPlane,
        }),
      ).resolves.toEqual(dependencyUnavailable());
      expect(repository.observedInputs).toEqual([]);
      expect(repository.audits).toEqual([]);
    }
  });

  it("does not execute when a structurally valid authorizer allow result binds to the wrong actor, project, and capability", async () => {
    const repository = new FakeHighImpactRepository();

    await expect(
      runAction({
        repository,
        authorize: (() => ({
          allow: true,
          actorId: otherActorId,
          scope: {
            ...scope,
            projectId: otherProjectId,
          },
          capability: controlPlaneCapabilities.projectRead,
        })) as typeof authorizeControlPlane,
      }),
    ).resolves.toEqual(dependencyUnavailable());
    expect(repository.observedInputs).toEqual([]);
    expect(repository.audits).toEqual([]);
  });

  it("treats malformed repository results as dependency failures and never as success", async () => {
    const malformedResults: readonly unknown[] = [
      null,
      undefined,
      {},
      [],
      { targetRevision: target.revision + 1 },
      { kind: "unknown", targetRevision: target.revision + 1 },
      { kind: "executed" },
      { kind: "executed", targetRevision: target.revision },
      { kind: "executed", targetRevision: target.revision + 2 },
      { kind: "executed", targetRevision: 1.5 },
      { kind: "executed", targetRevision: -1 },
      { kind: "executed", targetRevision: Number.POSITIVE_INFINITY },
      { kind: "executed", targetRevision: Number.NaN },
      { kind: "executed", targetRevision: Number.MAX_SAFE_INTEGER + 1 },
    ];

    for (const malformedResult of malformedResults) {
      const repository = new FakeHighImpactRepository();
      const malformedRepository: HighImpactActionRepository = {
        async executeHighImpactActionAndRecordAudit(input) {
          repository.observedInputs.push(input);
          return malformedResult as AtomicHighImpactActionResult;
        },
      };

      await expect(
        runAction({ repository: malformedRepository }),
      ).resolves.toEqual({
        ok: false,
        error: {
          status: 503,
          body: {
            error: {
              code: "DEPENDENCY_UNAVAILABLE",
              category: "identity_dependency_unavailable",
            },
          },
        },
      });
      expect(repository.observedInputs).toHaveLength(1);
      expect(repository.audits).toEqual([]);
    }
  });

  it("consumes the same verified intent exactly once under concurrent execution", async () => {
    const repository = new FakeHighImpactRepository();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => runAction({ repository })),
    );

    const successes = results.filter((result) => result.ok);
    const replayed = results.filter(
      (result) =>
        !result.ok &&
        result.error.status === 403 &&
        result.error.body.error.category === "step_up_intent_replayed",
    );

    expect(successes).toHaveLength(1);
    expect(replayed).toHaveLength(19);
    expect(repository.targetRevisions.get(target.id)).toBe(target.revision + 1);
    expect(repository.audits).toHaveLength(1);
    expect(repository.consumed.size).toBe(1);
    expect([...repository.consumed]).toEqual([
      "intent-018f0000-0000-7000-8000-000000000001",
    ]);
  });

  it("uses frozen verifier claims so nested scope and target cannot be mutated after verification", async () => {
    class MutatingRepository extends FakeHighImpactRepository {
      override async executeHighImpactActionAndRecordAudit(
        input: Parameters<
          HighImpactActionRepository["executeHighImpactActionAndRecordAudit"]
        >[0],
      ): Promise<AtomicHighImpactActionResult> {
        expect(Object.isFrozen(input.target)).toBe(true);
        expect(Object.isFrozen(input.scope)).toBe(true);
        expect(Object.isFrozen(input.authorization)).toBe(true);
        expect(Object.isFrozen(input.authorization.scope)).toBe(true);
        expect(input.authorization).toEqual({
          actorId,
          scope,
          capability: controlPlaneCapabilities.deploymentPublish,
        });
        expect(() => {
          (input.target as { revision: number }).revision = 999;
        }).toThrow();
        if (input.scope.kind === "project") {
          expect(() => {
            (input.scope as { environment: string }).environment = "test";
          }).toThrow();
        }
        expect(() => {
          (input.authorization as { actorId: string }).actorId = otherActorId;
        }).toThrow();
        expect(() => {
          (input.authorization as { capability: string }).capability =
            controlPlaneCapabilities.projectRead;
        }).toThrow();
        expect(() => {
          (input.authorization.scope as { projectId: string }).projectId =
            otherProjectId;
        }).toThrow();
        return super.executeHighImpactActionAndRecordAudit(input);
      }
    }
    const mutableTarget = { ...target };
    const mutableScope = { ...scope };
    const claims = intent({ scope: mutableScope, target: mutableTarget });
    const repository = new MutatingRepository();

    await expect(
      runAction({
        repository,
        stepUpVerifier: verifier(claims),
      }),
    ).resolves.toMatchObject({ ok: true });
    mutableTarget.revision = 999;
    mutableScope.environment = "test";
    expect(repository.observedInputs[0]?.target.revision).toBe(target.revision);
    expect(repository.observedInputs[0]?.scope).toEqual(scope);
  });
});

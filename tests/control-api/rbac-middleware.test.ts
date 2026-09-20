import { describe, expect, it } from "vitest";
import {
  changeMemberRole,
  createControlApiAuthorizationMiddleware,
  type MemberRoleChangeScope,
  type MemberRoleChangeRepository,
} from "../../apps/control-api/src/index.js";
import {
  authorizeControlPlane,
  authorizeControlPlaneRoleGrant,
  controlPlaneCapabilities,
  createDevelopmentIdentityProvider,
  createOidcActorAuthenticator,
  rbacRoles,
  type ActorContext,
  type ActorMembershipRecord,
  type ControlPlaneAuthorizationScope,
  type RbacRole,
} from "../../packages/authz/src/index.js";

const actorAId = "usr_018f0000-0000-7000-8000-000000000101";
const actorBId = "usr_018f0000-0000-7000-8000-000000000102";
const missingActorId = "usr_018f0000-0000-7000-8000-000000000199";
const workspaceId = "ws_018f0000-0000-7000-8000-000000000001";
const otherWorkspaceId = "ws_018f0000-0000-7000-8000-000000000002";
const projectId = "prj_018f0000-0000-7000-8000-000000000201";
const otherProjectId = "prj_018f0000-0000-7000-8000-000000000202";
const subject = "person@example.com";
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

function workspaceRecord(
  actorId: string,
  role: RbacRole,
  workspace = workspaceId,
): ActorMembershipRecord {
  return {
    actorId,
    workspaceId: workspace,
    roles: [role],
    capabilities: [],
  };
}

function projectRecord(
  actorId: string,
  role: RbacRole,
  workspace = workspaceId,
  project = projectId,
): ActorMembershipRecord {
  return {
    actorId,
    workspaceId: workspace,
    projectId: project,
    environment: "development",
    roles: [role],
    capabilities: [],
  };
}

async function actorContext(
  actorId: string,
  records: () => readonly ActorMembershipRecord[],
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
        return records();
      },
    },
  );
  const result = await authenticator.authenticateBearerToken(
    provider.issueToken({ subject: `${actorId}@example.test` }),
  );
  if (!result.ok) {
    throw new Error(result.error.category);
  }
  return result.value;
}

function expectedRoleGrant(
  callerRole: RbacRole,
  previousRole: RbacRole,
  nextRole: RbacRole,
): boolean {
  if (callerRole === "owner") {
    return true;
  }
  if (callerRole === "admin") {
    return previousRole !== "owner" && nextRole !== "owner";
  }
  return false;
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

class AtomicMemberRoleRepository implements MemberRoleChangeRepository {
  readonly workspaceRoles = new Map<string, RbacRole>();
  readonly projectRoles = new Map<string, RbacRole>();
  readonly audits: unknown[] = [];
  writeFailure = false;
  auditFailure = false;
  lastOwnerConflict = false;
  overrideChangedResult:
    | {
        readonly previousRole: unknown;
        readonly nextRole: unknown;
        readonly revision: unknown;
      }
    | undefined;

  constructor() {
    this.workspaceRoles.set(actorAId, "owner");
    this.workspaceRoles.set(actorBId, "editor");
    this.projectRoles.set(actorBId, "editor");
  }

  async changeMemberRoleAndRecordAudit(input: {
    readonly actorId: string;
    readonly targetActorId: string;
    readonly scope: MemberRoleChangeScope;
    readonly nextRole: RbacRole;
    readonly authorization: {
      readonly actorId: string;
      readonly scope: MemberRoleChangeScope;
      readonly nextRole: RbacRole;
      readonly manageExistingOwner: boolean;
    };
    readonly occurredAt: string;
  }) {
    const roles =
      input.scope.kind === "workspace"
        ? this.workspaceRoles
        : this.projectRoles;
    if (this.writeFailure || !roles.has(input.targetActorId)) {
      return { kind: "not_found_or_forbidden" as const };
    }
    if (this.lastOwnerConflict) {
      return { kind: "last_owner_conflict" as const };
    }

    const previousRole = roles.get(input.targetActorId);
    if (!previousRole) {
      return { kind: "not_found_or_forbidden" as const };
    }
    if (
      input.authorization.actorId !== input.actorId ||
      input.authorization.nextRole !== input.nextRole
    ) {
      return { kind: "not_found_or_forbidden" as const };
    }
    if (
      (previousRole === "owner" || input.nextRole === "owner") &&
      !input.authorization.manageExistingOwner
    ) {
      return { kind: "not_found_or_forbidden" as const };
    }
    if (this.overrideChangedResult) {
      return {
        kind: "changed" as const,
        previousRole: this.overrideChangedResult.previousRole as RbacRole,
        nextRole: this.overrideChangedResult.nextRole as RbacRole,
        revision: this.overrideChangedResult.revision as number,
      };
    }

    roles.set(input.targetActorId, input.nextRole);
    const audit = {
      actorId: input.actorId,
      targetActorId: input.targetActorId,
      scope: input.scope,
      previousRole,
      nextRole: input.nextRole,
      revision: 2,
      occurredAt: input.occurredAt,
    };

    if (this.auditFailure) {
      roles.set(input.targetActorId, previousRole);
      throw new Error("audit insert failed with database internals");
    }

    this.audits.push(audit);
    return {
      kind: "changed" as const,
      previousRole,
      nextRole: input.nextRole,
      revision: 2,
    };
  }
}

describe("control-api authorization middleware", () => {
  it("fails startup when an endpoint does not declare a capability", () => {
    expect(() =>
      createControlApiAuthorizationMiddleware(
        [{ id: "GET /v1/workspaces/:workspaceId" }],
        authorizeControlPlane,
      ),
    ).toThrow(
      "control-api endpoint GET /v1/workspaces/:workspaceId is missing capability",
    );
  });

  it("authorizes declared endpoint capabilities and denies by default for unknown endpoints", async () => {
    const context = await actorContext(actorAId, () => [
      workspaceRecord(actorAId, "observer"),
    ]);
    const authorize = createControlApiAuthorizationMiddleware(
      [
        {
          id: "GET /v1/workspaces/:workspaceId",
          capability: controlPlaneCapabilities.workspaceRead,
        },
      ],
      authorizeControlPlane,
    );

    expect(
      authorize({
        actorContext: context,
        endpointId: "GET /v1/workspaces/:workspaceId",
        scope: { kind: "workspace", workspaceId },
      }),
    ).toMatchObject({
      ok: true,
      value: {
        endpointId: "GET /v1/workspaces/:workspaceId",
        capability: controlPlaneCapabilities.workspaceRead,
      },
    });
    expect(
      authorize({
        actorContext: context,
        endpointId: "POST /v1/workspaces/:workspaceId/members",
        scope: { kind: "workspace", workspaceId },
      }),
    ).toEqual(notFoundOrForbidden());
  });

  it("returns identical denials for forbidden and missing same-name workspace resources", async () => {
    const context = await actorContext(actorAId, () => [
      workspaceRecord(actorAId, "observer"),
    ]);
    const authorize = createControlApiAuthorizationMiddleware(
      [
        {
          id: "POST /v1/workspaces/:workspaceId/members",
          capability: controlPlaneCapabilities.workspaceMemberManage,
        },
      ],
      authorizeControlPlane,
    );

    const forbidden = authorize({
      actorContext: context,
      endpointId: "POST /v1/workspaces/:workspaceId/members",
      scope: { kind: "workspace", workspaceId },
    });
    const missing = authorize({
      actorContext: context,
      endpointId: "POST /v1/workspaces/:workspaceId/members",
      scope: { kind: "workspace", workspaceId: otherWorkspaceId },
    });

    expect(forbidden).toEqual(notFoundOrForbidden());
    expect(missing).toEqual(forbidden);
  });
});

describe("member role grant policy", () => {
  it("applies the explicit caller-role by previous-role by next-role grant matrix for workspace and project scopes", async () => {
    const contexts = new Map<string, ActorContext>();
    async function callerContext(
      scopeKind: "workspace" | "project",
      callerRole: RbacRole,
    ) {
      const key = `${scopeKind}:${callerRole}`;
      const cached = contexts.get(key);
      if (cached) {
        return cached;
      }
      const context = await actorContext(actorAId, () =>
        scopeKind === "workspace"
          ? [workspaceRecord(actorAId, callerRole)]
          : [
              workspaceRecord(actorAId, "owner"),
              projectRecord(actorAId, callerRole),
            ],
      );
      contexts.set(key, context);
      return context;
    }

    for (const scopeKind of ["workspace", "project"] as const) {
      for (const callerRole of rbacRoles) {
        const context = await callerContext(scopeKind, callerRole);
        for (const previousRole of rbacRoles) {
          for (const nextRole of rbacRoles) {
            const repository = new AtomicMemberRoleRepository();
            const roles =
              scopeKind === "workspace"
                ? repository.workspaceRoles
                : repository.projectRoles;
            roles.set(actorBId, previousRole);

            const result = await changeMemberRole({
              actorContext: context,
              scope:
                scopeKind === "workspace"
                  ? { kind: "workspace", workspaceId }
                  : {
                      kind: "project",
                      workspaceId,
                      projectId,
                      environment: "development",
                    },
              targetActorId: actorBId,
              nextRole,
              repository,
              authorizeRoleGrant: authorizeControlPlaneRoleGrant,
              now: () => new Date("2026-09-18T00:00:00.000Z"),
            });

            expect({
              scopeKind,
              callerRole,
              previousRole,
              nextRole,
              ok: result.ok,
            }).toEqual({
              scopeKind,
              callerRole,
              previousRole,
              nextRole,
              ok: expectedRoleGrant(callerRole, previousRole, nextRole),
            });
            if (!result.ok) {
              expect(result).toEqual(notFoundOrForbidden());
            }
          }
        }
      }
    }
  });

  it("enforces owner-management rules in workspace and project scopes", async () => {
    for (const scopeKind of ["workspace", "project"] as const) {
      const scope: ControlPlaneAuthorizationScope =
        scopeKind === "workspace"
          ? { kind: "workspace", workspaceId }
          : {
              kind: "project",
              workspaceId,
              projectId,
              environment: "development",
            };
      const admin = await actorContext(actorAId, () =>
        scopeKind === "workspace"
          ? [workspaceRecord(actorAId, "admin")]
          : [
              workspaceRecord(actorAId, "owner"),
              projectRecord(actorAId, "admin"),
            ],
      );
      const owner = await actorContext(actorAId, () =>
        scopeKind === "workspace"
          ? [workspaceRecord(actorAId, "owner")]
          : [
              workspaceRecord(actorAId, "owner"),
              projectRecord(actorAId, "owner"),
            ],
      );

      const ordinaryRepository = new AtomicMemberRoleRepository();
      const ordinaryRoles =
        scopeKind === "workspace"
          ? ordinaryRepository.workspaceRoles
          : ordinaryRepository.projectRoles;
      ordinaryRoles.set(actorBId, "editor");
      await expect(
        changeMemberRole({
          actorContext: admin,
          scope,
          targetActorId: actorBId,
          nextRole: "observer",
          repository: ordinaryRepository,
          authorizeRoleGrant: authorizeControlPlaneRoleGrant,
        }),
      ).resolves.toMatchObject({ ok: true });
      expect(ordinaryRoles.get(actorBId)).toBe("observer");

      for (const nextRole of ["observer", "admin"] as const) {
        const ownerTargetRepository = new AtomicMemberRoleRepository();
        const targetRoles =
          scopeKind === "workspace"
            ? ownerTargetRepository.workspaceRoles
            : ownerTargetRepository.projectRoles;
        targetRoles.set(actorBId, "owner");

        await expect(
          changeMemberRole({
            actorContext: admin,
            scope,
            targetActorId: actorBId,
            nextRole,
            repository: ownerTargetRepository,
            authorizeRoleGrant: authorizeControlPlaneRoleGrant,
          }),
        ).resolves.toEqual(notFoundOrForbidden());
        expect(targetRoles.get(actorBId)).toBe("owner");
        expect(ownerTargetRepository.audits).toEqual([]);
      }

      const nonLastOwnerRepository = new AtomicMemberRoleRepository();
      const nonLastOwnerRoles =
        scopeKind === "workspace"
          ? nonLastOwnerRepository.workspaceRoles
          : nonLastOwnerRepository.projectRoles;
      nonLastOwnerRoles.set(actorBId, "owner");
      await expect(
        changeMemberRole({
          actorContext: owner,
          scope,
          targetActorId: actorBId,
          nextRole: "admin",
          repository: nonLastOwnerRepository,
          authorizeRoleGrant: authorizeControlPlaneRoleGrant,
        }),
      ).resolves.toMatchObject({
        ok: true,
        value: {
          previousRole: "owner",
          nextRole: "admin",
        },
      });
      expect(nonLastOwnerRoles.get(actorBId)).toBe("admin");
      expect(nonLastOwnerRepository.audits).toHaveLength(1);

      const lastOwnerRepository = new AtomicMemberRoleRepository();
      lastOwnerRepository.lastOwnerConflict = true;
      const lastOwnerRoles =
        scopeKind === "workspace"
          ? lastOwnerRepository.workspaceRoles
          : lastOwnerRepository.projectRoles;
      lastOwnerRoles.set(actorBId, "owner");
      await expect(
        changeMemberRole({
          actorContext: owner,
          scope,
          targetActorId: actorBId,
          nextRole: "admin",
          repository: lastOwnerRepository,
          authorizeRoleGrant: authorizeControlPlaneRoleGrant,
        }),
      ).resolves.toEqual(notFoundOrForbidden());
      expect(lastOwnerRoles.get(actorBId)).toBe("owner");
      expect(lastOwnerRepository.audits).toEqual([]);
    }
  });

  it("covers specific role grant paths and self-escalation denial", async () => {
    const owner = await actorContext(actorAId, () => [
      workspaceRecord(actorAId, "owner"),
    ]);
    const admin = await actorContext(actorAId, () => [
      workspaceRecord(actorAId, "admin"),
    ]);
    const editor = await actorContext(actorAId, () => [
      workspaceRecord(actorAId, "editor"),
    ]);

    await expect(
      changeMemberRole({
        actorContext: owner,
        scope: { kind: "workspace", workspaceId },
        targetActorId: actorBId,
        nextRole: "admin",
        repository: new AtomicMemberRoleRepository(),
        authorizeRoleGrant: authorizeControlPlaneRoleGrant,
      }),
    ).resolves.toMatchObject({ ok: true });

    await expect(
      changeMemberRole({
        actorContext: admin,
        scope: { kind: "workspace", workspaceId },
        targetActorId: actorBId,
        nextRole: "owner",
        repository: new AtomicMemberRoleRepository(),
        authorizeRoleGrant: authorizeControlPlaneRoleGrant,
      }),
    ).resolves.toEqual(notFoundOrForbidden());

    await expect(
      changeMemberRole({
        actorContext: admin,
        scope: { kind: "workspace", workspaceId },
        targetActorId: actorBId,
        nextRole: "publisher",
        repository: new AtomicMemberRoleRepository(),
        authorizeRoleGrant: authorizeControlPlaneRoleGrant,
      }),
    ).resolves.toMatchObject({ ok: true });

    await expect(
      changeMemberRole({
        actorContext: editor,
        scope: { kind: "workspace", workspaceId },
        targetActorId: actorAId,
        nextRole: "admin",
        repository: new AtomicMemberRoleRepository(),
        authorizeRoleGrant: authorizeControlPlaneRoleGrant,
      }),
    ).resolves.toEqual(notFoundOrForbidden());
  });
});

describe("member role change atomic repository contract", () => {
  it("does not write audit when role write fails", async () => {
    const context = await actorContext(actorAId, () => [
      workspaceRecord(actorAId, "owner"),
    ]);
    const repository = new AtomicMemberRoleRepository();
    repository.writeFailure = true;

    await expect(
      changeMemberRole({
        actorContext: context,
        scope: { kind: "workspace", workspaceId },
        targetActorId: actorBId,
        nextRole: "observer",
        repository,
        authorizeRoleGrant: authorizeControlPlaneRoleGrant,
      }),
    ).resolves.toEqual(notFoundOrForbidden());
    expect(repository.workspaceRoles.get(actorBId)).toBe("editor");
    expect(repository.audits).toEqual([]);
  });

  it("rolls back role change when audit fails", async () => {
    const context = await actorContext(actorAId, () => [
      workspaceRecord(actorAId, "owner"),
    ]);
    const repository = new AtomicMemberRoleRepository();
    repository.auditFailure = true;

    await expect(
      changeMemberRole({
        actorContext: context,
        scope: { kind: "workspace", workspaceId },
        targetActorId: actorBId,
        nextRole: "observer",
        repository,
        authorizeRoleGrant: authorizeControlPlaneRoleGrant,
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
    expect(repository.workspaceRoles.get(actorBId)).toBe("editor");
    expect(repository.audits).toEqual([]);
  });

  it("commits role and exactly one audit together on success", async () => {
    const context = await actorContext(actorAId, () => [
      workspaceRecord(actorAId, "owner"),
    ]);
    const repository = new AtomicMemberRoleRepository();

    await expect(
      changeMemberRole({
        actorContext: context,
        scope: { kind: "workspace", workspaceId },
        targetActorId: actorBId,
        nextRole: "observer",
        repository,
        authorizeRoleGrant: authorizeControlPlaneRoleGrant,
        now: () => new Date("2026-09-18T00:00:00.000Z"),
      }),
    ).resolves.toEqual({
      ok: true,
      value: {
        previousRole: "editor",
        nextRole: "observer",
        revision: 2,
      },
    });
    expect(repository.workspaceRoles.get(actorBId)).toBe("observer");
    expect(repository.audits).toEqual([
      {
        actorId: actorAId,
        targetActorId: actorBId,
        scope: { kind: "workspace", workspaceId },
        previousRole: "editor",
        nextRole: "observer",
        revision: 2,
        occurredAt: "2026-09-18T00:00:00.000Z",
      },
    ]);
  });

  it("fails closed when the repository returns a changed result with a mismatched nextRole", async () => {
    const context = await actorContext(actorAId, () => [
      workspaceRecord(actorAId, "owner"),
    ]);
    const repository = new AtomicMemberRoleRepository();
    repository.overrideChangedResult = {
      previousRole: "editor",
      nextRole: "admin",
      revision: 2,
    };

    await expect(
      changeMemberRole({
        actorContext: context,
        scope: { kind: "workspace", workspaceId },
        targetActorId: actorBId,
        nextRole: "observer",
        repository,
        authorizeRoleGrant: authorizeControlPlaneRoleGrant,
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
    expect(repository.workspaceRoles.get(actorBId)).toBe("editor");
    expect(repository.audits).toEqual([]);
  });

  it("fails closed when the repository returns an invalid previousRole or revision", async () => {
    const context = await actorContext(actorAId, () => [
      workspaceRecord(actorAId, "owner"),
    ]);

    for (const overrideChangedResult of [
      {
        previousRole: "superadmin",
        nextRole: "observer",
        revision: 2,
      },
      {
        previousRole: "editor",
        nextRole: "observer",
        revision: Number.MAX_SAFE_INTEGER + 1,
      },
      {
        previousRole: "editor",
        nextRole: "observer",
        revision: 0,
      },
    ]) {
      const repository = new AtomicMemberRoleRepository();
      repository.overrideChangedResult = overrideChangedResult;

      await expect(
        changeMemberRole({
          actorContext: context,
          scope: { kind: "workspace", workspaceId },
          targetActorId: actorBId,
          nextRole: "observer",
          repository,
          authorizeRoleGrant: authorizeControlPlaneRoleGrant,
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
      expect(repository.workspaceRoles.get(actorBId)).toBe("editor");
      expect(repository.audits).toEqual([]);
    }
  });
});

describe("member role change response normalization and input validation", () => {
  it("deep-equals unauthorized, missing scope, missing target, and disallowed grant responses", async () => {
    const observer = await actorContext(actorAId, () => [
      workspaceRecord(actorAId, "observer"),
    ]);
    const owner = await actorContext(actorAId, () => [
      workspaceRecord(actorAId, "owner"),
    ]);
    const projectOwner = await actorContext(actorAId, () => [
      workspaceRecord(actorAId, "owner"),
      projectRecord(actorAId, "owner"),
    ]);
    const admin = await actorContext(actorAId, () => [
      workspaceRecord(actorAId, "admin"),
    ]);

    const unauthorized = await changeMemberRole({
      actorContext: observer,
      scope: { kind: "workspace", workspaceId },
      targetActorId: actorBId,
      nextRole: "admin",
      repository: new AtomicMemberRoleRepository(),
      authorizeRoleGrant: authorizeControlPlaneRoleGrant,
    });
    const missingWorkspace = await changeMemberRole({
      actorContext: owner,
      scope: { kind: "workspace", workspaceId: otherWorkspaceId },
      targetActorId: actorBId,
      nextRole: "admin",
      repository: new AtomicMemberRoleRepository(),
      authorizeRoleGrant: authorizeControlPlaneRoleGrant,
    });
    const missingProject = await changeMemberRole({
      actorContext: projectOwner,
      scope: {
        kind: "project",
        workspaceId,
        projectId: otherProjectId,
        environment: "development",
      },
      targetActorId: actorBId,
      nextRole: "admin",
      repository: new AtomicMemberRoleRepository(),
      authorizeRoleGrant: authorizeControlPlaneRoleGrant,
    });
    const targetMissing = await changeMemberRole({
      actorContext: owner,
      scope: { kind: "workspace", workspaceId },
      targetActorId: missingActorId,
      nextRole: "admin",
      repository: new AtomicMemberRoleRepository(),
      authorizeRoleGrant: authorizeControlPlaneRoleGrant,
    });
    const disallowedGrant = await changeMemberRole({
      actorContext: admin,
      scope: { kind: "workspace", workspaceId },
      targetActorId: actorBId,
      nextRole: "owner",
      repository: new AtomicMemberRoleRepository(),
      authorizeRoleGrant: authorizeControlPlaneRoleGrant,
    });

    expect(unauthorized).toEqual(notFoundOrForbidden());
    expect(missingWorkspace).toEqual(unauthorized);
    expect(missingProject).toEqual(unauthorized);
    expect(targetMissing).toEqual(unauthorized);
    expect(disallowedGrant).toEqual(unauthorized);
  });

  it("rejects invalid runtime input before authorization or repository calls", async () => {
    const context = await actorContext(actorAId, () => [
      workspaceRecord(actorAId, "owner"),
    ]);
    let authorizerCalls = 0;
    let repositoryCalls = 0;
    const repository: MemberRoleChangeRepository = {
      async changeMemberRoleAndRecordAudit() {
        repositoryCalls += 1;
        return { kind: "not_found_or_forbidden" };
      },
    };
    const authorizeRoleGrant = () => {
      authorizerCalls += 1;
      return {
        allow: false as const,
        reason: "not_found_or_forbidden" as const,
      };
    };

    await expect(
      changeMemberRole({
        actorContext: context,
        scope: { kind: "workspace", workspaceId },
        targetActorId: "not-a-user",
        nextRole: "admin",
        repository,
        authorizeRoleGrant,
      }),
    ).resolves.toEqual(notFoundOrForbidden());
    await expect(
      changeMemberRole({
        actorContext: context,
        scope: { kind: "workspace", workspaceId },
        targetActorId: actorBId,
        nextRole: "superadmin",
        repository,
        authorizeRoleGrant,
      }),
    ).resolves.toEqual(notFoundOrForbidden());
    await expect(
      changeMemberRole({
        actorContext: context,
        scope: { kind: "workspace", workspaceId },
        targetActorId: "",
        nextRole: undefined,
        repository,
        authorizeRoleGrant,
      }),
    ).resolves.toEqual(notFoundOrForbidden());

    expect(authorizerCalls).toBe(0);
    expect(repositoryCalls).toBe(0);
  });
});

describe("member role changes take effect on the target actor's next request", () => {
  it("re-authenticates the target actor after tightening editor to observer", async () => {
    const repository = new AtomicMemberRoleRepository();
    const actorA = await actorContext(actorAId, () => [
      workspaceRecord(actorAId, "owner"),
    ]);

    const actorBRecords = () => [
      workspaceRecord(
        actorBId,
        repository.workspaceRoles.get(actorBId) ?? "observer",
      ),
      projectRecord(
        actorBId,
        repository.projectRoles.get(actorBId) ?? "observer",
      ),
    ];
    const actorBBefore = await actorContext(actorBId, actorBRecords);
    expect(
      authorizeControlPlane(
        actorBBefore,
        {
          kind: "project",
          workspaceId,
          projectId,
          environment: "development",
        },
        controlPlaneCapabilities.draftEdit,
      ).allow,
    ).toBe(true);

    await expect(
      changeMemberRole({
        actorContext: actorA,
        scope: { kind: "workspace", workspaceId },
        targetActorId: actorBId,
        nextRole: "observer",
        repository,
        authorizeRoleGrant: authorizeControlPlaneRoleGrant,
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        previousRole: "editor",
        nextRole: "observer",
      },
    });
    expect(repository.workspaceRoles.get(actorBId)).toBe("observer");
    expect(repository.audits).toHaveLength(1);
    expect(repository.audits[0]).toMatchObject({ targetActorId: actorBId });

    const actorBAfter = await actorContext(actorBId, actorBRecords);
    const projectScope = {
      kind: "project" as const,
      workspaceId,
      projectId,
      environment: "development" as const,
    };
    expect(
      authorizeControlPlane(
        actorBAfter,
        projectScope,
        controlPlaneCapabilities.draftEdit,
      ),
    ).toEqual({ allow: false, reason: "not_found_or_forbidden" });
    expect(
      authorizeControlPlane(
        actorBAfter,
        projectScope,
        controlPlaneCapabilities.projectRead,
      ).allow,
    ).toBe(true);
  });
});

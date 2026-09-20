import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  authorizeControlPlane,
  controlPlaneCapabilities,
  createDevelopmentIdentityProvider,
  createOidcActorAuthenticator,
  highImpactActionCapabilityMatrix,
  rbacRoles,
  rbacRoleCapabilityMatrix,
  type ActorContext,
  type ActorMembershipRecord,
  type RbacRole,
} from "../../packages/authz/src/index.js";

const actorId = "usr_018f0000-0000-7000-8000-000000000101";
const workspaceId = "ws_018f0000-0000-7000-8000-000000000001";
const otherWorkspaceId = "ws_018f0000-0000-7000-8000-000000000002";
const projectId = "prj_018f0000-0000-7000-8000-000000000201";
const subject = "person@example.com";

const expectedMatrix = {
  owner: [
    "candidate.review",
    "credential.revoke",
    "deployment.pause",
    "deployment.publish",
    "draft.edit",
    "project.archive",
    "project.create",
    "project.member.manage",
    "project.read",
    "project.restore",
    "scope.expand.data",
    "scope.expand.output",
    "service.read",
    "service_version.retire",
    "workspace.manage",
    "workspace.member.manage",
    "workspace.read",
  ],
  admin: [
    "candidate.review",
    "deployment.pause",
    "deployment.publish",
    "draft.edit",
    "project.archive",
    "project.create",
    "project.member.manage",
    "project.read",
    "project.restore",
    "service.read",
    "workspace.member.manage",
    "workspace.read",
  ],
  editor: ["draft.edit", "project.read", "service.read", "workspace.read"],
  publisher: [
    "deployment.pause",
    "deployment.publish",
    "project.read",
    "service.read",
    "workspace.read",
  ],
  reviewer: [
    "candidate.review",
    "project.read",
    "service.read",
    "workspace.read",
  ],
  observer: ["project.read", "service.read", "workspace.read"],
  operator: ["project.read", "service.read", "workspace.read"],
} as const satisfies Readonly<Record<RbacRole, readonly string[]>>;

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
    provider.issueToken({ subject }),
  );
  if (!result.ok) {
    throw new Error(result.error.category);
  }
  return result.value;
}

function workspaceRecord(role: RbacRole): ActorMembershipRecord {
  return {
    actorId,
    workspaceId,
    roles: [role],
    capabilities: [],
  };
}

function projectRecord(role: RbacRole): ActorMembershipRecord {
  return {
    actorId,
    workspaceId,
    projectId,
    environment: "development",
    roles: [role],
    capabilities: [],
  };
}

describe("control-plane RBAC", () => {
  it("publishes the complete role by capability matrix", () => {
    expect(rbacRoleCapabilityMatrix).toEqual(expectedMatrix);
    expect([...rbacRoles].sort()).toEqual(
      (Object.keys(expectedMatrix) as RbacRole[]).sort(),
    );
  });

  it("freezes published capability and high-impact action policies at runtime", async () => {
    expect(Object.isFrozen(controlPlaneCapabilities)).toBe(true);
    expect(Object.isFrozen(highImpactActionCapabilityMatrix)).toBe(true);

    expect(() => {
      (controlPlaneCapabilities as Record<string, string>).credentialRevoke =
        "deployment.pause";
    }).toThrow(TypeError);
    expect(() => {
      (controlPlaneCapabilities as Record<string, string>).dataScopeExpand =
        "deployment.publish";
    }).toThrow(TypeError);
    expect(() => {
      (highImpactActionCapabilityMatrix as Record<string, string>)[
        "credential.revoke"
      ] = "deployment.pause";
    }).toThrow(TypeError);

    const publisher = await actorContext([
      workspaceRecord("publisher"),
      projectRecord("publisher"),
    ]);
    const projectScope = {
      kind: "project" as const,
      workspaceId,
      projectId,
      environment: "development" as const,
    };

    for (const capability of [
      highImpactActionCapabilityMatrix["credential.revoke"],
      highImpactActionCapabilityMatrix["service_version.retire"],
      highImpactActionCapabilityMatrix["scope.expand.data"],
      highImpactActionCapabilityMatrix["scope.expand.output"],
    ]) {
      expect(
        authorizeControlPlane(publisher, projectScope, capability),
      ).toEqual({
        allow: false,
        reason: "not_found_or_forbidden",
      });
    }
  });

  it("keeps the database member_role enum aligned with RbacRole", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "packages/database/migrations/0006_member_role_contract.up.sql",
      ),
      "utf8",
    );
    const enumBody =
      /CREATE TYPE app\.member_role_v3 AS ENUM \(([\s\S]*?)\);/.exec(
        migration,
      )?.[1];
    const databaseRoles =
      enumBody?.match(/'[^']+'/g)?.map((role) => role.slice(1, -1)) ?? [];

    expect([...databaseRoles].sort()).toEqual([...rbacRoles].sort());
  });

  it("authorizes every role by operation in the workspace matrix", async () => {
    const capabilities = Object.values(controlPlaneCapabilities);

    for (const role of Object.keys(expectedMatrix) as RbacRole[]) {
      const context = await actorContext([workspaceRecord(role)]);
      for (const capability of capabilities) {
        const decision = authorizeControlPlane(
          context,
          { kind: "workspace", workspaceId },
          capability,
        );
        expect({
          role,
          capability,
          allow: decision.allow,
        }).toEqual({
          role,
          capability,
          allow: expectedMatrix[role].includes(capability),
        });
      }
    }
  });

  it("uses the stricter intersection of workspace and project roles", async () => {
    const ownerWorkspaceObserverProject = await actorContext([
      workspaceRecord("owner"),
      projectRecord("observer"),
    ]);
    const observerWorkspaceOwnerProject = await actorContext([
      workspaceRecord("observer"),
      projectRecord("owner"),
    ]);

    expect(
      authorizeControlPlane(
        ownerWorkspaceObserverProject,
        {
          kind: "project",
          workspaceId,
          projectId,
          environment: "development",
        },
        controlPlaneCapabilities.projectRead,
      ).allow,
    ).toBe(true);
    expect(
      authorizeControlPlane(
        ownerWorkspaceObserverProject,
        {
          kind: "project",
          workspaceId,
          projectId,
          environment: "development",
        },
        controlPlaneCapabilities.draftEdit,
      ),
    ).toEqual({ allow: false, reason: "not_found_or_forbidden" });
    expect(
      authorizeControlPlane(
        observerWorkspaceOwnerProject,
        {
          kind: "project",
          workspaceId,
          projectId,
          environment: "development",
        },
        controlPlaneCapabilities.draftEdit,
      ),
    ).toEqual({ allow: false, reason: "not_found_or_forbidden" });
  });

  it("returns the same denial for unauthorized and missing workspace resources", async () => {
    const context = await actorContext([workspaceRecord("observer")]);

    const forbidden = authorizeControlPlane(
      context,
      { kind: "workspace", workspaceId },
      controlPlaneCapabilities.workspaceMemberManage,
    );
    const missing = authorizeControlPlane(
      context,
      { kind: "workspace", workspaceId: otherWorkspaceId },
      controlPlaneCapabilities.workspaceMemberManage,
    );

    expect(forbidden).toEqual({
      allow: false,
      reason: "not_found_or_forbidden",
    });
    expect(missing).toEqual(forbidden);
  });
});

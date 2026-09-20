import { describe, expect, it } from "vitest";
import {
  createDevelopmentIdentityProvider,
  createOidcActorAuthenticator,
  validateStepUpIntentClaims,
  type ActorContext,
  type ActorMembershipRecord,
  type HighImpactActionTarget,
  type StepUpIntentClaims,
} from "../../packages/authz/src/index.js";

const actorId = "usr_018f0000-0000-7000-8000-000000000101";
const workspaceId = "ws_018f0000-0000-7000-8000-000000000001";
const projectId = "prj_018f0000-0000-7000-8000-000000000201";
const scope = {
  kind: "project" as const,
  workspaceId,
  projectId,
  environment: "production" as const,
};
const target: HighImpactActionTarget = {
  kind: "deployment",
  id: "dep_018f0000-0000-7000-8000-000000001601",
  revision: 7,
};
const now = new Date("2026-09-20T00:00:00.000Z");

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
    provider.issueToken({ subject: "step-up@example.test" }),
  );
  if (!result.ok) {
    throw new Error(result.error.category);
  }
  return result.value;
}

function claims(
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

describe("step-up intent validation", () => {
  it("accepts a fresh intent bound to actor, action, scope, target, and revision", async () => {
    const context = await actorContext([
      {
        actorId,
        workspaceId,
        roles: ["owner"],
        capabilities: [],
      },
    ]);

    expect(
      validateStepUpIntentClaims({
        claims: claims(),
        actorContext: context,
        action: "deployment.publish",
        scope,
        target,
        now: () => now,
      }),
    ).toMatchObject({
      ok: true,
      value: {
        intentId: "intent-018f0000-0000-7000-8000-000000000001",
        actorId,
      },
    });
  });

  it("rejects expired, stale, cross-target, and wrong-action intents", async () => {
    const context = await actorContext([
      {
        actorId,
        workspaceId,
        roles: ["owner"],
        capabilities: [],
      },
    ]);

    for (const intent of [
      claims({ expiresAt: "2026-09-19T23:59:59.000Z" }),
      claims({ authenticatedAt: "2026-09-19T23:50:00.000Z" }),
      claims({
        target: {
          ...target,
          id: "dep_018f0000-0000-7000-8000-000000001602",
        },
      }),
      claims({ action: "deployment.pause" }),
      claims({
        target: {
          kind: "credential",
          id: "cred_018f0000-0000-7000-8000-000000001803",
          revision: 1,
        },
      }),
    ]) {
      expect(
        validateStepUpIntentClaims({
          claims: intent,
          actorContext: context,
          action: "deployment.publish",
          scope,
          target,
          now: () => now,
        }).ok,
      ).toBe(false);
    }
  });
});

import { describe, expect, it } from "vitest";
import { createControlApiAuthMiddleware } from "../../apps/control-api/src/index.js";
import {
  createDevelopmentIdentityProvider,
  createOidcActorAuthenticator,
  type ActorMembershipResolver,
} from "../../packages/authz/src/index.js";

const actorId = "usr_018f0000-0000-7000-8000-000000000101";
const workspaceId = "ws_018f0000-0000-7000-8000-000000000001";
const subject = "person@example.com";

function authFixture() {
  const idp = createDevelopmentIdentityProvider({
    enabled: true,
    runtimeEnvironment: "development",
    issuer: "http://127.0.0.1:8787/dev-idp",
    audience: "modular-mcp-control-api",
    environment: "development",
  });
  if (!idp) {
    throw new Error("expected development IdP");
  }

  const resolver: ActorMembershipResolver = {
    async resolveMemberships() {
      return [
        {
          actorId,
          workspaceId,
          roles: ["operator"],
          capabilities: ["service.read"],
        },
      ];
    },
  };

  return {
    idp,
    authenticator: createOidcActorAuthenticator(
      {
        issuer: idp.issuer,
        audience: idp.audience,
        environment: idp.environment,
        jwks: idp.jwks,
      },
      resolver,
    ),
  };
}

describe("control-api auth middleware", () => {
  it("attaches ActorContext from Authorization bearer token and ignores tenant or role headers", async () => {
    const { idp, authenticator } = authFixture();
    const token = idp.issueToken({
      subject,
      additionalClaims: { roles: ["owner"] },
    });
    const middleware = createControlApiAuthMiddleware(authenticator);

    const result = await middleware({
      headers: {
        authorization: `Bearer ${token}`,
        "x-workspace-id": "ws_018f0000-0000-7000-8000-000000000999",
        "x-actor-roles": "owner",
      },
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        request: {
          headers: {
            authorization: `Bearer ${token}`,
            "x-workspace-id": "ws_018f0000-0000-7000-8000-000000000999",
            "x-actor-roles": "owner",
          },
        },
        actorContext: {
          schemaVersion: "authz.actor-context.v1",
          actorId,
          identity: {
            issuer: idp.issuer,
            subject,
          },
          environment: "development",
          workspaces: [
            {
              workspaceId,
              roles: ["operator"],
              capabilities: ["service.read"],
            },
          ],
        },
      },
    });
  });

  it("rejects missing or malformed authorization headers", async () => {
    const { authenticator } = authFixture();
    const failures: string[] = [];
    const middleware = createControlApiAuthMiddleware(authenticator, {
      logAuthFailure(event) {
        failures.push(event.category);
      },
    });

    await expect(middleware({ headers: {} })).resolves.toEqual({
      ok: false,
      error: {
        status: 401,
        body: {
          error: {
            code: "UNAUTHENTICATED",
            category: "invalid_authorization_header",
          },
        },
      },
    });
    await expect(
      middleware({
        headers: { authorization: "Basic definitely-not-a-token" },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { body: { error: { category: "invalid_authorization_header" } } },
    });
    expect(failures).toEqual([
      "invalid_authorization_header",
      "invalid_authorization_header",
    ]);
  });

  it("returns stable unauthenticated errors without exposing token details", async () => {
    const token = "aaa.bbb.ccc";
    const failures: string[] = [];
    const middleware = createControlApiAuthMiddleware(
      {
        async authenticateBearerToken() {
          return {
            ok: false,
            error: {
              category: "invalid_token_audience",
              message: "JWT audience is not accepted",
            },
          };
        },
      },
      {
        logAuthFailure(event) {
          failures.push(JSON.stringify(event));
        },
      },
    );

    await expect(
      middleware({ headers: { authorization: `Bearer ${token}` } }),
    ).resolves.toEqual({
      ok: false,
      error: {
        status: 401,
        body: {
          error: {
            code: "UNAUTHENTICATED",
            category: "invalid_token_audience",
          },
        },
      },
    });
    expect(failures).toEqual(['{"category":"invalid_token_audience"}']);
    expect(failures[0]).not.toContain(token);
    expect(failures[0]).not.toContain(subject);
  });

  it("maps authenticator dependency exceptions to stable closed denial", async () => {
    const { idp } = authFixture();
    const token = idp.issueToken({ subject });
    const failures: string[] = [];
    const middleware = createControlApiAuthMiddleware(
      {
        async authenticateBearerToken() {
          throw new Error("database password leaked in this message");
        },
      },
      {
        logAuthFailure(event) {
          failures.push(JSON.stringify(event));
        },
      },
    );

    await expect(
      middleware({ headers: { authorization: `Bearer ${token}` } }),
    ).resolves.toEqual({
      ok: false,
      error: {
        status: 401,
        body: {
          error: {
            code: "UNAUTHENTICATED",
            category: "identity_dependency_unavailable",
          },
        },
      },
    });
    expect(failures).toEqual([
      '{"category":"identity_dependency_unavailable"}',
    ]);
    expect(failures[0]).not.toContain(token);
    expect(failures[0]).not.toContain(subject);
    expect(failures[0]).not.toContain("database password");
  });
});

import {
  createSign,
  generateKeyPairSync,
  type JsonWebKey,
  type KeyObject,
} from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createDevelopmentIdentityProvider,
  createOidcActorAuthenticator,
  verifyOidcToken,
  type ActorMembershipResolver,
  type OidcJwk,
  type OidcVerifierConfig,
} from "../../packages/authz/src/index.js";

const actorId = "usr_018f0000-0000-7000-8000-000000000101";
const workspaceId = "ws_018f0000-0000-7000-8000-000000000001";
const subject = "person@example.com";
const issuer = "http://127.0.0.1:8787/dev-idp";
const audience = "modular-mcp-control-api";

function base64UrlEncode(input: Buffer | string): string {
  const buffer = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buffer
    .toString("base64")
    .replaceAll("=", "")
    .replaceAll("+", "-")
    .replaceAll("/", "_");
}

function signJwt(
  header: Readonly<Record<string, unknown>>,
  payload: Readonly<Record<string, unknown>>,
  privateKey: KeyObject,
): string {
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signer = createSign("RSA-SHA256");
  signer.update(`${encodedHeader}.${encodedPayload}`);
  signer.end();
  return `${encodedHeader}.${encodedPayload}.${base64UrlEncode(
    signer.sign(privateKey),
  )}`;
}

function signedTokenFixture(input?: {
  readonly header?: Readonly<Record<string, unknown>>;
  readonly claims?: Readonly<Record<string, unknown>>;
}): {
  readonly token: string;
  readonly config: OidcVerifierConfig;
  readonly jwk: OidcJwk;
} {
  const kid = "test-key";
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicExponent: 0x10001,
  });
  const publicJwk = Object.freeze({
    ...(publicKey.export({ format: "jwk" }) as JsonWebKey),
    kid,
    alg: "RS256",
    kty: "RSA",
    use: "sig",
  } as OidcJwk);
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: issuer,
    aud: audience,
    sub: subject,
    env: "development",
    iat: now,
    nbf: now - 1,
    exp: now + 900,
    ...input?.claims,
  };
  const header = {
    alg: "RS256",
    typ: "JWT",
    kid,
    ...input?.header,
  };

  return {
    token: signJwt(header, claims, privateKey),
    config: {
      issuer,
      audience,
      environment: "development",
      jwks: [publicJwk],
    },
    jwk: publicJwk,
  };
}

function testIdp() {
  const idp = createDevelopmentIdentityProvider({
    enabled: true,
    runtimeEnvironment: "development",
    issuer,
    audience,
    environment: "development",
  });
  if (!idp) {
    throw new Error("expected development IdP");
  }
  return idp;
}

function resolver(): ActorMembershipResolver {
  return {
    async resolveMemberships(identity) {
      expect(identity.subject).toBe(subject);
      return [
        {
          actorId,
          workspaceId,
          roles: ["reviewer"],
          capabilities: ["candidate.review", "project.read"],
        },
      ];
    },
  };
}

function mutateSignature(token: string): string {
  const parts = token.split(".");
  const signature = parts[2];
  if (!parts[0] || !parts[1] || !signature) {
    throw new Error("expected compact JWT");
  }
  const replacement = signature[0] === "A" ? "B" : "A";
  return `${parts[0]}.${parts[1]}.${replacement}${signature.slice(1)}`;
}

describe("OIDC verification", () => {
  it("accepts a signed development token with trusted issuer, audience, environment, and time claims", () => {
    const idp = testIdp();
    const token = idp.issueToken({ subject });

    const verified = verifyOidcToken(token, {
      issuer: idp.issuer,
      audience: idp.audience,
      environment: idp.environment,
      jwks: idp.jwks,
    });

    expect(verified).toMatchObject({
      ok: true,
      value: {
        issuer: idp.issuer,
        audience: idp.audience,
        subject,
        environment: "development",
      },
    });
  });

  it("rejects forged signatures", () => {
    const idp = testIdp();
    const verified = verifyOidcToken(
      mutateSignature(idp.issueToken({ subject })),
      {
        issuer: idp.issuer,
        audience: idp.audience,
        environment: idp.environment,
        jwks: idp.jwks,
      },
    );

    expect(verified).toEqual({
      ok: false,
      error: {
        category: "invalid_token_signature",
        message: "JWT signature is invalid",
      },
    });
  });

  it("rejects wrong audience tokens", () => {
    const { token, config } = signedTokenFixture({
      claims: { aud: "other-control-plane" },
    });

    expect(verifyOidcToken(token, config)).toMatchObject({
      ok: false,
      error: { category: "invalid_token_audience" },
    });
  });

  it("rejects wrong issuer tokens", () => {
    const { token, config } = signedTokenFixture({
      claims: { iss: "https://issuer.example.invalid" },
    });

    expect(verifyOidcToken(token, config)).toMatchObject({
      ok: false,
      error: { category: "invalid_token_issuer" },
    });
  });

  it("rejects expired tokens", () => {
    const idp = testIdp();
    const token = idp.issueToken({ subject, expiresInSeconds: -1 });

    expect(
      verifyOidcToken(token, {
        issuer: idp.issuer,
        audience: idp.audience,
        environment: idp.environment,
        jwks: idp.jwks,
      }),
    ).toMatchObject({
      ok: false,
      error: { category: "token_expired" },
    });
  });

  it("rejects tokens before nbf", () => {
    const idp = testIdp();
    const token = idp.issueToken({
      subject,
      notBeforeOffsetSeconds: 60,
    });

    expect(
      verifyOidcToken(token, {
        issuer: idp.issuer,
        audience: idp.audience,
        environment: idp.environment,
        jwks: idp.jwks,
      }),
    ).toMatchObject({
      ok: false,
      error: { category: "token_not_yet_valid" },
    });
  });

  it("rejects tokens for a different environment", () => {
    const { token, config } = signedTokenFixture({
      claims: { env: "production" },
    });

    expect(verifyOidcToken(token, config)).toMatchObject({
      ok: false,
      error: { category: "invalid_token_environment" },
    });
  });

  it("rejects missing and invalid subjects", () => {
    const missing = signedTokenFixture({ claims: { sub: undefined } });
    const invalid = signedTokenFixture({ claims: { sub: "" } });

    expect(verifyOidcToken(missing.token, missing.config)).toMatchObject({
      ok: false,
      error: { category: "invalid_token_claim" },
    });
    expect(verifyOidcToken(invalid.token, invalid.config)).toMatchObject({
      ok: false,
      error: { category: "invalid_token_claim" },
    });
  });

  it("rejects alg none and wrong alg tokens before trusting signatures", () => {
    const none = signedTokenFixture({ header: { alg: "none" } });
    const wrong = signedTokenFixture({ header: { alg: "HS256" } });

    expect(verifyOidcToken(none.token, none.config)).toMatchObject({
      ok: false,
      error: { category: "unsupported_token_algorithm" },
    });
    expect(verifyOidcToken(wrong.token, wrong.config)).toMatchObject({
      ok: false,
      error: { category: "unsupported_token_algorithm" },
    });
  });

  it("rejects unknown key ids", () => {
    const { token, config } = signedTokenFixture({
      header: { kid: "unknown-key" },
    });

    expect(verifyOidcToken(token, config)).toMatchObject({
      ok: false,
      error: { category: "invalid_token_signature" },
    });
  });

  it("rejects exp and nbf values too large to safely convert to ISO", () => {
    const hugeExp = signedTokenFixture({
      claims: { exp: Number.MAX_SAFE_INTEGER },
    });
    const hugeNbf = signedTokenFixture({
      claims: { nbf: Number.MAX_SAFE_INTEGER },
    });

    expect(verifyOidcToken(hugeExp.token, hugeExp.config)).toMatchObject({
      ok: false,
      error: { category: "invalid_token_claim" },
    });
    expect(verifyOidcToken(hugeNbf.token, hugeNbf.config)).toMatchObject({
      ok: false,
      error: { category: "invalid_token_claim" },
    });
  });

  it("rejects oversized tokens without throwing", () => {
    expect(
      verifyOidcToken("a".repeat(8193), {
        issuer,
        audience,
        environment: "development",
        jwks: [],
      }),
    ).toMatchObject({
      ok: false,
      error: { category: "malformed_token" },
    });
  });

  it("rejects invalid clock skew and remains total for bad runtime inputs", () => {
    const { token, config } = signedTokenFixture();

    expect(
      verifyOidcToken(token, { ...config, clockSkewSeconds: -1 }),
    ).toMatchObject({
      ok: false,
      error: { category: "invalid_oidc_configuration" },
    });
    expect(() =>
      verifyOidcToken(42 as unknown as string, config),
    ).not.toThrow();
    expect(verifyOidcToken(42 as unknown as string, config)).toMatchObject({
      ok: false,
      error: { category: "malformed_token" },
    });
  });
});

describe("ActorContext construction", () => {
  it("constructs stable ActorContext from verified identity and membership lookup only", async () => {
    const idp = testIdp();
    const token = idp.issueToken({
      subject,
      additionalClaims: {
        roles: ["owner"],
        workspaceId: "ws_018f0000-0000-7000-8000-000000000999",
      },
    });
    const authenticator = createOidcActorAuthenticator(
      {
        issuer: idp.issuer,
        audience: idp.audience,
        environment: idp.environment,
        jwks: idp.jwks,
      },
      resolver(),
    );

    const first = await authenticator.authenticateBearerToken(token);
    const second = await authenticator.authenticateBearerToken(token);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      ok: true,
      value: {
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
            roles: ["reviewer"],
            capabilities: ["candidate.review", "project.read"],
          },
        ],
      },
    });
  });

  it("fails closed when membership lookup has no record", async () => {
    const idp = testIdp();
    const authenticator = createOidcActorAuthenticator(
      {
        issuer: idp.issuer,
        audience: idp.audience,
        environment: idp.environment,
        jwks: idp.jwks,
      },
      {
        async resolveMemberships() {
          return [];
        },
      },
    );

    await expect(
      authenticator.authenticateBearerToken(idp.issueToken({ subject })),
    ).resolves.toMatchObject({
      ok: false,
      error: { category: "subject_not_authorized" },
    });
  });

  it.each(["maintainer", "auditor", "system"] as const)(
    "rejects legacy tenant role %s from ordinary memberships",
    async (legacyRole) => {
      const idp = testIdp();
      const authenticator = createOidcActorAuthenticator(
        {
          issuer: idp.issuer,
          audience: idp.audience,
          environment: idp.environment,
          jwks: idp.jwks,
        },
        {
          async resolveMemberships() {
            return [
              {
                actorId,
                workspaceId,
                roles: [legacyRole],
                capabilities: [],
              } as never,
            ];
          },
        },
      );

      const result = await authenticator.authenticateBearerToken(
        idp.issueToken({ subject }),
      );

      expect(result).toMatchObject({
        ok: false,
        error: { category: "invalid_actor_membership" },
      });
    },
  );

  it("maps membership resolver exceptions to identity_dependency_unavailable", async () => {
    const idp = testIdp();
    const authenticator = createOidcActorAuthenticator(
      {
        issuer: idp.issuer,
        audience: idp.audience,
        environment: idp.environment,
        jwks: idp.jwks,
      },
      {
        async resolveMemberships() {
          throw new Error("database password leaked in this message");
        },
      },
    );

    await expect(
      authenticator.authenticateBearerToken(idp.issueToken({ subject })),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        category: "identity_dependency_unavailable",
        message: "Identity dependency is unavailable",
      },
    });
  });
});

describe("development identity provider", () => {
  it("is disabled when not explicitly enabled", () => {
    expect(
      createDevelopmentIdentityProvider({
        enabled: false,
        runtimeEnvironment: "development",
      }),
    ).toBeUndefined();
  });

  it("fails closed when enabled outside development runtime", () => {
    expect(() =>
      createDevelopmentIdentityProvider({
        enabled: true,
        runtimeEnvironment: "production",
      }),
    ).toThrow(
      "development identity provider can only be enabled in development",
    );
    expect(() =>
      createDevelopmentIdentityProvider({
        enabled: true,
        runtimeEnvironment: "test",
      }),
    ).toThrow(
      "development identity provider can only be enabled in development",
    );
  });

  it("fails closed when configured to issue production or test environment tokens", () => {
    expect(() =>
      createDevelopmentIdentityProvider({
        enabled: true,
        runtimeEnvironment: "development",
        environment: "production",
      }),
    ).toThrow(
      "development identity provider can only issue development tokens",
    );
    expect(() =>
      createDevelopmentIdentityProvider({
        enabled: true,
        runtimeEnvironment: "development",
        environment: "test",
      }),
    ).toThrow(
      "development identity provider can only issue development tokens",
    );
  });

  it("does not allow reserved registered claim overrides", () => {
    const idp = testIdp();

    expect(() =>
      idp.issueToken({
        subject,
        additionalClaims: { aud: "other-control-plane" },
      }),
    ).toThrow(
      "development token additionalClaims cannot override registered JWT claims",
    );
  });
});

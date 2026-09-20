import {
  createPublicKey,
  createSign,
  createVerify,
  generateKeyPairSync,
  randomUUID,
  type JsonWebKey,
  type KeyObject,
} from "node:crypto";

export const packageLayer = "authz" as const;

export type RuntimeEnvironment = "development" | "test" | "production";
export type ProjectEnvironment = RuntimeEnvironment;

export const controlPlaneCapabilities = Object.freeze({
  candidateReview: "candidate.review",
  credentialRevoke: "credential.revoke",
  dataScopeExpand: "scope.expand.data",
  deploymentPause: "deployment.pause",
  deploymentPublish: "deployment.publish",
  draftEdit: "draft.edit",
  outputScopeExpand: "scope.expand.output",
  projectArchive: "project.archive",
  projectCreate: "project.create",
  projectMemberManage: "project.member.manage",
  projectRead: "project.read",
  projectRestore: "project.restore",
  serviceRead: "service.read",
  serviceVersionRetire: "service_version.retire",
  workspaceManage: "workspace.manage",
  workspaceMemberManage: "workspace.member.manage",
  workspaceRead: "workspace.read",
} as const);

export type ControlPlaneCapability =
  (typeof controlPlaneCapabilities)[keyof typeof controlPlaneCapabilities];

export const rbacRoles = Object.freeze([
  "admin",
  "editor",
  "observer",
  "operator",
  "owner",
  "publisher",
  "reviewer",
] as const);

export type RbacRole = (typeof rbacRoles)[number];

export type ActorRole = RbacRole;

const allControlPlaneCapabilities = Object.freeze(
  Object.values(controlPlaneCapabilities).sort(),
) as readonly ControlPlaneCapability[];

const rbacRoleCapabilityMatrixInternal = {
  owner: allControlPlaneCapabilities,
  admin: [
    controlPlaneCapabilities.candidateReview,
    controlPlaneCapabilities.deploymentPause,
    controlPlaneCapabilities.deploymentPublish,
    controlPlaneCapabilities.draftEdit,
    controlPlaneCapabilities.projectArchive,
    controlPlaneCapabilities.projectCreate,
    controlPlaneCapabilities.projectMemberManage,
    controlPlaneCapabilities.projectRead,
    controlPlaneCapabilities.projectRestore,
    controlPlaneCapabilities.serviceRead,
    controlPlaneCapabilities.workspaceMemberManage,
    controlPlaneCapabilities.workspaceRead,
  ],
  editor: [
    controlPlaneCapabilities.draftEdit,
    controlPlaneCapabilities.projectRead,
    controlPlaneCapabilities.serviceRead,
    controlPlaneCapabilities.workspaceRead,
  ],
  publisher: [
    controlPlaneCapabilities.deploymentPause,
    controlPlaneCapabilities.deploymentPublish,
    controlPlaneCapabilities.projectRead,
    controlPlaneCapabilities.serviceRead,
    controlPlaneCapabilities.workspaceRead,
  ],
  reviewer: [
    controlPlaneCapabilities.candidateReview,
    controlPlaneCapabilities.projectRead,
    controlPlaneCapabilities.serviceRead,
    controlPlaneCapabilities.workspaceRead,
  ],
  observer: [
    controlPlaneCapabilities.projectRead,
    controlPlaneCapabilities.serviceRead,
    controlPlaneCapabilities.workspaceRead,
  ],
  operator: [
    controlPlaneCapabilities.projectRead,
    controlPlaneCapabilities.serviceRead,
    controlPlaneCapabilities.workspaceRead,
  ],
} as const satisfies Readonly<
  Record<RbacRole, readonly ControlPlaneCapability[]>
>;

export const rbacRoleCapabilityMatrix = Object.freeze(
  Object.fromEntries(
    Object.entries(rbacRoleCapabilityMatrixInternal).map(
      ([role, capabilities]) => [role, Object.freeze([...capabilities].sort())],
    ),
  ),
) as Readonly<Record<RbacRole, readonly ControlPlaneCapability[]>>;

export type AuthzErrorCategory =
  | "identity_dependency_unavailable"
  | "invalid_actor_membership"
  | "invalid_authorization_header"
  | "invalid_dev_idp_configuration"
  | "invalid_oidc_configuration"
  | "invalid_step_up_intent"
  | "invalid_token_audience"
  | "invalid_token_claim"
  | "invalid_token_environment"
  | "invalid_token_issuer"
  | "invalid_token_signature"
  | "malformed_token"
  | "subject_not_authorized"
  | "step_up_intent_expired"
  | "token_expired"
  | "token_not_yet_valid"
  | "unsupported_token_algorithm";

export interface AuthzError {
  readonly category: AuthzErrorCategory;
  readonly message: string;
}

export type AuthzResult<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly error: AuthzError };

export interface OidcJwk {
  readonly kid: string;
  readonly alg: "RS256";
  readonly kty: "RSA";
  readonly use?: "sig";
  readonly n: string;
  readonly e: string;
}

export interface OidcVerifierConfig {
  readonly issuer: string;
  readonly audience: string;
  readonly environment: RuntimeEnvironment;
  readonly jwks: readonly OidcJwk[];
  readonly clockSkewSeconds?: number;
  readonly now?: () => Date;
}

export interface VerifiedOidcIdentity {
  readonly issuer: string;
  readonly audience: string;
  readonly subject: string;
  readonly environment: RuntimeEnvironment;
  readonly expiresAt: string;
  readonly notBefore: string;
}

export interface ActorMembershipRecord {
  readonly actorId: string;
  readonly workspaceId: string;
  readonly projectId?: string;
  readonly environment?: ProjectEnvironment;
  readonly roles: readonly ActorRole[];
  readonly capabilities: readonly string[];
}

export interface ActorMembershipResolver {
  resolveMemberships(
    identity: VerifiedOidcIdentity,
  ): Promise<readonly ActorMembershipRecord[]>;
}

export interface ActorWorkspaceContext {
  readonly workspaceId: string;
  readonly roles: readonly ActorRole[];
  readonly capabilities: readonly string[];
  readonly projects: readonly ActorProjectContext[];
}

export interface ActorProjectContext {
  readonly projectId: string;
  readonly environment: ProjectEnvironment;
  readonly roles: readonly ActorRole[];
  readonly capabilities: readonly string[];
}

const actorContextBrand: unique symbol = Symbol("ActorContext");

export interface ActorContext {
  readonly [actorContextBrand]: true;
  readonly schemaVersion: "authz.actor-context.v1";
  readonly actorId: string;
  readonly identity: {
    readonly issuer: string;
    readonly subject: string;
  };
  readonly environment: RuntimeEnvironment;
  readonly workspaces: readonly ActorWorkspaceContext[];
}

export type ControlPlaneAuthorizationScope =
  | {
      readonly kind: "workspace";
      readonly workspaceId: string;
    }
  | {
      readonly kind: "project";
      readonly workspaceId: string;
      readonly projectId: string;
      readonly environment: ProjectEnvironment;
    };

export type ControlPlaneAuthorizationDecision =
  | {
      readonly allow: true;
      readonly actorId: string;
      readonly capability: ControlPlaneCapability;
      readonly scope: ControlPlaneAuthorizationScope;
    }
  | {
      readonly allow: false;
      readonly reason: "not_found_or_forbidden";
    };

export type ControlPlaneRoleGrantDecision =
  | {
      readonly allow: true;
      readonly actorId: string;
      readonly scope: ControlPlaneAuthorizationScope;
      readonly nextRole: RbacRole;
      readonly manageExistingOwner: boolean;
    }
  | {
      readonly allow: false;
      readonly reason: "not_found_or_forbidden";
    };

export const highImpactActionKinds = Object.freeze([
  "credential.revoke",
  "deployment.pause",
  "deployment.publish",
  "scope.expand.data",
  "scope.expand.output",
  "service_version.retire",
] as const);

export type HighImpactActionKind = (typeof highImpactActionKinds)[number];

export const highImpactActionCapabilityMatrix = Object.freeze({
  "credential.revoke": controlPlaneCapabilities.credentialRevoke,
  "deployment.pause": controlPlaneCapabilities.deploymentPause,
  "deployment.publish": controlPlaneCapabilities.deploymentPublish,
  "scope.expand.data": controlPlaneCapabilities.dataScopeExpand,
  "scope.expand.output": controlPlaneCapabilities.outputScopeExpand,
  "service_version.retire": controlPlaneCapabilities.serviceVersionRetire,
} as const satisfies Readonly<
  Record<HighImpactActionKind, ControlPlaneCapability>
>);

export type HighImpactTargetKind =
  | "credential"
  | "data_scope"
  | "deployment"
  | "output_scope"
  | "service_version";

export interface HighImpactActionTarget {
  readonly kind: HighImpactTargetKind;
  readonly id: string;
  readonly revision: number;
}

export interface StepUpIntentClaims {
  readonly intentId: string;
  readonly actorId: string;
  readonly action: HighImpactActionKind;
  readonly scope: ControlPlaneAuthorizationScope;
  readonly target: HighImpactActionTarget;
  readonly authenticatedAt: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

export interface StepUpIntentValidationInput {
  readonly claims: StepUpIntentClaims;
  readonly actorContext: ActorContext;
  readonly action: HighImpactActionKind;
  readonly scope: ControlPlaneAuthorizationScope;
  readonly target: HighImpactActionTarget;
  readonly now?: () => Date;
  readonly maxAuthenticationAgeSeconds?: number;
  readonly maxIntentLifetimeSeconds?: number;
}

export interface BearerTokenAuthenticator {
  authenticateBearerToken(token: string): Promise<AuthzResult<ActorContext>>;
}

export interface DevelopmentIdentityProvider {
  readonly issuer: string;
  readonly audience: string;
  readonly environment: RuntimeEnvironment;
  readonly jwks: readonly OidcJwk[];
  issueToken(input: DevelopmentTokenInput): string;
}

export interface DevelopmentTokenInput {
  readonly subject: string;
  readonly expiresInSeconds?: number;
  readonly notBeforeOffsetSeconds?: number;
  readonly additionalClaims?: Readonly<Record<string, unknown>>;
}

const maxJwtLength = 8192;
const maxClockSkewSeconds = 300;
const maxDateMilliseconds = 8_640_000_000_000_000;
const protectedDevelopmentClaims = new Set([
  "aud",
  "env",
  "exp",
  "iat",
  "iss",
  "jti",
  "nbf",
  "sub",
]);

const jwtHeader = {
  alg: "RS256",
  typ: "JWT",
} as const;

const opaqueActorIdPattern =
  /^usr_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const opaqueWorkspaceIdPattern =
  /^ws_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const opaqueProjectIdPattern =
  /^prj_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const subjectPattern = /^[A-Za-z0-9._:@/-]{1,255}$/;
const intentIdPattern = /^[A-Za-z0-9._:-]{8,128}$/;
const highImpactTargetIdPattern = /^[A-Za-z][A-Za-z0-9_-]{1,127}$/;
const defaultStepUpMaxAuthenticationAgeSeconds = 300;
const defaultStepUpMaxIntentLifetimeSeconds = 300;

function err(
  category: AuthzErrorCategory,
  message: string,
): AuthzResult<never> {
  return { ok: false, error: { category, message } };
}

function ok<Value>(value: Value): AuthzResult<Value> {
  return { ok: true, value };
}

function base64UrlEncode(input: Buffer | string): string {
  const buffer = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buffer
    .toString("base64")
    .replaceAll("=", "")
    .replaceAll("+", "-")
    .replaceAll("/", "_");
}

function base64UrlDecode(input: string): AuthzResult<Buffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(input)) {
    return err("malformed_token", "JWT segment is not base64url encoded");
  }
  if (input.length % 4 === 1) {
    return err("malformed_token", "JWT segment is not valid base64url");
  }

  const padding = (4 - (input.length % 4)) % 4;
  const base64 = `${input.replaceAll("-", "+").replaceAll("_", "/")}${"=".repeat(
    padding,
  )}`;

  try {
    return ok(Buffer.from(base64, "base64"));
  } catch {
    return err("malformed_token", "JWT segment is not valid base64url");
  }
}

function parseJsonObject(
  segment: string,
  category: AuthzErrorCategory,
): AuthzResult<Record<string, unknown>> {
  const decoded = base64UrlDecode(segment);
  if (!decoded.ok) {
    return decoded;
  }

  try {
    const value: unknown = JSON.parse(decoded.value.toString("utf8"));
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return err(category, "JWT JSON segment must be an object");
    }
    return ok(value as Record<string, unknown>);
  } catch {
    return err(category, "JWT JSON segment is malformed");
  }
}

function readStringClaim(
  claims: Readonly<Record<string, unknown>>,
  name: string,
): string | undefined {
  const value = claims[name];
  return typeof value === "string" ? value : undefined;
}

function readNumberClaim(
  claims: Readonly<Record<string, unknown>>,
  name: string,
): number | undefined {
  const value = claims[name];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function hasAudience(aud: unknown, expected: string): boolean {
  if (typeof aud === "string") {
    return aud === expected;
  }
  if (Array.isArray(aud)) {
    return (
      aud.every((value) => typeof value === "string") && aud.includes(expected)
    );
  }
  return false;
}

function readAudience(aud: unknown): string | undefined {
  if (typeof aud === "string") {
    return aud;
  }
  if (Array.isArray(aud) && aud.every((value) => typeof value === "string")) {
    return aud.join(" ");
  }
  return undefined;
}

function secondsToIsoString(seconds: number): AuthzResult<string> {
  if (!Number.isSafeInteger(seconds) || seconds <= 0) {
    return err("invalid_token_claim", "JWT time claim must be a safe integer");
  }

  const milliseconds = seconds * 1000;
  if (
    !Number.isSafeInteger(milliseconds) ||
    Math.abs(milliseconds) > maxDateMilliseconds
  ) {
    return err("invalid_token_claim", "JWT time claim is outside ISO range");
  }

  const date = new Date(milliseconds);
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp)) {
    return err("invalid_token_claim", "JWT time claim is outside ISO range");
  }

  try {
    return ok(date.toISOString());
  } catch {
    return err("invalid_token_claim", "JWT time claim is outside ISO range");
  }
}

function parseIsoInstant(value: string): AuthzResult<number> {
  if (typeof value !== "string" || value.length > 40) {
    return err("invalid_token_claim", "timestamp claim is invalid");
  }
  const milliseconds = Date.parse(value);
  if (!Number.isSafeInteger(milliseconds)) {
    return err("invalid_token_claim", "timestamp claim is invalid");
  }
  try {
    if (new Date(milliseconds).toISOString() !== value) {
      return err("invalid_token_claim", "timestamp claim is invalid");
    }
  } catch {
    return err("invalid_token_claim", "timestamp claim is invalid");
  }
  return ok(milliseconds);
}

function readVerifierClock(config: OidcVerifierConfig): AuthzResult<{
  readonly nowSeconds: number;
  readonly skewSeconds: number;
}> {
  const skewSeconds = config.clockSkewSeconds ?? 0;
  if (
    !Number.isSafeInteger(skewSeconds) ||
    skewSeconds < 0 ||
    skewSeconds > maxClockSkewSeconds
  ) {
    return err(
      "invalid_oidc_configuration",
      "OIDC clock skew must be a non-negative integer no greater than 300 seconds",
    );
  }

  const now = config.now?.() ?? new Date();
  const nowMilliseconds = now.getTime();
  if (!Number.isFinite(nowMilliseconds)) {
    return err("invalid_oidc_configuration", "OIDC verifier clock is invalid");
  }

  return ok({
    nowSeconds: Math.floor(nowMilliseconds / 1000),
    skewSeconds,
  });
}

function keyForKid(
  jwks: readonly OidcJwk[],
  kid: string,
): AuthzResult<KeyObject> {
  const jwk = jwks.find((candidate) => candidate.kid === kid);
  if (!jwk) {
    return err("invalid_token_signature", "JWT key id is not trusted");
  }
  if (jwk.alg !== "RS256" || jwk.kty !== "RSA") {
    return err("unsupported_token_algorithm", "JWT key must be RSA RS256");
  }

  try {
    return ok(
      createPublicKey({ key: jwk as unknown as JsonWebKey, format: "jwk" }),
    );
  } catch {
    return err("invalid_token_signature", "JWT public key is invalid");
  }
}

export function verifyOidcToken(
  token: string,
  config: OidcVerifierConfig,
): AuthzResult<VerifiedOidcIdentity> {
  try {
    return verifyOidcTokenInner(token, config);
  } catch {
    return err("malformed_token", "JWT could not be verified");
  }
}

function verifyOidcTokenInner(
  token: string,
  config: OidcVerifierConfig,
): AuthzResult<VerifiedOidcIdentity> {
  if (typeof token !== "string") {
    return err("malformed_token", "JWT must be a string");
  }
  if (token.length > maxJwtLength) {
    return err("malformed_token", "JWT exceeds maximum accepted size");
  }

  const clock = readVerifierClock(config);
  if (!clock.ok) {
    return clock;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return err(
      "malformed_token",
      "JWT must contain header, payload, and signature",
    );
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    return err("malformed_token", "JWT segments must be non-empty");
  }

  const header = parseJsonObject(encodedHeader, "malformed_token");
  if (!header.ok) {
    return header;
  }

  if (header.value["alg"] !== "RS256") {
    return err("unsupported_token_algorithm", "JWT alg must be RS256");
  }
  const kid = readStringClaim(header.value, "kid");
  if (!kid) {
    return err("invalid_token_signature", "JWT kid is required");
  }

  const publicKey = keyForKid(config.jwks, kid);
  if (!publicKey.ok) {
    return publicKey;
  }

  const signature = base64UrlDecode(encodedSignature);
  if (!signature.ok) {
    return signature;
  }

  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  verifier.end();
  if (!verifier.verify(publicKey.value, signature.value)) {
    return err("invalid_token_signature", "JWT signature is invalid");
  }

  const claims = parseJsonObject(encodedPayload, "invalid_token_claim");
  if (!claims.ok) {
    return claims;
  }

  if (readStringClaim(claims.value, "iss") !== config.issuer) {
    return err("invalid_token_issuer", "JWT issuer is not trusted");
  }
  if (!hasAudience(claims.value["aud"], config.audience)) {
    return err("invalid_token_audience", "JWT audience is not accepted");
  }

  const subject = readStringClaim(claims.value, "sub");
  if (!subject || !subjectPattern.test(subject)) {
    return err("invalid_token_claim", "JWT subject is required");
  }

  const environment = readStringClaim(claims.value, "env");
  if (environment !== config.environment) {
    return err("invalid_token_environment", "JWT environment is not accepted");
  }

  const exp = readNumberClaim(claims.value, "exp");
  const nbf = readNumberClaim(claims.value, "nbf");
  if (exp === undefined) {
    return err("invalid_token_claim", "JWT exp is required");
  }
  if (nbf === undefined) {
    return err("invalid_token_claim", "JWT nbf is required");
  }

  const expiresAt = secondsToIsoString(exp);
  if (!expiresAt.ok) {
    return expiresAt;
  }
  const notBefore = secondsToIsoString(nbf);
  if (!notBefore.ok) {
    return notBefore;
  }

  if (clock.value.nowSeconds - clock.value.skewSeconds >= exp) {
    return err("token_expired", "JWT is expired");
  }
  if (clock.value.nowSeconds + clock.value.skewSeconds < nbf) {
    return err("token_not_yet_valid", "JWT is not yet valid");
  }

  const audience = readAudience(claims.value["aud"]);
  if (!audience) {
    return err("invalid_token_audience", "JWT audience is malformed");
  }

  return ok(
    Object.freeze({
      issuer: config.issuer,
      audience,
      subject,
      environment: config.environment,
      expiresAt: expiresAt.value,
      notBefore: notBefore.value,
    }),
  );
}

function uniqueSortedStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort());
}

function isActorRole(value: string): value is ActorRole {
  return isRbacRole(value);
}

export function isRbacRole(value: unknown): value is RbacRole {
  return rbacRoles.includes(value as RbacRole);
}

function roleCapabilities(role: ActorRole): readonly ControlPlaneCapability[] {
  return rbacRoleCapabilityMatrix[role];
}

function rolesCapabilities(
  roles: readonly ActorRole[],
): readonly ControlPlaneCapability[] {
  return uniqueSortedStrings(
    roles.flatMap((role) => roleCapabilities(role)),
  ) as readonly ControlPlaneCapability[];
}

function normalizeCapabilities(
  roles: readonly ActorRole[],
  restrictedCapabilities: readonly string[],
): AuthzResult<readonly ControlPlaneCapability[]> {
  const roleAllowed = rolesCapabilities(roles);
  if (
    !restrictedCapabilities.every((capability) =>
      allControlPlaneCapabilities.includes(
        capability as ControlPlaneCapability,
      ),
    )
  ) {
    return err("invalid_actor_membership", "membership capability is invalid");
  }

  if (restrictedCapabilities.length === 0) {
    return ok(roleAllowed);
  }

  return ok(
    uniqueSortedStrings(
      restrictedCapabilities.filter((capability) =>
        roleAllowed.includes(capability as ControlPlaneCapability),
      ),
    ) as readonly ControlPlaneCapability[],
  );
}

function normalizeMemberships(
  records: readonly ActorMembershipRecord[],
): AuthzResult<{
  readonly actorId: string;
  readonly workspaces: readonly ActorWorkspaceContext[];
}> {
  if (records.length === 0) {
    return err("subject_not_authorized", "OIDC subject has no memberships");
  }

  const actorId = records[0]?.actorId;
  if (!actorId || !opaqueActorIdPattern.test(actorId)) {
    return err("invalid_actor_membership", "membership actorId is invalid");
  }

  const byWorkspace = new Map<
    string,
    {
      readonly roles: Set<ActorRole>;
      readonly capabilities: Set<string>;
      readonly projects: Map<
        string,
        {
          readonly projectId: string;
          readonly environment: ProjectEnvironment;
          readonly roles: Set<ActorRole>;
          readonly capabilities: Set<string>;
        }
      >;
    }
  >();

  for (const record of records) {
    if (
      record.actorId !== actorId ||
      !opaqueActorIdPattern.test(record.actorId)
    ) {
      return err(
        "invalid_actor_membership",
        "membership actorId is inconsistent",
      );
    }
    if (!opaqueWorkspaceIdPattern.test(record.workspaceId)) {
      return err(
        "invalid_actor_membership",
        "membership workspaceId is invalid",
      );
    }
    if (!record.roles.every(isActorRole)) {
      return err("invalid_actor_membership", "membership role is invalid");
    }
    if (
      record.projectId !== undefined &&
      !opaqueProjectIdPattern.test(record.projectId)
    ) {
      return err("invalid_actor_membership", "membership projectId is invalid");
    }
    if (
      record.projectId !== undefined &&
      record.environment !== "development" &&
      record.environment !== "test" &&
      record.environment !== "production"
    ) {
      return err(
        "invalid_actor_membership",
        "project membership environment is invalid",
      );
    }
    if (record.projectId === undefined && record.environment !== undefined) {
      return err(
        "invalid_actor_membership",
        "workspace membership cannot carry project environment",
      );
    }

    const existing =
      byWorkspace.get(record.workspaceId) ??
      ({
        roles: new Set<ActorRole>(),
        capabilities: new Set<string>(),
        projects: new Map<
          string,
          {
            projectId: string;
            environment: ProjectEnvironment;
            roles: Set<ActorRole>;
            capabilities: Set<string>;
          }
        >(),
      } as const);

    if (record.projectId === undefined) {
      for (const role of record.roles) {
        existing.roles.add(role);
      }
      for (const capability of record.capabilities) {
        existing.capabilities.add(capability);
      }
    } else {
      const projectEnvironment = record.environment;
      if (projectEnvironment === undefined) {
        return err(
          "invalid_actor_membership",
          "project membership environment is invalid",
        );
      }
      const projectKey = `${record.projectId}:${projectEnvironment}`;
      const existingProject =
        existing.projects.get(projectKey) ??
        ({
          projectId: record.projectId,
          environment: projectEnvironment,
          roles: new Set<ActorRole>(),
          capabilities: new Set<string>(),
        } as const);
      for (const role of record.roles) {
        existingProject.roles.add(role);
      }
      for (const capability of record.capabilities) {
        existingProject.capabilities.add(capability);
      }
      existing.projects.set(projectKey, existingProject);
    }
    byWorkspace.set(record.workspaceId, existing);
  }

  const workspaces: ActorWorkspaceContext[] = [];
  for (const [workspaceId, membership] of [...byWorkspace.entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    const roles = uniqueSortedStrings([
      ...membership.roles,
    ]) as readonly ActorRole[];
    const capabilities = normalizeCapabilities(roles, [
      ...membership.capabilities,
    ]);
    if (!capabilities.ok) {
      return capabilities;
    }

    const projects: ActorProjectContext[] = [];
    for (const project of [...membership.projects.values()].sort(
      (left, right) =>
        `${left.projectId}:${left.environment}`.localeCompare(
          `${right.projectId}:${right.environment}`,
        ),
    )) {
      const projectRoles = uniqueSortedStrings([
        ...project.roles,
      ]) as readonly ActorRole[];
      const projectCapabilities = normalizeCapabilities(projectRoles, [
        ...project.capabilities,
      ]);
      if (!projectCapabilities.ok) {
        return projectCapabilities;
      }
      projects.push(
        Object.freeze({
          projectId: project.projectId,
          environment: project.environment,
          roles: projectRoles,
          capabilities: projectCapabilities.value,
        }),
      );
    }

    workspaces.push(
      Object.freeze({
        workspaceId,
        roles,
        capabilities: capabilities.value,
        projects: Object.freeze(projects),
      }),
    );
  }

  return ok({ actorId, workspaces: Object.freeze(workspaces) });
}

async function buildActorContext(
  identity: VerifiedOidcIdentity,
  resolver: ActorMembershipResolver,
): Promise<AuthzResult<ActorContext>> {
  let records: readonly ActorMembershipRecord[];
  try {
    records = await resolver.resolveMemberships(identity);
  } catch {
    return err(
      "identity_dependency_unavailable",
      "Identity dependency is unavailable",
    );
  }

  const memberships = normalizeMemberships(records);
  if (!memberships.ok) {
    return memberships;
  }

  return ok(
    Object.freeze({
      [actorContextBrand]: true as const,
      schemaVersion: "authz.actor-context.v1",
      actorId: memberships.value.actorId,
      identity: Object.freeze({
        issuer: identity.issuer,
        subject: identity.subject,
      }),
      environment: identity.environment,
      workspaces: memberships.value.workspaces,
    }),
  );
}

function capabilityAllowed(
  capabilities: readonly string[],
  capability: ControlPlaneCapability,
): boolean {
  return capabilities.includes(capability);
}

function denyNotFoundOrForbidden(): ControlPlaneAuthorizationDecision {
  return { allow: false, reason: "not_found_or_forbidden" };
}

function denyRoleGrant(): ControlPlaneRoleGrantDecision {
  return { allow: false, reason: "not_found_or_forbidden" };
}

export function authorizeControlPlane(
  actorContext: ActorContext,
  scope: ControlPlaneAuthorizationScope,
  capability: ControlPlaneCapability,
): ControlPlaneAuthorizationDecision {
  const workspace = actorContext.workspaces.find(
    (candidate) => candidate.workspaceId === scope.workspaceId,
  );
  if (!workspace) {
    return denyNotFoundOrForbidden();
  }

  if (!capabilityAllowed(workspace.capabilities, capability)) {
    return denyNotFoundOrForbidden();
  }

  if (scope.kind === "workspace") {
    return {
      allow: true,
      actorId: actorContext.actorId,
      capability,
      scope,
    };
  }

  const project = workspace.projects.find(
    (candidate) =>
      candidate.projectId === scope.projectId &&
      candidate.environment === scope.environment,
  );
  if (!project || !capabilityAllowed(project.capabilities, capability)) {
    return denyNotFoundOrForbidden();
  }

  return {
    allow: true,
    actorId: actorContext.actorId,
    capability,
    scope,
  };
}

function roleHasEveryCapability(
  effectiveCapabilities: readonly string[],
  nextRole: RbacRole,
): boolean {
  return rbacRoleCapabilityMatrix[nextRole].every((capability) =>
    effectiveCapabilities.includes(capability),
  );
}

function roleCanGrantByExplicitPolicy(
  callerRoles: readonly ActorRole[],
  nextRole: RbacRole,
): boolean {
  const callerRbacRoles = callerRoles.filter(isRbacRole);
  if (nextRole === "owner") {
    return callerRbacRoles.includes("owner");
  }
  return callerRbacRoles.includes("owner") || callerRbacRoles.includes("admin");
}

function hasEffectiveOwner(
  callerRoles: readonly ActorRole[],
  effectiveCapabilities: readonly string[],
): boolean {
  return (
    callerRoles.filter(isRbacRole).includes("owner") &&
    roleHasEveryCapability(effectiveCapabilities, "owner")
  );
}

export function authorizeControlPlaneRoleGrant(
  actorContext: ActorContext,
  scope: ControlPlaneAuthorizationScope,
  nextRole: RbacRole,
): ControlPlaneRoleGrantDecision {
  const requiredCapability =
    scope.kind === "workspace"
      ? controlPlaneCapabilities.workspaceMemberManage
      : controlPlaneCapabilities.projectMemberManage;
  const managementDecision = authorizeControlPlane(
    actorContext,
    scope,
    requiredCapability,
  );
  if (!managementDecision.allow) {
    return denyRoleGrant();
  }

  const workspace = actorContext.workspaces.find(
    (candidate) => candidate.workspaceId === scope.workspaceId,
  );
  if (!workspace) {
    return denyRoleGrant();
  }

  if (scope.kind === "workspace") {
    const manageExistingOwner = hasEffectiveOwner(
      workspace.roles,
      workspace.capabilities,
    );
    if (!roleCanGrantByExplicitPolicy(workspace.roles, nextRole)) {
      return denyRoleGrant();
    }
    if (!roleHasEveryCapability(workspace.capabilities, nextRole)) {
      return denyRoleGrant();
    }
    return {
      allow: true,
      actorId: actorContext.actorId,
      scope,
      nextRole,
      manageExistingOwner,
    };
  }

  const project = workspace.projects.find(
    (candidate) =>
      candidate.projectId === scope.projectId &&
      candidate.environment === scope.environment,
  );
  if (!project || !roleCanGrantByExplicitPolicy(project.roles, nextRole)) {
    return denyRoleGrant();
  }

  const effectiveProjectCapabilities = project.capabilities.filter(
    (capability) => workspace.capabilities.includes(capability),
  );
  const manageExistingOwner = hasEffectiveOwner(
    project.roles,
    effectiveProjectCapabilities,
  );
  if (!roleHasEveryCapability(effectiveProjectCapabilities, nextRole)) {
    return denyRoleGrant();
  }

  return {
    allow: true,
    actorId: actorContext.actorId,
    scope,
    nextRole,
    manageExistingOwner,
  };
}

export function isHighImpactActionKind(
  value: unknown,
): value is HighImpactActionKind {
  return highImpactActionKinds.includes(value as HighImpactActionKind);
}

export function highImpactTargetKindForAction(
  action: HighImpactActionKind,
): HighImpactTargetKind {
  switch (action) {
    case "credential.revoke":
      return "credential";
    case "deployment.pause":
    case "deployment.publish":
      return "deployment";
    case "scope.expand.data":
      return "data_scope";
    case "scope.expand.output":
      return "output_scope";
    case "service_version.retire":
      return "service_version";
  }
}

function cloneAuthorizationScope(
  scope: ControlPlaneAuthorizationScope,
): ControlPlaneAuthorizationScope {
  if (scope.kind === "workspace") {
    return Object.freeze({
      kind: "workspace" as const,
      workspaceId: scope.workspaceId,
    });
  }
  return Object.freeze({
    kind: "project" as const,
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    environment: scope.environment,
  });
}

function cloneHighImpactTarget(
  target: HighImpactActionTarget,
): HighImpactActionTarget {
  return Object.freeze({
    kind: target.kind,
    id: target.id,
    revision: target.revision,
  });
}

function authorizationScopesEqual(
  left: ControlPlaneAuthorizationScope,
  right: ControlPlaneAuthorizationScope,
): boolean {
  if (left.kind !== right.kind || left.workspaceId !== right.workspaceId) {
    return false;
  }
  if (left.kind === "workspace") {
    return true;
  }
  return (
    right.kind === "project" &&
    left.projectId === right.projectId &&
    left.environment === right.environment
  );
}

function highImpactTargetsEqual(
  left: HighImpactActionTarget,
  right: HighImpactActionTarget,
): boolean {
  return (
    left.kind === right.kind &&
    left.id === right.id &&
    left.revision === right.revision
  );
}

function isValidHighImpactTarget(target: HighImpactActionTarget): boolean {
  return (
    highImpactTargetIdPattern.test(target.id) &&
    Number.isSafeInteger(target.revision) &&
    target.revision >= 1
  );
}

export function validateStepUpIntentClaims(
  input: StepUpIntentValidationInput,
): AuthzResult<StepUpIntentClaims> {
  const { claims, actorContext, action, scope, target } = input;
  if (
    !isHighImpactActionKind(action) ||
    !isHighImpactActionKind(claims.action)
  ) {
    return err("invalid_step_up_intent", "step-up action is invalid");
  }
  if (!intentIdPattern.test(claims.intentId)) {
    return err("invalid_step_up_intent", "step-up intent id is invalid");
  }
  if (
    claims.actorId !== actorContext.actorId ||
    claims.action !== action ||
    !authorizationScopesEqual(claims.scope, scope) ||
    !highImpactTargetsEqual(claims.target, target)
  ) {
    return err(
      "invalid_step_up_intent",
      "step-up intent is not bound to this action",
    );
  }
  if (
    target.kind !== highImpactTargetKindForAction(action) ||
    claims.target.kind !== highImpactTargetKindForAction(action) ||
    !isValidHighImpactTarget(target) ||
    !isValidHighImpactTarget(claims.target)
  ) {
    return err("invalid_step_up_intent", "step-up target is invalid");
  }

  const now = input.now?.() ?? new Date();
  const nowMilliseconds = now.getTime();
  if (!Number.isFinite(nowMilliseconds)) {
    return err("invalid_step_up_intent", "step-up verifier clock is invalid");
  }
  const authenticatedAt = parseIsoInstant(claims.authenticatedAt);
  if (!authenticatedAt.ok) {
    return err("invalid_step_up_intent", "step-up auth time is invalid");
  }
  const issuedAt = parseIsoInstant(claims.issuedAt);
  if (!issuedAt.ok) {
    return err("invalid_step_up_intent", "step-up issue time is invalid");
  }
  const expiresAt = parseIsoInstant(claims.expiresAt);
  if (!expiresAt.ok) {
    return err("invalid_step_up_intent", "step-up expiry is invalid");
  }

  const maxAuthenticationAgeSeconds =
    input.maxAuthenticationAgeSeconds ??
    defaultStepUpMaxAuthenticationAgeSeconds;
  const maxIntentLifetimeSeconds =
    input.maxIntentLifetimeSeconds ?? defaultStepUpMaxIntentLifetimeSeconds;
  if (
    !Number.isSafeInteger(maxAuthenticationAgeSeconds) ||
    maxAuthenticationAgeSeconds < 0 ||
    maxAuthenticationAgeSeconds > defaultStepUpMaxAuthenticationAgeSeconds ||
    !Number.isSafeInteger(maxIntentLifetimeSeconds) ||
    maxIntentLifetimeSeconds <= 0 ||
    maxIntentLifetimeSeconds > defaultStepUpMaxIntentLifetimeSeconds
  ) {
    return err("invalid_step_up_intent", "step-up freshness policy is invalid");
  }

  if (
    authenticatedAt.value > nowMilliseconds ||
    issuedAt.value > nowMilliseconds
  ) {
    return err("invalid_step_up_intent", "step-up intent is not yet valid");
  }
  if (issuedAt.value < authenticatedAt.value) {
    return err("invalid_step_up_intent", "step-up intent predates auth");
  }
  if (
    nowMilliseconds - authenticatedAt.value >
    maxAuthenticationAgeSeconds * 1000
  ) {
    return err("step_up_intent_expired", "step-up authentication is stale");
  }
  if (expiresAt.value <= nowMilliseconds) {
    return err("step_up_intent_expired", "step-up intent expired");
  }
  if (
    expiresAt.value <= issuedAt.value ||
    expiresAt.value - issuedAt.value > maxIntentLifetimeSeconds * 1000
  ) {
    return err("invalid_step_up_intent", "step-up intent lifetime is invalid");
  }

  return ok(
    Object.freeze({
      intentId: claims.intentId,
      actorId: claims.actorId,
      action: claims.action,
      scope: cloneAuthorizationScope(claims.scope),
      target: cloneHighImpactTarget(claims.target),
      authenticatedAt: claims.authenticatedAt,
      issuedAt: claims.issuedAt,
      expiresAt: claims.expiresAt,
    }),
  );
}

export function createOidcActorAuthenticator(
  config: OidcVerifierConfig,
  resolver: ActorMembershipResolver,
): BearerTokenAuthenticator {
  return {
    async authenticateBearerToken(token) {
      try {
        const identity = verifyOidcToken(token, config);
        if (!identity.ok) {
          return identity;
        }
        return await buildActorContext(identity.value, resolver);
      } catch {
        return err(
          "identity_dependency_unavailable",
          "Identity dependency is unavailable",
        );
      }
    },
  };
}

function createJwt(
  header: Readonly<Record<string, unknown>>,
  payload: Readonly<Record<string, unknown>>,
  privateKey: KeyObject,
): string {
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signer = createSign("RSA-SHA256");
  signer.update(`${encodedHeader}.${encodedPayload}`);
  signer.end();
  const signature = signer.sign(privateKey);
  return `${encodedHeader}.${encodedPayload}.${base64UrlEncode(signature)}`;
}

export function createDevelopmentIdentityProvider(input: {
  readonly enabled: boolean;
  readonly runtimeEnvironment: RuntimeEnvironment;
  readonly issuer?: string;
  readonly audience?: string;
  readonly environment?: RuntimeEnvironment;
  readonly tokenTtlSeconds?: number;
}): DevelopmentIdentityProvider | undefined {
  if (!input.enabled) {
    return undefined;
  }
  if (input.runtimeEnvironment !== "development") {
    throw new Error(
      "development identity provider can only be enabled in development",
    );
  }

  const issuer = input.issuer ?? "http://127.0.0.1:8787/dev-idp";
  const audience = input.audience ?? "modular-mcp-control-api";
  const environment = input.environment ?? input.runtimeEnvironment;
  if (environment !== "development") {
    throw new Error(
      "development identity provider can only issue development tokens",
    );
  }
  const tokenTtlSeconds = input.tokenTtlSeconds ?? 900;
  const kid = `dev-${randomUUID()}`;
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicExponent: 0x10001,
  });
  const jwk = publicKey.export({ format: "jwk" }) as JsonWebKey;
  const publicJwk = Object.freeze({
    ...jwk,
    kid,
    alg: "RS256",
    kty: "RSA",
    use: "sig",
  } as OidcJwk);

  return Object.freeze({
    issuer,
    audience,
    environment,
    jwks: Object.freeze([publicJwk]),
    issueToken(tokenInput: DevelopmentTokenInput) {
      if (!subjectPattern.test(tokenInput.subject)) {
        throw new Error("development token subject is invalid");
      }
      for (const claim of Object.keys(tokenInput.additionalClaims ?? {})) {
        if (protectedDevelopmentClaims.has(claim)) {
          throw new Error(
            "development token additionalClaims cannot override registered JWT claims",
          );
        }
      }

      const now = Math.floor(Date.now() / 1000);
      const notBefore = now + (tokenInput.notBeforeOffsetSeconds ?? 0);
      const expiresIn = tokenInput.expiresInSeconds ?? tokenTtlSeconds;
      const claims = {
        iss: issuer,
        aud: audience,
        sub: tokenInput.subject,
        env: environment,
        iat: now,
        nbf: notBefore,
        exp: now + expiresIn,
        ...tokenInput.additionalClaims,
      };

      return createJwt({ ...jwtHeader, kid }, claims, privateKey);
    },
  });
}

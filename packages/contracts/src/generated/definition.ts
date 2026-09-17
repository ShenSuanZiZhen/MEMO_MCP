/* eslint-disable */
// Generated from packages/contracts/schema-registry/v1/definition.v1.schema.json. Do not edit by hand.

type OpaqueId = string;

type UtcDateTime = string;

type Sha256Digest = string;

type ExactVersion = string;

type Environment = "development" | "test" | "production";

type ModuleType = "source" | "capability" | "output" | "prompt";

type RiskLevel = "low" | "medium" | "high";

interface EffectiveLimits {
  requestsPerMinute: number;
  maxConcurrency: number;
  timeoutMs: number;
  maxResults: number;
  maxSections: number;
  maxResponseBytes: number;
}

export interface ServiceDefinition {
  metadata: {
    schemaVersion: "definition.v1";
    serviceId: OpaqueId;
    version: ExactVersion;
    environment: Environment;
  };
  identity: { workspaceId: OpaqueId; projectId: OpaqueId };
  dataBindings: Array<{
    sourceId: OpaqueId;
    dataVersionId: OpaqueId;
    dataVersionDigest: Sha256Digest;
    allowedScopes: Array<string>;
  }>;
  modules: Array<{
    moduleId: string;
    exactVersion: ExactVersion;
    artifactDigest: Sha256Digest;
    normalizedConfig: Record<string, unknown>;
  }>;
  capabilities: {
    tools: Array<string>;
    resources: Array<string>;
    prompts: Array<string>;
  };
  policy: {
    policyVersionId: OpaqueId;
    policyDigest: Sha256Digest;
    audience: string;
    grants: Array<string>;
    timeConstraints?: Array<string>;
    networkConstraints?: Array<string>;
  };
  limits: EffectiveLimits;
  outputPolicy: {
    allowedFields: Array<string>;
    redactions: Array<string>;
    citations: boolean;
  };
  runtime: { builderVersion: ExactVersion; protocolVersion: "mcp.2025-06-18" };
}

export interface ModuleManifest {
  id: string;
  version: ExactVersion;
  type: ModuleType;
  apiVersion: "studio.mcp/v1";
  implementation: string;
  requires: Array<string>;
  conflicts: Array<string>;
  provides: Array<string>;
  configSchemaRef?: string;
  inputSchemaRef?: string;
  outputSchemaRef?: string;
  permissions: Array<string>;
  risk: RiskLevel;
  limits: EffectiveLimits;
  artifactDigest: Sha256Digest;
  signature: { keyId: string; value: string };
}

export interface PolicyInput {
  actor: { actorId: OpaqueId; roles: Array<string> };
  credential: {
    credentialId: OpaqueId;
    kind: "api_key" | "oauth_client";
    status: "active" | "rotating" | "revoked" | "expired";
    scopes: Array<string>;
  };
  workspaceId: OpaqueId;
  projectId: OpaqueId;
  environment: Environment;
  serviceVersion: ExactVersion;
  capability: string;
  dataScope: Array<string>;
  network: { source: string };
  time: UtcDateTime;
  serviceState: "healthy" | "degraded" | "suspended" | "retired";
}

export interface PolicyDecision {
  allow: boolean;
  reason: string;
  effectiveScopes: Array<string>;
  effectiveLimits: EffectiveLimits;
  policyVersion: OpaqueId;
  decisionId: OpaqueId;
}

export interface DomainEvent {
  eventId: OpaqueId;
  eventType: string;
  occurredAt: UtcDateTime;
  workspaceId: OpaqueId;
  projectId: OpaqueId;
  aggregateId: OpaqueId;
  aggregateVersion: number;
  traceId: string;
  idempotencyKey: string;
  data: { refs: Array<{ kind: string; id: OpaqueId; digest: Sha256Digest }> };
}

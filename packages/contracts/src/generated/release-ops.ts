/* eslint-disable */
// Generated from packages/contracts/openapi/release-ops.v1.json. Do not edit by hand.

import type {
  AcceptedJobResponse,
  Cursor,
  ErrorEnvelope,
  Job,
  OpaqueId,
  PageInfo as CommonPageInfo,
  RequestId,
  TraceId,
  UtcDateTime,
} from "./common.js";

export type Sha256Digest = string;

export type ReleaseEnvironment = "development" | "test" | "production";

export interface DefinitionRef {
  definitionId: OpaqueId;
  digest: Sha256Digest;
}

export type ConsumerScenario =
  | "anonymous"
  | "authenticated_denied"
  | "authorized"
  | "tool_denied"
  | "quota_exceeded"
  | "credential_expired"
  | "service_suspended";

export type PreviewView = "owner" | "consumer" | "client";

export interface OwnerPreviewResponse {
  definition: DefinitionRef;
  warnings: Array<string>;
  blockingIssues: Array<string>;
}

export interface ConsumerPreviewResponse {
  definition: DefinitionRef;
  scenario: ConsumerScenario;
  visibleCapabilities: Array<string>;
  nextAction: string;
}

export interface ClientPreviewResponse {
  definition: DefinitionRef;
  serverName: string;
  tools: Array<string>;
  resources: Array<string>;
  prompts: Array<string>;
}

export interface PreviewConfirmationRequest {
  definition: DefinitionRef;
  confirmedViews: Array<PreviewView>;
}

export interface PreviewConfirmationResponse {
  definition: DefinitionRef;
  confirmedViews: Array<PreviewView>;
  confirmedAt: UtcDateTime;
}

export type TestMode = "quick" | "full" | "custom";

export type TestStatus =
  | "accepted"
  | "running"
  | "passed"
  | "failed"
  | "cancelled";

export interface StartTestRunRequest {
  definition: DefinitionRef;
  mode: TestMode;
}

export interface TestRunResponse {
  testRunId: OpaqueId;
  definition: DefinitionRef;
  mode: TestMode;
  status: TestStatus;
  passed: number;
  failed: number;
}

export interface TestReportResponse {
  testReportId: OpaqueId;
  definition: DefinitionRef;
  result: "passed" | "failed";
  securityLogRef: OpaqueId;
  createdAt: UtcDateTime;
}

export type CandidateStatus =
  | "submitted"
  | "changes_requested"
  | "materials_required"
  | "rejected"
  | "approved"
  | "withdrawn";

export interface SubmitCandidateRequest {
  definition: DefinitionRef;
  version: string;
  releaseNotes: string;
  checklist: Array<string>;
}

export interface CandidateResponse {
  candidateId: OpaqueId;
  definition: DefinitionRef;
  version: string;
  status: CandidateStatus;
  submittedAt: UtcDateTime;
}

export interface ReviewCandidateRequest {
  decision:
    | "approved"
    | "changes_requested"
    | "materials_required"
    | "rejected"
    | "withdrawn";
  comments: string;
}

export interface DeployCandidateRequest {
  definition: DefinitionRef;
}

export type DeploymentStatus =
  | "provisioning"
  | "healthy"
  | "degraded"
  | "draining"
  | "suspended"
  | "stopped"
  | "blocked";

export interface DeploymentResponse {
  deploymentId: OpaqueId;
  definition: DefinitionRef;
  status: DeploymentStatus;
  stage?:
    | "build"
    | "bind_data"
    | "start_instance"
    | "load_version"
    | "health_check"
    | "verify_capabilities"
    | "open_endpoint"
    | "completed";
}

export interface PublishDeploymentRequest {
  definition: DefinitionRef;
  serviceVersion: string;
  stepUpToken: string;
  reason: string;
  impact: string;
  recoveryPlan: string;
}

export interface ServiceReleaseResponse {
  serviceId: OpaqueId;
  serviceVersion: string;
  status: ServiceVersionStatus;
  environment: ReleaseEnvironment;
  definition: DefinitionRef;
  mcpUrl: string;
}

export type CredentialKind = "api_key" | "oauth_client";

export type CredentialStatus = "active" | "rotating" | "revoked" | "expired";

export interface CreateCredentialRequest {
  kind: CredentialKind;
  displayName: string;
  scopes: Array<string>;
  expiresAt?: UtcDateTime;
}

export interface CredentialSummaryResponse {
  credentialId: OpaqueId;
  kind: CredentialKind;
  displayName: string;
  environment: ReleaseEnvironment;
  prefix: string;
  lastFour: string;
  status: CredentialStatus;
  createdAt: UtcDateTime;
}

export interface CreateCredentialResponse {
  credential: CredentialSummaryResponse;
  oneTimeSecret: string;
}

export interface CredentialListResponse {
  items: Array<CredentialSummaryResponse>;
  pageInfo: CommonPageInfo;
}

export interface OperationsSummaryResponse {
  serviceId: OpaqueId;
  environment: ReleaseEnvironment;
  serviceVersionStatus: ServiceVersionStatus;
  deploymentStatus: DeploymentStatus;
  calls: number;
  errors: number;
  p95Ms: number;
}

export interface TraceStage {
  stage:
    | "authn"
    | "authz"
    | "quota"
    | "data"
    | "capability"
    | "output"
    | "response";
  status: "passed" | "denied" | "failed";
  durationMs: number;
  errorCode?: string;
}

export interface RequestTraceResponse {
  traceId: TraceId;
  requestId: RequestId;
  startedAt: UtcDateTime;
  stages: Array<TraceStage>;
}

export interface TraceListResponse {
  items: Array<RequestTraceResponse>;
  pageInfo: CommonPageInfo;
}

export interface HighImpactActionRequest {
  stepUpToken: string;
  reason: string;
  impact: string;
  recoveryPlan: string;
}

export interface HighImpactActionResponse {
  actionId: OpaqueId;
  status: "accepted" | "applied" | "failed";
  requestedAt: UtcDateTime;
}

export interface AdminAuditEventResponse {
  auditEventId: OpaqueId;
  eventType: string;
  occurredAt: UtcDateTime;
  actorId: OpaqueId;
}

export interface AdminAuditEventListResponse {
  items: Array<AdminAuditEventResponse>;
  pageInfo: CommonPageInfo;
}

export type ServiceVersionStatus =
  | "approved"
  | "deploying"
  | "published"
  | "suspended"
  | "retired";

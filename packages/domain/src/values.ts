import { err, ok, type DomainResult } from "./result.js";

export const OPAQUE_ID_PATTERN = "^[a-z][a-z0-9]*_[A-Za-z0-9_-]{8,128}$";
export const EXACT_VERSION_PATTERN =
  "^\\d+\\.\\d+\\.\\d+(?:[-+][0-9A-Za-z.-]+)?$";
export const ENVIRONMENTS = ["development", "test", "production"] as const;

const publicIdRegExp = new RegExp(OPAQUE_ID_PATTERN);
const exactVersionRegExp = new RegExp(EXACT_VERSION_PATTERN);

export interface OpaqueValue<Kind extends string> {
  readonly kind: Kind;
  readonly value: string;
}

export interface ExactVersionValue<Kind extends string> {
  readonly kind: Kind;
  readonly value: string;
}

export interface RevisionValue<Kind extends string> {
  readonly kind: Kind;
  readonly value: number;
}

export type Environment = (typeof ENVIRONMENTS)[number];

export type ActorId = OpaqueValue<"ActorId">;
export type WorkspaceId = OpaqueValue<"WorkspaceId">;
export type ProjectId = OpaqueValue<"ProjectId">;
export type DataSourceId = OpaqueValue<"DataSourceId">;
export type DataVersionId = OpaqueValue<"DataVersionId">;
export type DraftId = OpaqueValue<"DraftId">;
export type ModuleId = OpaqueValue<"ModuleId">;
export type DefinitionId = OpaqueValue<"DefinitionId">;
export type CandidateId = OpaqueValue<"CandidateId">;
export type ServiceId = OpaqueValue<"ServiceId">;
export type ServiceVersionId = OpaqueValue<"ServiceVersionId">;
export type DeploymentId = OpaqueValue<"DeploymentId">;
export type UploadId = OpaqueValue<"UploadId">;
export type AccessPolicyId = OpaqueValue<"AccessPolicyId">;
export type PolicyVersionId = OpaqueValue<"PolicyVersionId">;
export type CredentialId = OpaqueValue<"CredentialId">;
export type AuditRecordId = OpaqueValue<"AuditRecordId">;

export type WorkspaceRevision = RevisionValue<"WorkspaceRevision">;
export type ProjectRevision = RevisionValue<"ProjectRevision">;
export type DataSourceRevision = RevisionValue<"DataSourceRevision">;
export type DraftRevision = RevisionValue<"DraftRevision">;
export type CredentialRevision = RevisionValue<"CredentialRevision">;

export type ModuleVersion = ExactVersionValue<"ModuleVersion">;
export type DefinitionVersion = ExactVersionValue<"DefinitionVersion">;
export type CandidateVersion = ExactVersionValue<"CandidateVersion">;
export type ReleaseVersion = ExactVersionValue<"ReleaseVersion">;

export interface PlatformScope {
  readonly kind: "platform";
}

export interface ProjectEnvironmentScope {
  readonly workspaceId: WorkspaceId;
  readonly projectId: ProjectId;
  readonly environment: Environment;
}

export interface ProjectScope extends ProjectEnvironmentScope {
  readonly kind: "project";
}

export type DomainScope = PlatformScope | ProjectScope;

export const platformScope = (): PlatformScope => ({ kind: "platform" });

export const projectScope = (scope: ProjectEnvironmentScope): ProjectScope => ({
  kind: "project",
  workspaceId: scope.workspaceId,
  projectId: scope.projectId,
  environment: scope.environment,
});

export function isSameDomainScope(
  left: DomainScope,
  right: DomainScope,
): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  if (left.kind === "platform" && right.kind === "platform") {
    return true;
  }
  return (
    left.kind === "project" &&
    right.kind === "project" &&
    left.workspaceId.value === right.workspaceId.value &&
    left.projectId.value === right.projectId.value &&
    left.environment === right.environment
  );
}

function createOpaqueValue<Kind extends string>(
  kind: Kind,
  value: string,
): DomainResult<OpaqueValue<Kind>> {
  if (!publicIdRegExp.test(value)) {
    return err("INVALID_VALUE", `${kind} must match the public OpaqueId`, {
      kind,
    });
  }
  return ok({ kind, value });
}

function createExactVersion<Kind extends string>(
  kind: Kind,
  value: string,
): DomainResult<ExactVersionValue<Kind>> {
  if (!exactVersionRegExp.test(value)) {
    return err("INVALID_VALUE", `${kind} must be an exact SemVer`, {
      kind,
    });
  }
  return ok({ kind, value });
}

function createRevision<Kind extends string>(
  kind: Kind,
  value: number,
): DomainResult<RevisionValue<Kind>> {
  if (!Number.isSafeInteger(value) || value < 1) {
    return err("INVALID_VALUE", `${kind} must be a positive safe integer`, {
      kind,
    });
  }
  return ok({ kind, value });
}

export const environment = (value: string): DomainResult<Environment> =>
  ENVIRONMENTS.includes(value as Environment)
    ? ok(value as Environment)
    : err("INVALID_VALUE", "Environment must be canonical", {
        kind: "Environment",
      });

export const actorId = (value: string): DomainResult<ActorId> =>
  createOpaqueValue("ActorId", value);
export const workspaceId = (value: string): DomainResult<WorkspaceId> =>
  createOpaqueValue("WorkspaceId", value);
export const projectId = (value: string): DomainResult<ProjectId> =>
  createOpaqueValue("ProjectId", value);
export const dataSourceId = (value: string): DomainResult<DataSourceId> =>
  createOpaqueValue("DataSourceId", value);
export const dataVersionId = (value: string): DomainResult<DataVersionId> =>
  createOpaqueValue("DataVersionId", value);
export const draftId = (value: string): DomainResult<DraftId> =>
  createOpaqueValue("DraftId", value);
export const moduleId = (value: string): DomainResult<ModuleId> =>
  createOpaqueValue("ModuleId", value);
export const definitionId = (value: string): DomainResult<DefinitionId> =>
  createOpaqueValue("DefinitionId", value);
export const candidateId = (value: string): DomainResult<CandidateId> =>
  createOpaqueValue("CandidateId", value);
export const serviceId = (value: string): DomainResult<ServiceId> =>
  createOpaqueValue("ServiceId", value);
export const serviceVersionId = (
  value: string,
): DomainResult<ServiceVersionId> =>
  createOpaqueValue("ServiceVersionId", value);
export const deploymentId = (value: string): DomainResult<DeploymentId> =>
  createOpaqueValue("DeploymentId", value);
export const uploadId = (value: string): DomainResult<UploadId> =>
  createOpaqueValue("UploadId", value);
export const accessPolicyId = (value: string): DomainResult<AccessPolicyId> =>
  createOpaqueValue("AccessPolicyId", value);
export const policyVersionId = (value: string): DomainResult<PolicyVersionId> =>
  createOpaqueValue("PolicyVersionId", value);
export const credentialId = (value: string): DomainResult<CredentialId> =>
  createOpaqueValue("CredentialId", value);
export const auditRecordId = (value: string): DomainResult<AuditRecordId> =>
  createOpaqueValue("AuditRecordId", value);

export const workspaceRevision = (
  value: number,
): DomainResult<WorkspaceRevision> =>
  createRevision("WorkspaceRevision", value);
export const projectRevision = (value: number): DomainResult<ProjectRevision> =>
  createRevision("ProjectRevision", value);
export const dataSourceRevision = (
  value: number,
): DomainResult<DataSourceRevision> =>
  createRevision("DataSourceRevision", value);
export const draftRevision = (value: number): DomainResult<DraftRevision> =>
  createRevision("DraftRevision", value);
export const credentialRevision = (
  value: number,
): DomainResult<CredentialRevision> =>
  createRevision("CredentialRevision", value);

export const moduleVersion = (value: string): DomainResult<ModuleVersion> =>
  createExactVersion("ModuleVersion", value);
export const definitionVersion = (
  value: string,
): DomainResult<DefinitionVersion> =>
  createExactVersion("DefinitionVersion", value);
export const candidateVersion = (
  value: string,
): DomainResult<CandidateVersion> =>
  createExactVersion("CandidateVersion", value);
export const releaseVersion = (value: string): DomainResult<ReleaseVersion> =>
  createExactVersion("ReleaseVersion", value);

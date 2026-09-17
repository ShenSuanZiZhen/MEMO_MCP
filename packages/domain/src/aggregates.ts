import type {
  AccessPolicyId,
  CandidateId,
  CandidateVersion,
  CredentialId,
  CredentialRevision,
  DataSourceId,
  DataSourceRevision,
  DataVersionId,
  DefinitionId,
  DefinitionVersion,
  DeploymentId,
  DraftId,
  DraftRevision,
  ModuleId,
  ModuleVersion,
  PlatformScope,
  PolicyVersionId,
  ProjectId,
  ProjectScope,
  ProjectRevision,
  ReleaseVersion,
  ServiceId,
  ServiceVersionId,
  WorkspaceId,
  WorkspaceRevision,
} from "./values.js";
import type {
  CandidateState,
  CredentialState,
  DeploymentState,
  DraftState,
  ModuleVersionState,
  ServiceVersionState,
  UploadState,
} from "./state-machines.js";

export interface WorkspaceAggregate {
  readonly id: WorkspaceId;
  readonly revision: WorkspaceRevision;
  readonly status: "active" | "archived";
}

export interface ProjectAggregate {
  readonly id: ProjectId;
  readonly workspaceId: WorkspaceId;
  readonly revision: ProjectRevision;
  readonly status: "active" | "archived";
}

export interface DataSourceAggregate {
  readonly id: DataSourceId;
  readonly scope: ProjectScope;
  readonly revision: DataSourceRevision;
}

export interface DataVersionAggregate {
  readonly id: DataVersionId;
  readonly dataSourceId: DataSourceId;
  readonly scope: ProjectScope;
  readonly state: UploadState;
  readonly immutable: true;
}

export interface DraftAggregate {
  readonly id: DraftId;
  readonly scope: ProjectScope;
  readonly revision: DraftRevision;
  readonly state: DraftState;
}

export interface ModuleVersionAggregate {
  readonly moduleId: ModuleId;
  readonly scope: PlatformScope;
  readonly version: ModuleVersion;
  readonly state: ModuleVersionState;
  readonly artifactDigest: string;
  readonly signatureRef: string;
}

export interface ServiceDefinitionAggregate {
  readonly id: DefinitionId;
  readonly scope: ProjectScope;
  readonly version: DefinitionVersion;
  readonly digest: string;
  readonly immutable: true;
}

export interface CandidateAggregate {
  readonly candidateId: CandidateId;
  readonly scope: ProjectScope;
  readonly definitionId: DefinitionId;
  readonly version: CandidateVersion;
  readonly state: CandidateState;
  readonly frozen: true;
}

export interface ServiceReleaseAggregate {
  readonly serviceId: ServiceId;
  readonly serviceVersionId: ServiceVersionId;
  readonly scope: ProjectScope;
  readonly version: ReleaseVersion;
  readonly definitionId: DefinitionId;
  readonly state: ServiceVersionState;
}

export interface DeploymentAggregate {
  readonly id: DeploymentId;
  readonly scope: ProjectScope;
  readonly serviceVersionId: ServiceVersionId;
  readonly state: DeploymentState;
}

export interface AccessPolicyAggregate {
  readonly id: AccessPolicyId;
  readonly scope: ProjectScope;
  readonly policyVersionId: PolicyVersionId;
}

export interface CredentialAggregate {
  readonly id: CredentialId;
  readonly scope: ProjectScope;
  readonly serviceId: ServiceId;
  readonly accessPolicyId: AccessPolicyId;
  readonly revision: CredentialRevision;
  readonly state: CredentialState;
}

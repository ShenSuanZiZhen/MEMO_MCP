/* eslint-disable */
// Generated from packages/contracts/openapi/control-plane.v1.json. Do not edit by hand.

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

export type Environment = "development" | "test" | "production";

export type WorkspaceKind = "personal" | "team";

export type ProjectStatus = "active" | "archived";

export type DraftStatus =
  | "editing"
  | "validating"
  | "ready"
  | "building"
  | "built"
  | "submitted";

export type WizardStep =
  | "goal"
  | "data"
  | "modules"
  | "configuration"
  | "preview"
  | "test"
  | "publish";

export type DataSourceKind =
  | "file_upload"
  | "http_api"
  | "object_storage"
  | "readonly_database";

export type Sensitivity = "public" | "internal" | "confidential";

export type VersionStrategy =
  | "fixed"
  | "manual_confirm_before_publish"
  | "controlled_follow";

export type DataVersionStatus =
  | "created"
  | "uploading"
  | "uploaded"
  | "processing"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled"
  | "expired";

export type ProcessingStage =
  | "upload"
  | "security_scan"
  | "format_detect"
  | "parse"
  | "normalize"
  | "chunk"
  | "index"
  | "completed";

export type ModuleKind = "source" | "capability" | "output" | "prompt";

export type ReviewStatus =
  | "testing"
  | "submitted"
  | "approved"
  | "deprecated"
  | "blocked";

export interface WorkspaceResponse {
  workspaceId: OpaqueId;
  kind: WorkspaceKind;
  displayName: string;
  region?: string;
  createdAt: UtcDateTime;
  updatedAt: UtcDateTime;
}

export interface WorkspaceListResponse {
  items: Array<WorkspaceResponse>;
  pageInfo: CommonPageInfo;
}

export interface CreateWorkspaceRequest {
  kind: WorkspaceKind;
  displayName: string;
  region?: string;
  purpose?: string;
}

export interface ProjectResponse {
  projectId: OpaqueId;
  workspaceId: OpaqueId;
  name: string;
  description?: string;
  defaultRegion: string;
  defaultEnvironment: Environment;
  status: ProjectStatus;
  createdAt: UtcDateTime;
  updatedAt: UtcDateTime;
}

export interface ProjectListResponse {
  items: Array<ProjectResponse>;
  pageInfo: CommonPageInfo;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  defaultRegion: string;
  defaultEnvironment: Environment;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
}

export interface GoalSelection {
  description: string;
  audience: string;
  prohibitedUses: Array<string>;
  capabilities: Array<
    | "browse_catalog"
    | "view_metadata"
    | "search_content"
    | "read_sections"
    | "verify_citation"
  >;
}

export interface DraftResponse {
  draftId: OpaqueId;
  projectId: OpaqueId;
  environment: Environment;
  name: string;
  status: DraftStatus;
  revision: number;
  currentStep: WizardStep;
  goal?: GoalSelection;
  updatedAt: UtcDateTime;
}

export interface DraftListResponse {
  items: Array<DraftResponse>;
  pageInfo: CommonPageInfo;
}

export interface CreateDraftRequest {
  creationMode: "blank" | "template" | "copy_version";
  templateId?: string;
  sourceVersionId?: OpaqueId;
  name: string;
  goal?: GoalSelection;
}

export interface UpdateDraftRequest {
  revision: number;
  currentStep?: WizardStep;
  patch: Record<string, unknown>;
}

export interface DataSourceResponse {
  dataSourceId: OpaqueId;
  projectId: OpaqueId;
  environment: Environment;
  kind: DataSourceKind;
  displayName: string;
  sensitivity: Sensitivity;
  versionStrategy: VersionStrategy;
  credentialPreview?: CredentialPreview;
  createdAt: UtcDateTime;
  updatedAt: UtcDateTime;
}

export interface CredentialPreview {
  authType:
    | "none"
    | "api_key"
    | "bearer"
    | "basic"
    | "oauth_client"
    | "readonly_database";
  lastFour: string;
  updatedAt: UtcDateTime;
}

export interface DataSourceListResponse {
  items: Array<DataSourceResponse>;
  pageInfo: CommonPageInfo;
}

export interface CreateDataSourceRequest {
  kind: DataSourceKind;
  displayName: string;
  sensitivity: Sensitivity;
  rights: string;
  versionStrategy: VersionStrategy;
}

export interface StartDataVersionProcessingRequest {
  expectedFileCount?: number;
}

export interface DataVersionResponse {
  dataVersionId: OpaqueId;
  dataSourceId: OpaqueId;
  environment: Environment;
  status: DataVersionStatus;
  processingStage: ProcessingStage;
  createdAt: UtcDateTime;
  completedAt?: UtcDateTime;
  error?: ErrorEnvelope;
}

export interface ModuleSummary {
  moduleId: string;
  moduleVersion: string;
  kind: ModuleKind;
  displayName: string;
  riskLevel: "low" | "medium" | "high";
  reviewStatus: ReviewStatus;
  capabilities: Array<string>;
}

export interface ModuleListResponse {
  items: Array<ModuleSummary>;
  pageInfo: CommonPageInfo;
}

export interface ModuleVersionResponse {
  moduleId: string;
  moduleVersion: string;
  kind: ModuleKind;
  displayName: string;
  riskLevel: "low" | "medium" | "high";
  reviewStatus: ReviewStatus;
  capabilities: Array<string>;
  dependencies: Array<string>;
  conflicts?: Array<string>;
}

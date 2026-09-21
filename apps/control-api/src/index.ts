import { createHash, createHmac, randomBytes } from "node:crypto";
import type {
  ActorContext,
  AuthzResult,
  ControlPlaneAuthorizationDecision,
  ControlPlaneAuthorizationScope,
  ControlPlaneCapability,
  ControlPlaneRoleGrantDecision,
  HighImpactActionKind,
  HighImpactActionTarget,
  RbacRole,
  StepUpIntentClaims,
} from "@modular-mcp/authz";
import {
  controlPlaneCapabilities,
  highImpactActionCapabilityMatrix,
  isHighImpactActionKind,
  isRbacRole,
  validateStepUpIntentClaims,
} from "@modular-mcp/authz";

export const appKind = "control-api" as const;

const uploadIdPattern =
  /^upl_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const draftIdPattern =
  /^drf_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const dataSourceIdPattern =
  /^ds_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const dataVersionIdPattern =
  /^dv_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const sha256DigestPattern = /^sha256:[a-f0-9]{64}$/;

export const multipartUploadDefaults = {
  maxSingleFileBytes: 100 * 1024 * 1024,
  maxFilesPerDraft: 20,
  maxDraftTotalBytes: 500 * 1024 * 1024,
  maxPartCount: 10_000,
  partUrlTtlSeconds: 15 * 60,
  uploadTtlSeconds: 24 * 60 * 60,
} as const;

export interface ControlApiAuthError {
  readonly category: string;
  readonly message: string;
}

export type ControlApiAuthResult = AuthzResult<ActorContext>;

export interface BearerTokenAuthenticator {
  authenticateBearerToken(token: string): Promise<ControlApiAuthResult>;
}

export interface ControlApiRequestLike {
  readonly headers: Readonly<
    Record<string, string | readonly string[] | undefined>
  >;
}

export interface ControlApiAuthenticatedRequest<
  Request extends ControlApiRequestLike,
> {
  readonly request: Request;
  readonly actorContext: ActorContext;
}

export interface ControlApiAuthFailure {
  readonly status: 401;
  readonly body: {
    readonly error: {
      readonly code: "UNAUTHENTICATED";
      readonly category: string;
    };
  };
}

export interface ControlApiAuthorizationFailure {
  readonly status: 404;
  readonly body: {
    readonly error: {
      readonly code: "NOT_FOUND_OR_FORBIDDEN";
    };
  };
}

export interface ControlApiDependencyFailure {
  readonly status: 503;
  readonly body: {
    readonly error: {
      readonly code: "DEPENDENCY_UNAVAILABLE";
      readonly category: "identity_dependency_unavailable";
    };
  };
}

export interface ControlApiConflictFailure {
  readonly status: 409;
  readonly body: {
    readonly error: {
      readonly code: "DEFINITION_INVALID_REQUEST";
      readonly category: string;
    };
  };
}

export interface ControlApiStepUpFailure {
  readonly status: 403;
  readonly body: {
    readonly error: {
      readonly code: "STEP_UP_REQUIRED";
      readonly category:
        | "invalid_step_up_intent"
        | "missing_step_up_intent"
        | "step_up_intent_expired"
        | "step_up_intent_replayed";
    };
  };
}

export interface ControlApiEndpointDefinition {
  readonly id: string;
  readonly capability?: ControlPlaneCapability;
}

export type ControlPlaneAuthorizer = (
  actorContext: ActorContext,
  scope: ControlPlaneAuthorizationScope,
  capability: ControlPlaneCapability,
) => ControlPlaneAuthorizationDecision;

export type ControlPlaneRoleGrantAuthorizer = (
  actorContext: ActorContext,
  scope: ControlPlaneAuthorizationScope,
  nextRole: RbacRole,
) => ControlPlaneRoleGrantDecision;

export type MemberRoleChangeScope =
  | {
      readonly kind: "workspace";
      readonly workspaceId: string;
    }
  | {
      readonly kind: "project";
      readonly workspaceId: string;
      readonly projectId: string;
    };

export interface ControlApiAuthorizationRequest {
  readonly actorContext: ActorContext;
  readonly endpointId: string;
  readonly scope: ControlPlaneAuthorizationScope;
}

export type ControlApiAuthorizationResult =
  | {
      readonly ok: true;
      readonly value: {
        readonly actorContext: ActorContext;
        readonly endpointId: string;
        readonly scope: ControlPlaneAuthorizationScope;
        readonly capability: ControlPlaneCapability;
      };
    }
  | {
      readonly ok: false;
      readonly error: ControlApiAuthorizationFailure;
    };

export type ControlApiMiddlewareResult<Request extends ControlApiRequestLike> =
  | {
      readonly ok: true;
      readonly value: ControlApiAuthenticatedRequest<Request>;
    }
  | {
      readonly ok: false;
      readonly error: ControlApiAuthFailure;
    };

export interface ControlApiAuthLogger {
  logAuthFailure(input: {
    readonly actorId?: string;
    readonly category: string;
  }): void;
}

function authorizationHeader(
  request: ControlApiRequestLike,
): string | undefined {
  const value =
    request.headers["authorization"] ?? request.headers["Authorization"];
  return typeof value === "string" ? value : undefined;
}

function bearerTokenFromRequest(
  request: ControlApiRequestLike,
): { readonly ok: true; readonly value: string } | { readonly ok: false } {
  const header = authorizationHeader(request);
  if (!header) {
    return { ok: false };
  }

  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(header);
  if (!match?.[1]) {
    return { ok: false };
  }
  return { ok: true, value: match[1] };
}

function unauthorized(category: string): ControlApiAuthFailure {
  return {
    status: 401,
    body: {
      error: {
        code: "UNAUTHENTICATED",
        category,
      },
    },
  };
}

function notFoundOrForbidden(): ControlApiAuthorizationFailure {
  return {
    status: 404,
    body: {
      error: {
        code: "NOT_FOUND_OR_FORBIDDEN",
      },
    },
  };
}

function dependencyUnavailable(): ControlApiDependencyFailure {
  return {
    status: 503,
    body: {
      error: {
        code: "DEPENDENCY_UNAVAILABLE",
        category: "identity_dependency_unavailable",
      },
    },
  };
}

function conflict(category: string): ControlApiConflictFailure {
  return {
    status: 409,
    body: {
      error: {
        code: "DEFINITION_INVALID_REQUEST",
        category,
      },
    },
  };
}

function stepUpRequired(
  category: ControlApiStepUpFailure["body"]["error"]["category"],
): ControlApiStepUpFailure {
  return {
    status: 403,
    body: {
      error: {
        code: "STEP_UP_REQUIRED",
        category,
      },
    },
  };
}

const targetActorIdPattern =
  /^usr_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const requestIdPattern = /^[A-Za-z0-9._:-]{8,128}$/;
const minStepUpTokenLength = 12;
const maxStepUpTokenLength = 160;

function isTargetActorId(value: unknown): value is string {
  return typeof value === "string" && targetActorIdPattern.test(value);
}

function isRbacRoleValue(value: unknown): value is RbacRole {
  return isRbacRole(value);
}

export function createControlApiAuthMiddleware(
  authenticator: BearerTokenAuthenticator,
  logger?: ControlApiAuthLogger,
): <Request extends ControlApiRequestLike>(
  request: Request,
) => Promise<ControlApiMiddlewareResult<Request>> {
  return async (request) => {
    const token = bearerTokenFromRequest(request);
    if (!token.ok) {
      logger?.logAuthFailure({ category: "invalid_authorization_header" });
      return {
        ok: false,
        error: unauthorized("invalid_authorization_header"),
      };
    }

    let authenticated: ControlApiAuthResult;
    try {
      authenticated = await authenticator.authenticateBearerToken(token.value);
    } catch {
      logger?.logAuthFailure({ category: "identity_dependency_unavailable" });
      return {
        ok: false,
        error: unauthorized("identity_dependency_unavailable"),
      };
    }

    if (!authenticated.ok) {
      logger?.logAuthFailure({ category: authenticated.error.category });
      return {
        ok: false,
        error: unauthorized(authenticated.error.category),
      };
    }

    return {
      ok: true,
      value: {
        request,
        actorContext: authenticated.value,
      },
    };
  };
}

export function createControlApiAuthorizationMiddleware(
  endpoints: readonly ControlApiEndpointDefinition[],
  authorize: ControlPlaneAuthorizer,
): (request: ControlApiAuthorizationRequest) => ControlApiAuthorizationResult {
  const capabilitiesByEndpoint = new Map<string, ControlPlaneCapability>();
  for (const endpoint of endpoints) {
    if (!endpoint.capability) {
      throw new Error(
        `control-api endpoint ${endpoint.id} is missing capability`,
      );
    }
    if (capabilitiesByEndpoint.has(endpoint.id)) {
      throw new Error(`control-api endpoint ${endpoint.id} is duplicated`);
    }
    capabilitiesByEndpoint.set(endpoint.id, endpoint.capability);
  }

  return (request) => {
    const capability = capabilitiesByEndpoint.get(request.endpointId);
    if (!capability) {
      return {
        ok: false,
        error: notFoundOrForbidden(),
      };
    }

    const decision = authorize(request.actorContext, request.scope, capability);
    if (!decision.allow) {
      return {
        ok: false,
        error: notFoundOrForbidden(),
      };
    }

    return {
      ok: true,
      value: {
        actorContext: request.actorContext,
        endpointId: request.endpointId,
        scope: request.scope,
        capability,
      },
    };
  };
}

export type ControlApiEnvironment = "development" | "test" | "production";

export type DraftCreationMode = "blank" | "template" | "copy_version";

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

export type GoalCapability =
  | "browse_catalog"
  | "view_metadata"
  | "search_content"
  | "read_sections"
  | "verify_citation";

export interface GoalSelection {
  readonly description: string;
  readonly audience: string;
  readonly prohibitedUses: readonly string[];
  readonly capabilities: readonly GoalCapability[];
}

export interface DraftScope {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly environment: ControlApiEnvironment;
}

export interface PlatformProtectionDefaults {
  readonly authenticationRequired: true;
  readonly authorizationRequired: true;
  readonly tenantIsolationRequired: true;
  readonly quotaEnforced: true;
  readonly outputGuardEnforced: true;
  readonly auditEnforced: true;
  readonly rawFileDownloadDisabled: true;
  readonly wholeDocumentReadDisabled: true;
  readonly writeActionsDisabled: true;
  readonly externalWriteDisabled: true;
}

export interface DraftTemplateModuleReference {
  readonly moduleId: string;
  readonly exactVersion: string;
  readonly artifactDigest: string;
}

export interface DraftTemplateDefinition {
  readonly templateId: string;
  readonly version: number;
  readonly title: string;
  readonly scenario: string;
  readonly defaultGoal: GoalSelection;
  readonly modules: readonly DraftTemplateModuleReference[];
  readonly expectedTools: readonly string[];
  readonly expectedResources: readonly string[];
  readonly expectedPrompts: readonly string[];
  readonly dataRequirements: readonly string[];
  readonly risks: readonly string[];
  readonly unavailableCapabilities: readonly string[];
  readonly platformProtections: PlatformProtectionDefaults;
}

const platformProtectionDefaults: PlatformProtectionDefaults = Object.freeze({
  authenticationRequired: true,
  authorizationRequired: true,
  tenantIsolationRequired: true,
  quotaEnforced: true,
  outputGuardEnforced: true,
  auditEnforced: true,
  rawFileDownloadDisabled: true,
  wholeDocumentReadDisabled: true,
  writeActionsDisabled: true,
  externalWriteDisabled: true,
});

const normalizedDocumentsModule = Object.freeze({
  moduleId: "source.normalized-documents",
  exactVersion: "1.0.0",
  artifactDigest:
    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
});

const searchDocumentsModule = Object.freeze({
  moduleId: "capability.search-documents",
  exactVersion: "1.2.3",
  artifactDigest:
    "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
});

const citationGuardModule = Object.freeze({
  moduleId: "output.citation-guard",
  exactVersion: "1.0.0",
  artifactDigest:
    "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
});

const searchPromptModule = Object.freeze({
  moduleId: "prompt.search-and-answer",
  exactVersion: "1.0.0",
  artifactDigest:
    "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
});

export const draftTemplates = Object.freeze([
  {
    templateId: "tpl_knowledge_search_v1",
    version: 1,
    title: "资料查询",
    scenario: "面向授权资料集合的搜索、按段读取和引用验证。",
    defaultGoal: {
      description:
        "Search authorized knowledge sources with grounded citations.",
      audience: "internal_members",
      prohibitedUses: ["bulk_export", "whole_document_read", "data_write"],
      capabilities: ["search_content", "read_sections", "verify_citation"],
    },
    modules: [
      normalizedDocumentsModule,
      searchDocumentsModule,
      citationGuardModule,
      searchPromptModule,
    ],
    expectedTools: [
      "search_documents",
      "get_document_section",
      "verify_citation",
    ],
    expectedResources: ["collections", "documents", "sections"],
    expectedPrompts: ["search_and_answer"],
    dataRequirements: ["可解析的文本、表格或文档版本"],
    risks: ["可能返回授权范围内的摘要片段"],
    unavailableCapabilities: [
      "原文件下载",
      "整篇读取",
      "数据写入",
      "外部 API 写操作",
    ],
    platformProtections: platformProtectionDefaults,
  },
  {
    templateId: "tpl_data_validation_v1",
    version: 1,
    title: "数据验证",
    scenario: "查看数据版本、元数据、摘要和处理可用状态。",
    defaultGoal: {
      description: "Validate data metadata, summaries, and processing status.",
      audience: "internal_members",
      prohibitedUses: ["bulk_export", "source_secret_review", "data_write"],
      capabilities: ["view_metadata", "verify_citation"],
    },
    modules: [normalizedDocumentsModule, citationGuardModule],
    expectedTools: ["get_document_metadata", "verify_data_version"],
    expectedResources: ["collections", "documents"],
    expectedPrompts: [],
    dataRequirements: ["带版本的数据源和可展示元数据"],
    risks: ["可能暴露标题、分类、版本和处理状态"],
    unavailableCapabilities: ["正文返回", "原文件下载", "数据写入", "凭证读取"],
    platformProtections: platformProtectionDefaults,
  },
  {
    templateId: "tpl_catalog_browse_v1",
    version: 1,
    title: "目录浏览",
    scenario: "列出授权范围内对象并查看元信息，不返回正文。",
    defaultGoal: {
      description: "Browse authorized catalog entries and inspect metadata.",
      audience: "internal_members",
      prohibitedUses: ["bulk_export", "whole_document_read", "data_write"],
      capabilities: ["browse_catalog", "view_metadata"],
    },
    modules: [normalizedDocumentsModule],
    expectedTools: ["list_catalog_objects", "get_document_metadata"],
    expectedResources: ["collections", "documents"],
    expectedPrompts: [],
    dataRequirements: ["有稳定对象标识和元数据的数据源"],
    risks: ["可能暴露授权对象的名称、类型和版本"],
    unavailableCapabilities: ["正文返回", "原文件下载", "整库导出", "数据写入"],
    platformProtections: platformProtectionDefaults,
  },
] as const satisfies readonly DraftTemplateDefinition[]);

export function listDraftTemplates(): readonly DraftTemplateDefinition[] {
  return draftTemplates;
}

export function findDraftTemplate(
  templateId: string,
): DraftTemplateDefinition | null {
  return (
    draftTemplates.find((template) => template.templateId === templateId) ??
    null
  );
}

export interface DraftDocument {
  readonly schemaVersion: 1;
  readonly creationMode: DraftCreationMode;
  readonly name: string;
  readonly goal?: GoalSelection;
  readonly template?: {
    readonly templateId: string;
    readonly version: number;
    readonly title: string;
    readonly scenario: string;
    readonly expectedTools: readonly string[];
    readonly expectedResources: readonly string[];
    readonly expectedPrompts: readonly string[];
    readonly dataRequirements: readonly string[];
    readonly risks: readonly string[];
    readonly unavailableCapabilities: readonly string[];
  };
  readonly copy?: {
    readonly sourceVersionId: string;
    readonly sourceDefinitionId: string;
    readonly sourceDefinitionDigest: string;
  };
  readonly modules: readonly DraftTemplateModuleReference[];
  readonly dataBindings: unknown;
  readonly configuration: unknown;
  readonly platform: {
    readonly protections: PlatformProtectionDefaults;
  };
}

export interface CopyableServiceVersion {
  readonly sourceVersionId: string;
  readonly definitionId: string;
  readonly definitionDigest: string;
  readonly definition: unknown;
}

export interface DraftRecord {
  readonly draftId: string;
  readonly projectId: string;
  readonly environment: ControlApiEnvironment;
  readonly name: string;
  readonly status: DraftStatus;
  readonly revision: number;
  readonly currentStep: WizardStep;
  readonly goal?: GoalSelection;
  readonly document: DraftDocument;
  readonly updatedAt: string;
}

export type CreateDraftRepositoryResult =
  | {
      readonly kind: "created" | "replayed";
      readonly draft: DraftRecord;
    }
  | { readonly kind: "idempotency_conflict" }
  | { readonly kind: "source_version_not_found" };

export interface DraftCreationRepository {
  findCopyableServiceVersion(input: {
    readonly scope: DraftScope;
    readonly actorId: string;
    readonly sourceVersionId: string;
  }): Promise<CopyableServiceVersion | null>;
  createDraft(input: {
    readonly scope: DraftScope;
    readonly actorId: string;
    readonly draftId: string;
    readonly idempotencyKey: string;
    readonly requestDigest: string;
    readonly creationMode: DraftCreationMode;
    readonly templateId: string | null;
    readonly sourceVersionId: string | null;
    readonly name: string;
    readonly document: DraftDocument;
    readonly copiedFrom?: CopyableServiceVersion;
    readonly occurredAt: string;
  }): Promise<CreateDraftRepositoryResult>;
}

export type CreateDraftResult =
  | {
      readonly ok: true;
      readonly value: {
        readonly status: 201;
        readonly body: DraftResponse;
        readonly replayed: boolean;
      };
    }
  | {
      readonly ok: false;
      readonly error:
        | ControlApiAuthorizationFailure
        | ControlApiConflictFailure
        | ControlApiDependencyFailure;
    };

export interface DraftResponse {
  readonly draftId: string;
  readonly projectId: string;
  readonly environment: ControlApiEnvironment;
  readonly name: string;
  readonly status: DraftStatus;
  readonly revision: number;
  readonly currentStep: WizardStep;
  readonly goal?: GoalSelection;
  readonly updatedAt: string;
}

const idempotencyKeyPattern = /^[A-Za-z0-9._:-]{12,200}$/;
const scopedOpaqueIdPattern =
  /^[a-z][a-z0-9]*_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(stableJson(value))
    .digest("hex")}`;
}

function cloneJson<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isGoalCapability(value: unknown): value is GoalCapability {
  return (
    value === "browse_catalog" ||
    value === "view_metadata" ||
    value === "search_content" ||
    value === "read_sections" ||
    value === "verify_citation"
  );
}

function sanitizeGoal(value: unknown): GoalSelection | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { description, audience, prohibitedUses, capabilities } = value;
  if (
    typeof description !== "string" ||
    typeof audience !== "string" ||
    !Array.isArray(prohibitedUses) ||
    !Array.isArray(capabilities) ||
    !prohibitedUses.every((item): item is string => typeof item === "string") ||
    !capabilities.every(isGoalCapability)
  ) {
    return undefined;
  }
  return {
    description,
    audience,
    prohibitedUses: [...prohibitedUses],
    capabilities: [...new Set(capabilities)],
  };
}

function isEnvironment(value: string): value is ControlApiEnvironment {
  return value === "development" || value === "test" || value === "production";
}

function isValidName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length >= 2 &&
    value.trim().length <= 60
  );
}

function isValidScope(scope: DraftScope): boolean {
  return (
    /^ws_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      scope.workspaceId,
    ) &&
    /^prj_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      scope.projectId,
    ) &&
    isEnvironment(scope.environment)
  );
}

function templateDocument(
  name: string,
  template: DraftTemplateDefinition,
): DraftDocument {
  return {
    schemaVersion: 1,
    creationMode: "template",
    name,
    goal: cloneJson(template.defaultGoal),
    template: {
      templateId: template.templateId,
      version: template.version,
      title: template.title,
      scenario: template.scenario,
      expectedTools: [...template.expectedTools],
      expectedResources: [...template.expectedResources],
      expectedPrompts: [...template.expectedPrompts],
      dataRequirements: [...template.dataRequirements],
      risks: [...template.risks],
      unavailableCapabilities: [...template.unavailableCapabilities],
    },
    modules: cloneJson(template.modules),
    dataBindings: [],
    configuration: {},
    platform: { protections: platformProtectionDefaults },
  };
}

function blankDocument(
  name: string,
  goal: GoalSelection | undefined,
): DraftDocument {
  return {
    schemaVersion: 1,
    creationMode: "blank",
    name,
    ...(goal ? { goal } : {}),
    modules: [],
    dataBindings: [],
    configuration: {},
    platform: { protections: platformProtectionDefaults },
  };
}

function copyableArrayField(
  definition: Record<string, unknown>,
  field: string,
): unknown {
  return Array.isArray(definition[field]) ? cloneJson(definition[field]) : [];
}

function copyableObjectField(
  definition: Record<string, unknown>,
  field: string,
): unknown {
  return isRecord(definition[field]) ? cloneJson(definition[field]) : {};
}

function copiedDocument(
  name: string,
  source: CopyableServiceVersion,
): DraftDocument {
  const definition = isRecord(source.definition) ? source.definition : {};
  const goal = sanitizeGoal(definition.goal);
  return {
    schemaVersion: 1,
    creationMode: "copy_version",
    name,
    ...(goal ? { goal } : {}),
    copy: {
      sourceVersionId: source.sourceVersionId,
      sourceDefinitionId: source.definitionId,
      sourceDefinitionDigest: source.definitionDigest,
    },
    modules: copyableArrayField(
      definition,
      "modules",
    ) as readonly DraftTemplateModuleReference[],
    dataBindings: copyableArrayField(definition, "dataBindings"),
    configuration: copyableObjectField(definition, "configuration"),
    platform: { protections: platformProtectionDefaults },
  };
}

function draftResponse(record: DraftRecord): DraftResponse {
  return {
    draftId: record.draftId,
    projectId: record.projectId,
    environment: record.environment,
    name: record.name,
    status: record.status,
    revision: record.revision,
    currentStep: record.currentStep,
    ...(record.goal ? { goal: record.goal } : {}),
    updatedAt: record.updatedAt,
  };
}

function projectAuthorizationScope(
  scope: DraftScope,
): ControlPlaneAuthorizationScope {
  return {
    kind: "project",
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    environment: scope.environment,
  };
}

export async function createDraft(input: {
  readonly actorContext: ActorContext;
  readonly scope: DraftScope;
  readonly idempotencyKey: unknown;
  readonly request: unknown;
  readonly repository: DraftCreationRepository;
  readonly authorize: ControlPlaneAuthorizer;
  readonly newDraftId: () => string;
  readonly now?: () => Date;
}): Promise<CreateDraftResult> {
  if (
    !isValidScope(input.scope) ||
    typeof input.idempotencyKey !== "string" ||
    !idempotencyKeyPattern.test(input.idempotencyKey) ||
    !isRecord(input.request) ||
    !isValidName(input.request.name) ||
    (input.request.creationMode !== "blank" &&
      input.request.creationMode !== "template" &&
      input.request.creationMode !== "copy_version")
  ) {
    return { ok: false, error: conflict("draft_create_invalid_request") };
  }

  const authorizationScope = projectAuthorizationScope(input.scope);
  const decision = input.authorize(
    input.actorContext,
    authorizationScope,
    "draft.edit",
  );
  if (!decision.allow) {
    return { ok: false, error: notFoundOrForbidden() };
  }

  const name = input.request.name.trim();
  const creationMode = input.request.creationMode;
  let document: DraftDocument;
  let templateId: string | null = null;
  let sourceVersionId: string | null = null;
  let copiedFrom: CopyableServiceVersion | undefined;

  if (creationMode === "blank") {
    if ("templateId" in input.request || "sourceVersionId" in input.request) {
      return { ok: false, error: conflict("draft_create_invalid_request") };
    }
    document = blankDocument(name, sanitizeGoal(input.request.goal));
  } else if (creationMode === "template") {
    if (
      typeof input.request.templateId !== "string" ||
      "sourceVersionId" in input.request
    ) {
      return { ok: false, error: conflict("draft_create_invalid_request") };
    }
    const template = findDraftTemplate(input.request.templateId);
    if (!template) {
      return { ok: false, error: conflict("draft_template_unknown") };
    }
    templateId = template.templateId;
    document = templateDocument(name, template);
  } else {
    if (
      typeof input.request.sourceVersionId !== "string" ||
      !scopedOpaqueIdPattern.test(input.request.sourceVersionId) ||
      "templateId" in input.request
    ) {
      return { ok: false, error: conflict("draft_create_invalid_request") };
    }
    sourceVersionId = input.request.sourceVersionId;
    let source: CopyableServiceVersion | null;
    try {
      source = await input.repository.findCopyableServiceVersion({
        scope: input.scope,
        actorId: input.actorContext.actorId,
        sourceVersionId,
      });
    } catch {
      return { ok: false, error: dependencyUnavailable() };
    }
    if (!source) {
      return { ok: false, error: notFoundOrForbidden() };
    }
    copiedFrom = source;
    document = copiedDocument(name, source);
  }

  const requestDigest = sha256({
    request: input.request,
    scope: input.scope,
  });

  let repositoryResult: CreateDraftRepositoryResult;
  try {
    repositoryResult = await input.repository.createDraft({
      scope: input.scope,
      actorId: input.actorContext.actorId,
      draftId: input.newDraftId(),
      idempotencyKey: input.idempotencyKey,
      requestDigest,
      creationMode,
      templateId,
      sourceVersionId,
      name,
      document,
      ...(copiedFrom ? { copiedFrom } : {}),
      occurredAt: (input.now?.() ?? new Date()).toISOString(),
    });
  } catch {
    return { ok: false, error: dependencyUnavailable() };
  }

  if (repositoryResult.kind === "source_version_not_found") {
    return { ok: false, error: notFoundOrForbidden() };
  }
  if (repositoryResult.kind === "idempotency_conflict") {
    return { ok: false, error: conflict("idempotency_key_reused") };
  }

  if (
    repositoryResult.draft.projectId !== input.scope.projectId ||
    repositoryResult.draft.environment !== input.scope.environment ||
    repositoryResult.draft.status !== "editing" ||
    repositoryResult.draft.revision !== 1 ||
    repositoryResult.draft.currentStep !== "goal"
  ) {
    return { ok: false, error: dependencyUnavailable() };
  }

  return {
    ok: true,
    value: {
      status: 201,
      body: draftResponse(repositoryResult.draft),
      replayed: repositoryResult.kind === "replayed",
    },
  };
}

export type GoalAudience =
  | "internal_members"
  | "specified_customers"
  | "all_authorized_users";

export type GoalLanguage = "zh" | "en" | "multilingual";

export type GoalStepStatus = "incomplete" | "complete";

export type GoalValidationIssueCode =
  | "missing_name"
  | "missing_description"
  | "missing_audience"
  | "missing_prohibited_uses"
  | "missing_default_language"
  | "missing_capabilities"
  | "invalid_name"
  | "invalid_description"
  | "invalid_audience"
  | "invalid_prohibited_uses"
  | "invalid_default_language"
  | "unsupported_capability"
  | "capability_dependency_missing";

export interface DraftGoalState {
  readonly name?: string;
  readonly description?: string;
  readonly audience?: GoalAudience;
  readonly prohibitedUses?: readonly string[];
  readonly defaultLanguage?: GoalLanguage;
  readonly capabilities: readonly GoalCapability[];
}

export interface DraftGoalValidationIssue {
  readonly code: GoalValidationIssueCode;
  readonly path: string;
  readonly message: string;
  readonly blockingCompletion: boolean;
}

export interface DraftGoalValidation {
  readonly canSave: boolean;
  readonly canComplete: boolean;
  readonly issues: readonly DraftGoalValidationIssue[];
}

export interface DraftGoalSummary {
  readonly schemaVersion: 1;
  readonly summaryDigest: string;
  readonly selectedCapabilities: readonly GoalCapability[];
  readonly expectedTools: readonly string[];
  readonly expectedResources: readonly string[];
  readonly expectedPrompts: readonly string[];
  readonly recommendedInputs: readonly string[];
  readonly defaultOutputLimits: {
    readonly maxResults: number;
    readonly maxSections: number;
    readonly citationsRequired: boolean;
  };
  readonly explicitlyDisabled: readonly string[];
  readonly trace: readonly {
    readonly capability: GoalCapability;
    readonly reason: string;
    readonly tools: readonly string[];
    readonly resources: readonly string[];
    readonly prompts: readonly string[];
  }[];
}

export interface DraftGoalInvalidationSignal {
  readonly reason:
    | "goal_changed"
    | "capability_set_changed"
    | "recommended_inputs_changed";
  readonly invalidates: readonly WizardStep[];
}

export interface DraftGoalResponse {
  readonly draftId: string;
  readonly projectId: string;
  readonly environment: ControlApiEnvironment;
  readonly revision: number;
  readonly currentStep: WizardStep;
  readonly goal: DraftGoalState;
  readonly stepStatus: GoalStepStatus;
  readonly validation: DraftGoalValidation;
  readonly summary: DraftGoalSummary;
  readonly invalidation: readonly DraftGoalInvalidationSignal[];
  readonly updatedAt: string;
}

export type DraftGoalRepositoryResult =
  | {
      readonly kind: "saved" | "completed";
      readonly draft: DraftGoalResponse;
    }
  | { readonly kind: "revision_conflict" }
  | { readonly kind: "not_found_or_forbidden" };

export interface DraftGoalRepository {
  saveGoal(input: {
    readonly scope: DraftScope;
    readonly actorId: string;
    readonly draftId: string;
    readonly expectedRevision: number;
    readonly goal: DraftGoalState;
    readonly validation: DraftGoalValidation;
    readonly summary: DraftGoalSummary;
    readonly invalidation: readonly DraftGoalInvalidationSignal[];
    readonly occurredAt: string;
  }): Promise<DraftGoalRepositoryResult>;
  completeGoalStep(input: {
    readonly scope: DraftScope;
    readonly actorId: string;
    readonly draftId: string;
    readonly expectedRevision: number;
    readonly goal: DraftGoalState;
    readonly validation: DraftGoalValidation;
    readonly summary: DraftGoalSummary;
    readonly invalidation: readonly DraftGoalInvalidationSignal[];
    readonly occurredAt: string;
  }): Promise<DraftGoalRepositoryResult>;
}

export type DraftGoalApplicationResult =
  | { readonly ok: true; readonly value: { readonly body: DraftGoalResponse } }
  | {
      readonly ok: false;
      readonly error:
        | ControlApiAuthorizationFailure
        | ControlApiConflictFailure
        | ControlApiDependencyFailure;
    };

const goalCapabilityOrder = Object.freeze([
  "browse_catalog",
  "view_metadata",
  "search_content",
  "read_sections",
  "verify_citation",
] as const satisfies readonly GoalCapability[]);

const goalCapabilityRank = new Map<GoalCapability, number>(
  goalCapabilityOrder.map((capability, index) => [capability, index]),
);

const disabledP0Capabilities = Object.freeze([
  "原文件下载",
  "整篇读取",
  "数据写入",
  "数据删除",
  "外部动作执行",
] as const);

function isGoalAudience(value: unknown): value is GoalAudience {
  return (
    value === "internal_members" ||
    value === "specified_customers" ||
    value === "all_authorized_users"
  );
}

function isGoalLanguage(value: unknown): value is GoalLanguage {
  return value === "zh" || value === "en" || value === "multilingual";
}

function normalizedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function uniqueSortedCapabilities(
  values: readonly GoalCapability[],
): readonly GoalCapability[] {
  return [...new Set(values)].sort(
    (left, right) =>
      goalCapabilityRank.get(left)! - goalCapabilityRank.get(right)!,
  );
}

function validationIssue(
  code: GoalValidationIssueCode,
  path: string,
  message: string,
): DraftGoalValidationIssue {
  return { code, path, message, blockingCompletion: true };
}

function normalizeDraftGoal(value: unknown): {
  readonly goal: DraftGoalState;
  readonly issues: readonly DraftGoalValidationIssue[];
  readonly unsupportedCapabilities: readonly string[];
} {
  const issues: DraftGoalValidationIssue[] = [];
  const unsupportedCapabilities: string[] = [];
  if (!isRecord(value)) {
    return {
      goal: { capabilities: [] },
      issues: [
        validationIssue(
          "missing_name",
          "/name",
          "Service name is required before the goal step can be completed.",
        ),
      ],
      unsupportedCapabilities,
    };
  }

  const name = normalizedString(value.name);
  const description = normalizedString(value.description);
  const prohibitedUses =
    Array.isArray(value.prohibitedUses) &&
    value.prohibitedUses.every(
      (item): item is string => typeof item === "string",
    )
      ? value.prohibitedUses
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      : undefined;

  if (value.name !== undefined && !name) {
    issues.push(
      validationIssue(
        "invalid_name",
        "/name",
        "Service name must contain visible text.",
      ),
    );
  }
  if (name && (name.length < 2 || name.length > 60)) {
    issues.push(
      validationIssue(
        "invalid_name",
        "/name",
        "Service name must be 2 to 60 characters.",
      ),
    );
  }
  if (value.description !== undefined && !description) {
    issues.push(
      validationIssue(
        "invalid_description",
        "/description",
        "Description must contain visible text.",
      ),
    );
  }
  if (description && description.length > 240) {
    issues.push(
      validationIssue(
        "invalid_description",
        "/description",
        "Description must be at most 240 characters.",
      ),
    );
  }
  if (value.audience !== undefined && !isGoalAudience(value.audience)) {
    issues.push(
      validationIssue(
        "invalid_audience",
        "/audience",
        "Audience must be one of the P0 audience values.",
      ),
    );
  }
  if (
    value.defaultLanguage !== undefined &&
    !isGoalLanguage(value.defaultLanguage)
  ) {
    issues.push(
      validationIssue(
        "invalid_default_language",
        "/defaultLanguage",
        "Default language must be zh, en, or multilingual.",
      ),
    );
  }
  if (
    value.prohibitedUses !== undefined &&
    (!Array.isArray(value.prohibitedUses) || prohibitedUses === undefined)
  ) {
    issues.push(
      validationIssue(
        "invalid_prohibited_uses",
        "/prohibitedUses",
        "Prohibited uses must be a list of text values.",
      ),
    );
  }

  const capabilities: GoalCapability[] = [];
  if (Array.isArray(value.capabilities)) {
    for (const capability of value.capabilities) {
      if (isGoalCapability(capability)) {
        capabilities.push(capability);
      } else if (typeof capability === "string") {
        unsupportedCapabilities.push(capability);
      } else {
        unsupportedCapabilities.push(String(capability));
      }
    }
  } else if (value.capabilities !== undefined) {
    unsupportedCapabilities.push("invalid_capabilities_shape");
  }

  for (const capability of unsupportedCapabilities) {
    issues.push(
      validationIssue(
        "unsupported_capability",
        "/capabilities",
        `Capability ${capability} is outside the P0 read-only goal set.`,
      ),
    );
  }

  const normalizedCapabilities = uniqueSortedCapabilities(capabilities);
  if (
    normalizedCapabilities.includes("read_sections") &&
    !normalizedCapabilities.includes("search_content")
  ) {
    issues.push(
      validationIssue(
        "capability_dependency_missing",
        "/capabilities/read_sections",
        "Reading sections requires search_content so callers can locate authorized sections.",
      ),
    );
  }
  if (
    normalizedCapabilities.includes("verify_citation") &&
    !normalizedCapabilities.includes("search_content") &&
    !normalizedCapabilities.includes("read_sections")
  ) {
    issues.push(
      validationIssue(
        "capability_dependency_missing",
        "/capabilities/verify_citation",
        "Citation verification requires search_content or read_sections.",
      ),
    );
  }

  if (!name) {
    issues.push(
      validationIssue(
        "missing_name",
        "/name",
        "Service name is required before the goal step can be completed.",
      ),
    );
  }
  if (!description) {
    issues.push(
      validationIssue(
        "missing_description",
        "/description",
        "Description is required before the goal step can be completed.",
      ),
    );
  }
  if (!isGoalAudience(value.audience)) {
    issues.push(
      validationIssue(
        "missing_audience",
        "/audience",
        "Audience is required before the goal step can be completed.",
      ),
    );
  }
  if (!prohibitedUses || prohibitedUses.length === 0) {
    issues.push(
      validationIssue(
        "missing_prohibited_uses",
        "/prohibitedUses",
        "At least one prohibited use is required before the goal step can be completed.",
      ),
    );
  }
  if (!isGoalLanguage(value.defaultLanguage)) {
    issues.push(
      validationIssue(
        "missing_default_language",
        "/defaultLanguage",
        "Default language is required before the goal step can be completed.",
      ),
    );
  }
  if (normalizedCapabilities.length === 0) {
    issues.push(
      validationIssue(
        "missing_capabilities",
        "/capabilities",
        "At least one P0 capability is required before the goal step can be completed.",
      ),
    );
  }

  return {
    goal: {
      ...(name ? { name } : {}),
      ...(description ? { description } : {}),
      ...(isGoalAudience(value.audience) ? { audience: value.audience } : {}),
      ...(prohibitedUses ? { prohibitedUses } : {}),
      ...(isGoalLanguage(value.defaultLanguage)
        ? { defaultLanguage: value.defaultLanguage }
        : {}),
      capabilities: normalizedCapabilities,
    },
    issues,
    unsupportedCapabilities,
  };
}

function validateDraftGoal(value: unknown): {
  readonly goal: DraftGoalState;
  readonly validation: DraftGoalValidation;
  readonly unsupportedCapabilities: readonly string[];
} {
  const normalized = normalizeDraftGoal(value);
  const hasUnsupported = normalized.issues.some(
    (issue) => issue.code === "unsupported_capability",
  );
  const completionIssues = normalized.issues.filter(
    (issue, index, issues) =>
      issues.findIndex(
        (candidate) =>
          candidate.code === issue.code && candidate.path === issue.path,
      ) === index,
  );
  return {
    goal: normalized.goal,
    validation: {
      canSave: !hasUnsupported,
      canComplete: completionIssues.length === 0,
      issues: completionIssues,
    },
    unsupportedCapabilities: normalized.unsupportedCapabilities,
  };
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function traceForCapability(
  capability: GoalCapability,
): DraftGoalSummary["trace"][number] {
  switch (capability) {
    case "browse_catalog":
      return {
        capability,
        reason: "List authorized objects without returning body content.",
        tools: ["list_catalog_objects"],
        resources: ["collections", "documents"],
        prompts: [],
      };
    case "view_metadata":
      return {
        capability,
        reason: "Expose titles, classifications, versions, and sources.",
        tools: ["get_document_metadata"],
        resources: ["documents"],
        prompts: [],
      };
    case "search_content":
      return {
        capability,
        reason:
          "Search indexed authorized content and return bounded snippets.",
        tools: ["search_documents"],
        resources: ["sections"],
        prompts: ["search_and_answer"],
      };
    case "read_sections":
      return {
        capability,
        reason: "Read bounded sections selected from search results.",
        tools: ["get_document_section"],
        resources: ["sections"],
        prompts: ["search_and_answer"],
      };
    case "verify_citation":
      return {
        capability,
        reason:
          "Check that citations point at the current authorized data version.",
        tools: ["verify_citation"],
        resources: ["citations"],
        prompts: [],
      };
  }
}

function recommendedInputsForCapabilities(
  capabilities: readonly GoalCapability[],
): readonly string[] {
  const inputs: string[] = [];
  if (
    capabilities.includes("browse_catalog") ||
    capabilities.includes("view_metadata")
  ) {
    inputs.push("stable object identifiers and metadata fields");
  }
  if (
    capabilities.includes("search_content") ||
    capabilities.includes("read_sections") ||
    capabilities.includes("verify_citation")
  ) {
    inputs.push("parseable text or structured records with stable versions");
  }
  if (capabilities.includes("verify_citation")) {
    inputs.push("citation anchors tied to immutable data versions");
  }
  return uniqueSorted(inputs);
}

export function buildDraftGoalSummary(goal: DraftGoalState): DraftGoalSummary {
  const selectedCapabilities = uniqueSortedCapabilities(goal.capabilities);
  const trace = selectedCapabilities.map(traceForCapability);
  const summaryWithoutDigest = {
    schemaVersion: 1 as const,
    selectedCapabilities,
    expectedTools: uniqueSorted(trace.flatMap((item) => item.tools)),
    expectedResources: uniqueSorted(trace.flatMap((item) => item.resources)),
    expectedPrompts: uniqueSorted(trace.flatMap((item) => item.prompts)),
    recommendedInputs: recommendedInputsForCapabilities(selectedCapabilities),
    defaultOutputLimits: {
      maxResults: 10,
      maxSections: selectedCapabilities.includes("read_sections") ? 5 : 0,
      citationsRequired: selectedCapabilities.includes("verify_citation"),
    },
    explicitlyDisabled: disabledP0Capabilities,
    trace,
  };
  return {
    ...summaryWithoutDigest,
    summaryDigest: sha256(summaryWithoutDigest),
  };
}

function invalidationSignals(
  previousSummary: DraftGoalSummary | undefined,
  nextSummary: DraftGoalSummary,
): readonly DraftGoalInvalidationSignal[] {
  if (!previousSummary) {
    return [];
  }
  const signals: DraftGoalInvalidationSignal[] = [];
  if (previousSummary.summaryDigest !== nextSummary.summaryDigest) {
    signals.push({
      reason: "goal_changed",
      invalidates: ["modules", "configuration", "preview", "test", "publish"],
    });
  }
  if (
    stableJson(previousSummary.selectedCapabilities) !==
    stableJson(nextSummary.selectedCapabilities)
  ) {
    signals.push({
      reason: "capability_set_changed",
      invalidates: ["modules", "configuration", "preview", "test", "publish"],
    });
  }
  if (
    stableJson(previousSummary.recommendedInputs) !==
    stableJson(nextSummary.recommendedInputs)
  ) {
    signals.push({
      reason: "recommended_inputs_changed",
      invalidates: ["data", "modules", "preview", "test", "publish"],
    });
  }
  return signals;
}

function isSafeRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function goalRepositoryFailure(
  result: DraftGoalRepositoryResult,
): ControlApiAuthorizationFailure | ControlApiConflictFailure {
  if (result.kind === "revision_conflict") {
    return conflict("draft_revision_conflict");
  }
  return notFoundOrForbidden();
}

async function persistDraftGoal(input: {
  readonly mode: "save" | "complete";
  readonly actorContext: ActorContext;
  readonly scope: DraftScope;
  readonly draftId: unknown;
  readonly expectedRevision: unknown;
  readonly goal: unknown;
  readonly previousSummary?: DraftGoalSummary;
  readonly repository: DraftGoalRepository;
  readonly authorize: ControlPlaneAuthorizer;
  readonly now?: () => Date;
}): Promise<DraftGoalApplicationResult> {
  if (
    !isValidScope(input.scope) ||
    !isDraftId(input.draftId) ||
    !isSafeRevision(input.expectedRevision)
  ) {
    return { ok: false, error: conflict("draft_goal_invalid_request") };
  }

  const decision = input.authorize(
    input.actorContext,
    projectAuthorizationScope(input.scope),
    "draft.edit",
  );
  if (!decision.allow) {
    return { ok: false, error: notFoundOrForbidden() };
  }

  const goalResult = validateDraftGoal(input.goal);
  if (!goalResult.validation.canSave) {
    return { ok: false, error: conflict("draft_goal_unsupported_capability") };
  }
  if (input.mode === "complete" && !goalResult.validation.canComplete) {
    return { ok: false, error: conflict("draft_goal_incomplete") };
  }

  const summary = buildDraftGoalSummary(goalResult.goal);
  const invalidation = invalidationSignals(input.previousSummary, summary);
  let result: DraftGoalRepositoryResult;
  try {
    const repositoryInput = {
      scope: input.scope,
      actorId: input.actorContext.actorId,
      draftId: input.draftId,
      expectedRevision: input.expectedRevision,
      goal: goalResult.goal,
      validation: goalResult.validation,
      summary,
      invalidation,
      occurredAt: (input.now?.() ?? new Date()).toISOString(),
    };
    result =
      input.mode === "save"
        ? await input.repository.saveGoal(repositoryInput)
        : await input.repository.completeGoalStep(repositoryInput);
  } catch {
    return { ok: false, error: dependencyUnavailable() };
  }

  if (result.kind !== "saved" && result.kind !== "completed") {
    return { ok: false, error: goalRepositoryFailure(result) };
  }

  if (
    result.draft.draftId !== input.draftId ||
    result.draft.projectId !== input.scope.projectId ||
    result.draft.environment !== input.scope.environment ||
    result.draft.revision < input.expectedRevision ||
    (input.mode === "complete" && result.draft.stepStatus !== "complete")
  ) {
    return { ok: false, error: dependencyUnavailable() };
  }

  return { ok: true, value: { body: result.draft } };
}

export async function saveDraftGoal(input: {
  readonly actorContext: ActorContext;
  readonly scope: DraftScope;
  readonly draftId: unknown;
  readonly expectedRevision: unknown;
  readonly goal: unknown;
  readonly previousSummary?: DraftGoalSummary;
  readonly repository: DraftGoalRepository;
  readonly authorize: ControlPlaneAuthorizer;
  readonly now?: () => Date;
}): Promise<DraftGoalApplicationResult> {
  return persistDraftGoal({ ...input, mode: "save" });
}

export async function completeDraftGoalStep(input: {
  readonly actorContext: ActorContext;
  readonly scope: DraftScope;
  readonly draftId: unknown;
  readonly expectedRevision: unknown;
  readonly goal: unknown;
  readonly previousSummary?: DraftGoalSummary;
  readonly repository: DraftGoalRepository;
  readonly authorize: ControlPlaneAuthorizer;
  readonly now?: () => Date;
}): Promise<DraftGoalApplicationResult> {
  return persistDraftGoal({ ...input, mode: "complete" });
}

export interface DraftPatchChange {
  readonly path: string;
  readonly before: unknown;
  readonly after: unknown;
}

export interface DraftConflictDetails {
  readonly kind: "DRAFT_CONFLICT";
  readonly baseRevision: number;
  readonly serverRevision: number;
  readonly serverETag: string;
  readonly clientChanges: readonly DraftPatchChange[];
  readonly serverChanges: readonly DraftPatchChange[];
  readonly overlapPaths: readonly string[];
}

export interface DraftUpdateInvalidation {
  readonly previewConfirmationInvalidated: boolean;
  readonly testConfirmationInvalidated: boolean;
  readonly reasons: readonly string[];
}

export interface DraftUpdateResponse {
  readonly draft: DraftResponse;
  readonly etag: string;
  readonly invalidation: DraftUpdateInvalidation;
}

export interface DraftUpdateConflictFailure {
  readonly status: 412;
  readonly body: {
    readonly error: {
      readonly code: "DEFINITION_INVALID_REQUEST";
      readonly category: "DRAFT_CONFLICT";
      readonly conflict: DraftConflictDetails;
    };
  };
}

export type DraftUpdateRepositoryResult =
  | { readonly kind: "updated" | "replayed"; readonly draft: DraftRecord }
  | {
      readonly kind: "conflict";
      readonly serverRevision: number;
      readonly serverDocument: unknown;
      readonly baseDocument: unknown;
      readonly updatedAt: string;
    }
  | { readonly kind: "idempotency_conflict" }
  | { readonly kind: "not_found_or_forbidden" };

export interface DraftUpdateRepository {
  updateDraft(input: {
    readonly scope: DraftScope;
    readonly actorId: string;
    readonly draftId: string;
    readonly expectedRevision: number;
    readonly idempotencyKey: string;
    readonly requestDigest: string;
    readonly patch: Record<string, unknown>;
    readonly currentStep?: WizardStep;
    readonly occurredAt: string;
  }): Promise<DraftUpdateRepositoryResult>;
}

export type DraftUpdateApplicationResult =
  | {
      readonly ok: true;
      readonly value: { readonly body: DraftUpdateResponse };
    }
  | {
      readonly ok: false;
      readonly error:
        | ControlApiAuthorizationFailure
        | ControlApiConflictFailure
        | ControlApiDependencyFailure
        | DraftUpdateConflictFailure;
    };

const revisionEtagPattern = /^rev-([1-9][0-9]*)$/;
const sensitivePatchKeyPattern =
  /(^|[_-])(secret|token|credential|password|authorization|api[_-]?key)([_-]|$)/i;

function draftEtag(revision: number): string {
  return `rev-${revision}`;
}

function revisionFromEtag(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }
  const match = revisionEtagPattern.exec(value);
  if (!match?.[1]) {
    return null;
  }
  const revision = Number(match[1]);
  return Number.isSafeInteger(revision) ? revision : null;
}

function isWizardStep(value: unknown): value is WizardStep {
  return (
    value === "goal" ||
    value === "data" ||
    value === "modules" ||
    value === "configuration" ||
    value === "preview" ||
    value === "test" ||
    value === "publish"
  );
}

function containsSensitivePath(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsSensitivePath);
  }
  if (!isRecord(value)) {
    return false;
  }
  return Object.entries(value).some(
    ([key, child]) =>
      sensitivePatchKeyPattern.test(key) || containsSensitivePath(child),
  );
}

function redactValue(path: string, value: unknown): unknown {
  const sensitive = path
    .split("/")
    .some((part) => sensitivePatchKeyPattern.test(part));
  return sensitive ? "[REDACTED]" : cloneJson(value);
}

function pointerJoin(base: string, key: string): string {
  return `${base}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
}

function applyMergePatch(target: unknown, patch: unknown): unknown {
  if (!isRecord(patch)) {
    return cloneJson(patch);
  }
  const base = isRecord(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete base[key];
    } else {
      base[key] = isRecord(value)
        ? applyMergePatch(base[key], value)
        : cloneJson(value);
    }
  }
  return base;
}

function collectChanges(
  before: unknown,
  after: unknown,
  basePath = "",
): readonly DraftPatchChange[] {
  if (stableJson(before) === stableJson(after)) {
    return [];
  }
  if (isRecord(before) && isRecord(after)) {
    const keys = uniqueSorted([...Object.keys(before), ...Object.keys(after)]);
    return keys.flatMap((key) =>
      collectChanges(before[key], after[key], pointerJoin(basePath, key)),
    );
  }
  const path = basePath || "/";
  return [
    {
      path,
      before: redactValue(path, before),
      after: redactValue(path, after),
    },
  ];
}

function overlapPaths(
  clientChanges: readonly DraftPatchChange[],
  serverChanges: readonly DraftPatchChange[],
): readonly string[] {
  const serverPaths = new Set(serverChanges.map((change) => change.path));
  return uniqueSorted(
    clientChanges
      .map((change) => change.path)
      .filter((path) => serverPaths.has(path)),
  );
}

const criticalInvalidationPrefixes = Object.freeze([
  "/goal",
  "/dataBindings",
  "/modules",
  "/configuration/access",
  "/configuration/auth",
  "/configuration/outputLimits",
  "/configuration/prompts",
  "/configuration/resources",
  "/configuration/tools",
] as const);

function patchPaths(patch: Record<string, unknown>, basePath = ""): string[] {
  return Object.entries(patch).flatMap(([key, value]) => {
    const path = pointerJoin(basePath, key);
    if (isRecord(value)) {
      const children = patchPaths(value, path);
      return children.length > 0 ? children : [path];
    }
    return [path];
  });
}

function updateInvalidation(
  patch: Record<string, unknown>,
): DraftUpdateInvalidation {
  const changedPaths = patchPaths(patch);
  const criticalReasons = uniqueSorted(
    changedPaths
      .filter((path) =>
        criticalInvalidationPrefixes.some(
          (prefix) => path === prefix || path.startsWith(`${prefix}/`),
        ),
      )
      .map((path) => `critical_field_changed:${path}`),
  );
  return {
    previewConfirmationInvalidated: criticalReasons.length > 0,
    testConfirmationInvalidated: criticalReasons.length > 0,
    reasons: criticalReasons,
  };
}

function draftConflictFailure(input: {
  readonly expectedRevision: number;
  readonly serverRevision: number;
  readonly serverDocument: unknown;
  readonly baseDocument: unknown;
  readonly patch: Record<string, unknown>;
}): DraftUpdateConflictFailure {
  const clientDocument = applyMergePatch(input.baseDocument, input.patch);
  const clientChanges = collectChanges(input.baseDocument, clientDocument);
  const serverChanges = collectChanges(
    input.baseDocument,
    input.serverDocument,
  );
  return {
    status: 412,
    body: {
      error: {
        code: "DEFINITION_INVALID_REQUEST",
        category: "DRAFT_CONFLICT",
        conflict: {
          kind: "DRAFT_CONFLICT",
          baseRevision: input.expectedRevision,
          serverRevision: input.serverRevision,
          serverETag: draftEtag(input.serverRevision),
          clientChanges,
          serverChanges,
          overlapPaths: overlapPaths(clientChanges, serverChanges),
        },
      },
    },
  };
}

export async function updateDraft(input: {
  readonly actorContext: ActorContext;
  readonly scope: DraftScope;
  readonly draftId: unknown;
  readonly ifMatch: unknown;
  readonly idempotencyKey: unknown;
  readonly request: unknown;
  readonly repository: DraftUpdateRepository;
  readonly authorize: ControlPlaneAuthorizer;
  readonly now?: () => Date;
}): Promise<DraftUpdateApplicationResult> {
  const expectedRevision = revisionFromEtag(input.ifMatch);
  if (
    !isValidScope(input.scope) ||
    !isDraftId(input.draftId) ||
    expectedRevision === null ||
    typeof input.idempotencyKey !== "string" ||
    !idempotencyKeyPattern.test(input.idempotencyKey) ||
    !isRecord(input.request) ||
    !isSafeRevision(input.request.revision) ||
    input.request.revision !== expectedRevision ||
    !isRecord(input.request.patch) ||
    (input.request.currentStep !== undefined &&
      !isWizardStep(input.request.currentStep))
  ) {
    return { ok: false, error: conflict("draft_update_invalid_request") };
  }
  if (containsSensitivePath(input.request.patch)) {
    return { ok: false, error: conflict("draft_update_sensitive_patch") };
  }

  const decision = input.authorize(
    input.actorContext,
    projectAuthorizationScope(input.scope),
    "draft.edit",
  );
  if (!decision.allow) {
    return { ok: false, error: notFoundOrForbidden() };
  }

  const requestDigest = sha256({
    draftId: input.draftId,
    ifMatch: input.ifMatch,
    request: input.request,
    scope: input.scope,
  });
  const invalidation = updateInvalidation(input.request.patch);
  let result: DraftUpdateRepositoryResult;
  try {
    result = await input.repository.updateDraft({
      scope: input.scope,
      actorId: input.actorContext.actorId,
      draftId: input.draftId,
      expectedRevision,
      idempotencyKey: input.idempotencyKey,
      requestDigest,
      patch: input.request.patch,
      ...(input.request.currentStep
        ? { currentStep: input.request.currentStep }
        : {}),
      occurredAt: (input.now?.() ?? new Date()).toISOString(),
    });
  } catch {
    return { ok: false, error: dependencyUnavailable() };
  }

  if (result.kind === "idempotency_conflict") {
    return { ok: false, error: conflict("idempotency_key_reused") };
  }
  if (result.kind === "not_found_or_forbidden") {
    return { ok: false, error: notFoundOrForbidden() };
  }
  if (result.kind === "conflict") {
    return {
      ok: false,
      error: draftConflictFailure({
        expectedRevision,
        serverRevision: result.serverRevision,
        serverDocument: result.serverDocument,
        baseDocument: result.baseDocument,
        patch: input.request.patch,
      }),
    };
  }
  if (
    result.draft.projectId !== input.scope.projectId ||
    result.draft.environment !== input.scope.environment ||
    result.draft.revision < expectedRevision
  ) {
    return { ok: false, error: dependencyUnavailable() };
  }
  return {
    ok: true,
    value: {
      body: {
        draft: draftResponse(result.draft),
        etag: draftEtag(result.draft.revision),
        invalidation,
      },
    },
  };
}

export type AtomicMemberRoleChangeResult =
  | {
      readonly kind: "changed";
      readonly previousRole: RbacRole;
      readonly nextRole: RbacRole;
      readonly revision: number;
    }
  | { readonly kind: "not_found_or_forbidden" }
  | { readonly kind: "last_owner_conflict" };

export interface MemberRoleChangeRepository {
  changeMemberRoleAndRecordAudit(input: {
    readonly actorId: string;
    readonly targetActorId: string;
    readonly scope: MemberRoleChangeScope;
    readonly nextRole: RbacRole;
    readonly authorization: {
      readonly actorId: string;
      readonly scope: MemberRoleChangeScope;
      readonly nextRole: RbacRole;
      readonly manageExistingOwner: boolean;
    };
    readonly occurredAt: string;
  }): Promise<AtomicMemberRoleChangeResult>;
}

function memberRoleChangeScope(
  scope: ControlPlaneAuthorizationScope,
): MemberRoleChangeScope {
  if (scope.kind === "workspace") {
    return { kind: "workspace", workspaceId: scope.workspaceId };
  }
  return {
    kind: "project",
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
  };
}

export type MemberRoleChangeResult =
  | {
      readonly ok: true;
      readonly value: {
        readonly previousRole: RbacRole;
        readonly nextRole: RbacRole;
        readonly revision: number;
      };
    }
  | {
      readonly ok: false;
      readonly error:
        | ControlApiAuthorizationFailure
        | ControlApiDependencyFailure;
    };

export async function changeMemberRole(input: {
  readonly actorContext: ActorContext;
  readonly scope: ControlPlaneAuthorizationScope;
  readonly targetActorId: unknown;
  readonly nextRole: unknown;
  readonly repository: MemberRoleChangeRepository;
  readonly authorizeRoleGrant: ControlPlaneRoleGrantAuthorizer;
  readonly now?: () => Date;
}): Promise<MemberRoleChangeResult> {
  if (
    !isTargetActorId(input.targetActorId) ||
    !isRbacRoleValue(input.nextRole)
  ) {
    return {
      ok: false,
      error: notFoundOrForbidden(),
    };
  }

  const grantDecision = input.authorizeRoleGrant(
    input.actorContext,
    input.scope,
    input.nextRole,
  );
  if (!grantDecision.allow) {
    return {
      ok: false,
      error: notFoundOrForbidden(),
    };
  }

  let result: AtomicMemberRoleChangeResult;
  try {
    const repositoryScope = memberRoleChangeScope(grantDecision.scope);
    result = await input.repository.changeMemberRoleAndRecordAudit({
      actorId: grantDecision.actorId,
      targetActorId: input.targetActorId,
      scope: repositoryScope,
      nextRole: grantDecision.nextRole,
      authorization: {
        actorId: grantDecision.actorId,
        scope: repositoryScope,
        nextRole: grantDecision.nextRole,
        manageExistingOwner: grantDecision.manageExistingOwner,
      },
      occurredAt: (input.now?.() ?? new Date()).toISOString(),
    });
  } catch {
    return {
      ok: false,
      error: dependencyUnavailable(),
    };
  }

  if (
    result.kind === "not_found_or_forbidden" ||
    result.kind === "last_owner_conflict"
  ) {
    return {
      ok: false,
      error: notFoundOrForbidden(),
    };
  }

  if (
    !isRbacRoleValue(result.previousRole) ||
    !isRbacRoleValue(result.nextRole) ||
    result.nextRole !== input.nextRole ||
    !Number.isSafeInteger(result.revision) ||
    result.revision < 1
  ) {
    return {
      ok: false,
      error: dependencyUnavailable(),
    };
  }

  return {
    ok: true,
    value: {
      previousRole: result.previousRole,
      nextRole: result.nextRole,
      revision: result.revision,
    },
  };
}

export type MultipartUploadStatus =
  | "created"
  | "uploading"
  | "uploaded"
  | "cancelled"
  | "expired";

export interface MultipartUploadLimits {
  readonly maxSingleFileBytes: number;
  readonly maxFilesPerDraft: number;
  readonly maxDraftTotalBytes: number;
  readonly maxPartCount: number;
  readonly partUrlTtlSeconds: number;
  readonly uploadTtlSeconds: number;
}

export interface MultipartUploadRecord {
  readonly uploadId: string;
  readonly draftId: string;
  readonly dataSourceId: string;
  readonly dataVersionId: string;
  readonly objectKey: string;
  readonly storageUploadId: string;
  readonly declaredFileName: string;
  readonly declaredSizeBytes: number;
  readonly status: MultipartUploadStatus;
  readonly serverSizeBytes?: number;
  readonly serverChecksumSha256?: string;
  readonly expiresAt: string;
  readonly revision: number;
  readonly parts: readonly UploadedPartRecord[];
}

export interface UploadedPartRecord {
  readonly partNumber: number;
  readonly sizeBytes: number;
  readonly checksumSha256: string;
  readonly etag: string;
  readonly confirmedAt: string;
}

export type MultipartUploadRepositoryError =
  | "not_found_or_forbidden"
  | "limit_exceeded"
  | "invalid_state"
  | "part_mismatch"
  | "expired";

export type MultipartUploadRepositoryResult<Value> =
  | { readonly ok: true; readonly value: Value }
  | {
      readonly ok: false;
      readonly error: MultipartUploadRepositoryError;
    };

export interface MultipartUploadRepository {
  create(input: {
    readonly scope: ControlPlaneAuthorizationScope & {
      readonly kind: "project";
    };
    readonly actorId: string;
    readonly uploadId: string;
    readonly draftId: string;
    readonly dataSourceId: string;
    readonly dataVersionId: string;
    readonly objectKey: string;
    readonly storageUploadId: string;
    readonly declaredFileName: string;
    readonly declaredContentType: string;
    readonly declaredSizeBytes: number;
    readonly now: string;
    readonly expiresAt: string;
    readonly limits: Pick<
      MultipartUploadLimits,
      "maxFilesPerDraft" | "maxDraftTotalBytes"
    >;
  }): Promise<MultipartUploadRepositoryResult<MultipartUploadRecord>>;
  getActive(input: {
    readonly scope: ControlPlaneAuthorizationScope & {
      readonly kind: "project";
    };
    readonly uploadId: string;
    readonly now: string;
  }): Promise<MultipartUploadRepositoryResult<MultipartUploadRecord>>;
  recordPart(input: {
    readonly scope: ControlPlaneAuthorizationScope & {
      readonly kind: "project";
    };
    readonly uploadId: string;
    readonly part: UploadedPartRecord;
  }): Promise<MultipartUploadRepositoryResult<MultipartUploadRecord>>;
  complete(input: {
    readonly scope: ControlPlaneAuthorizationScope & {
      readonly kind: "project";
    };
    readonly uploadId: string;
    readonly sizeBytes: number;
    readonly checksumSha256: string;
    readonly now: string;
  }): Promise<MultipartUploadRepositoryResult<MultipartUploadRecord>>;
  abort(input: {
    readonly scope: ControlPlaneAuthorizationScope & {
      readonly kind: "project";
    };
    readonly uploadId: string;
    readonly now: string;
  }): Promise<MultipartUploadRepositoryResult<MultipartUploadRecord>>;
  recoverExpired(input: {
    readonly scope: ControlPlaneAuthorizationScope & {
      readonly kind: "project";
    };
    readonly uploadId: string;
    readonly parts: readonly UploadedPartRecord[];
    readonly now: string;
    readonly expiresAt: string;
  }): Promise<MultipartUploadRepositoryResult<MultipartUploadRecord>>;
}

export interface MultipartObjectStoragePort {
  createMultipartUpload(input: {
    readonly objectKey: string;
    readonly contentType: string;
  }): Promise<{ readonly storageUploadId: string }>;
  presignUploadPart(input: {
    readonly objectKey: string;
    readonly storageUploadId: string;
    readonly partNumber: number;
    readonly expiresAt: Date;
  }): Promise<{
    readonly url: string;
    readonly method: "PUT";
    readonly expiresAt: string;
    readonly signedHeaders: readonly string[];
  }>;
  inspectUploadedPart(input: {
    readonly objectKey: string;
    readonly storageUploadId: string;
    readonly partNumber: number;
  }): Promise<UploadedPartRecord | null>;
  listUploadedParts(input: {
    readonly objectKey: string;
    readonly storageUploadId: string;
  }): Promise<readonly UploadedPartRecord[]>;
  completeMultipartUpload(input: {
    readonly objectKey: string;
    readonly storageUploadId: string;
    readonly parts: readonly UploadedPartRecord[];
  }): Promise<{
    readonly sizeBytes: number;
    readonly checksumSha256: string;
  }>;
  abortMultipartUpload(input: {
    readonly objectKey: string;
    readonly storageUploadId: string;
  }): Promise<void>;
}

export interface ControlApiUploadFailure {
  readonly status: 400 | 404 | 409 | 503;
  readonly body: {
    readonly error: {
      readonly code:
        | "INVALID_UPLOAD_REQUEST"
        | "UPLOAD_LIMIT_EXCEEDED"
        | "UPLOAD_STATE_CONFLICT"
        | "NOT_FOUND_OR_FORBIDDEN"
        | "DEPENDENCY_UNAVAILABLE";
      readonly category?: string;
    };
  };
}

export type MultipartUploadUseCaseResult<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly error: ControlApiUploadFailure };

function uploadFailure(
  status: ControlApiUploadFailure["status"],
  code: ControlApiUploadFailure["body"]["error"]["code"],
  category?: string,
): ControlApiUploadFailure {
  return {
    status,
    body: {
      error: {
        code,
        ...(category ? { category } : {}),
      },
    },
  };
}

function uploadNotFoundOrForbidden(): ControlApiUploadFailure {
  return uploadFailure(404, "NOT_FOUND_OR_FORBIDDEN");
}

function uploadDependencyUnavailable(): ControlApiUploadFailure {
  return uploadFailure(
    503,
    "DEPENDENCY_UNAVAILABLE",
    "upload_dependency_unavailable",
  );
}

function readUploadClock(
  now: (() => Date) | undefined,
):
  | { readonly ok: true; readonly value: Date }
  | { readonly ok: false; readonly error: ControlApiUploadFailure } {
  try {
    const value = now?.() ?? new Date();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
      return {
        ok: false,
        error: uploadFailure(
          503,
          "DEPENDENCY_UNAVAILABLE",
          "invalid_upload_clock",
        ),
      };
    }
    return { ok: true, value };
  } catch {
    return {
      ok: false,
      error: uploadFailure(
        503,
        "DEPENDENCY_UNAVAILABLE",
        "invalid_upload_clock",
      ),
    };
  }
}

function mapUploadRepositoryError(
  error: MultipartUploadRepositoryError,
): ControlApiUploadFailure {
  if (error === "not_found_or_forbidden") {
    return uploadNotFoundOrForbidden();
  }
  if (error === "limit_exceeded") {
    return uploadFailure(400, "UPLOAD_LIMIT_EXCEEDED", "upload_limit_exceeded");
  }
  if (error === "expired") {
    return uploadFailure(409, "UPLOAD_STATE_CONFLICT", "upload_expired");
  }
  return uploadFailure(409, "UPLOAD_STATE_CONFLICT", error);
}

function effectiveUploadLimits(
  limits?: Partial<MultipartUploadLimits>,
): MultipartUploadLimits {
  return {
    ...multipartUploadDefaults,
    ...limits,
  };
}

function isProjectScope(
  scope: ControlPlaneAuthorizationScope,
): scope is ControlPlaneAuthorizationScope & { readonly kind: "project" } {
  return scope.kind === "project";
}

function authorizeUploadEdit(input: {
  readonly actorContext: ActorContext;
  readonly scope: ControlPlaneAuthorizationScope;
  readonly authorize: ControlPlaneAuthorizer;
}):
  | {
      readonly ok: true;
      readonly value: ControlPlaneAuthorizationScope & {
        readonly kind: "project";
      };
    }
  | { readonly ok: false; readonly error: ControlApiUploadFailure } {
  if (!isProjectScope(input.scope)) {
    return { ok: false, error: uploadNotFoundOrForbidden() };
  }
  const decision = input.authorize(
    input.actorContext,
    input.scope,
    "draft.edit",
  );
  if (!decision.allow || decision.scope.kind !== "project") {
    return { ok: false, error: uploadNotFoundOrForbidden() };
  }
  return { ok: true, value: decision.scope };
}

function idSuffix(id: string): string {
  return id.slice(id.indexOf("_") + 1);
}

function generatedUploadObjectKey(input: {
  readonly scope: ControlPlaneAuthorizationScope & { readonly kind: "project" };
  readonly draftId: string;
  readonly uploadId: string;
}): string {
  return [
    "workspace",
    encodeURIComponent(input.scope.workspaceId),
    "project",
    encodeURIComponent(input.scope.projectId),
    "environment",
    encodeURIComponent(input.scope.environment),
    "draft",
    encodeURIComponent(input.draftId),
    "upload",
    encodeURIComponent(input.uploadId),
    "source.bin",
  ].join("/");
}

function uuidV7(now = Date.now()): string {
  const bytes = randomBytes(16);
  const milliseconds = BigInt(now);
  bytes[0] = Number((milliseconds >> 40n) & 0xffn);
  bytes[1] = Number((milliseconds >> 32n) & 0xffn);
  bytes[2] = Number((milliseconds >> 24n) & 0xffn);
  bytes[3] = Number((milliseconds >> 16n) & 0xffn);
  bytes[4] = Number((milliseconds >> 8n) & 0xffn);
  bytes[5] = Number(milliseconds & 0xffn);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
    12,
    16,
  )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function generatedId(prefix: "upl" | "dv", now?: Date): string {
  return `${prefix}_${uuidV7(now?.getTime())}`;
}

function isUploadId(value: unknown): value is string {
  return typeof value === "string" && uploadIdPattern.test(value);
}

function isDraftId(value: unknown): value is string {
  return typeof value === "string" && draftIdPattern.test(value);
}

function isDataSourceId(value: unknown): value is string {
  return typeof value === "string" && dataSourceIdPattern.test(value);
}

function isDataVersionId(value: unknown): value is string {
  return typeof value === "string" && dataVersionIdPattern.test(value);
}

function isSha256Digest(value: unknown): value is string {
  return typeof value === "string" && sha256DigestPattern.test(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function validateDeclaredFile(input: {
  readonly declaredFileName: unknown;
  readonly declaredContentType: unknown;
  readonly declaredSizeBytes: unknown;
  readonly limits: MultipartUploadLimits;
}): ControlApiUploadFailure | undefined {
  if (
    typeof input.declaredFileName !== "string" ||
    input.declaredFileName.trim().length === 0 ||
    input.declaredFileName.length > 255 ||
    typeof input.declaredContentType !== "string" ||
    input.declaredContentType.length > 160 ||
    !isPositiveSafeInteger(input.declaredSizeBytes)
  ) {
    return uploadFailure(
      400,
      "INVALID_UPLOAD_REQUEST",
      "invalid_upload_declaration",
    );
  }
  if (input.declaredSizeBytes > input.limits.maxSingleFileBytes) {
    return uploadFailure(400, "UPLOAD_LIMIT_EXCEEDED", "file_size_limit");
  }
  return undefined;
}

function validatePartNumber(
  value: unknown,
  limits: MultipartUploadLimits,
): number | ControlApiUploadFailure {
  if (
    !isPositiveSafeInteger(value) ||
    value < 1 ||
    value > limits.maxPartCount
  ) {
    return uploadFailure(400, "INVALID_UPLOAD_REQUEST", "invalid_part_number");
  }
  return value;
}

function validateUploadRecord(record: MultipartUploadRecord): boolean {
  return (
    isUploadId(record.uploadId) &&
    isDraftId(record.draftId) &&
    isDataSourceId(record.dataSourceId) &&
    isDataVersionId(record.dataVersionId) &&
    record.objectKey.length > 0 &&
    record.storageUploadId.length > 0 &&
    Number.isSafeInteger(record.revision) &&
    record.revision > 0 &&
    (record.serverSizeBytes === undefined ||
      isPositiveSafeInteger(record.serverSizeBytes)) &&
    (record.serverChecksumSha256 === undefined ||
      isSha256Digest(record.serverChecksumSha256)) &&
    record.parts.every(
      (part) =>
        isPositiveSafeInteger(part.partNumber) &&
        isPositiveSafeInteger(part.sizeBytes) &&
        isSha256Digest(part.checksumSha256) &&
        part.etag.length > 0,
    )
  );
}

function stableDigest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export async function createMultipartUpload(input: {
  readonly actorContext: ActorContext;
  readonly scope: ControlPlaneAuthorizationScope;
  readonly draftId: unknown;
  readonly dataSourceId: unknown;
  readonly declaredFileName: unknown;
  readonly declaredContentType: unknown;
  readonly declaredSizeBytes: unknown;
  readonly repository: MultipartUploadRepository;
  readonly storage: MultipartObjectStoragePort;
  readonly authorize: ControlPlaneAuthorizer;
  readonly limits?: Partial<MultipartUploadLimits>;
  readonly now?: () => Date;
  readonly ids?: {
    readonly uploadId?: () => string;
    readonly dataVersionId?: () => string;
  };
}): Promise<
  MultipartUploadUseCaseResult<{
    readonly upload: MultipartUploadRecord;
  }>
> {
  const authorized = authorizeUploadEdit(input);
  if (!authorized.ok) {
    return authorized;
  }
  const limits = effectiveUploadLimits(input.limits);
  const validation = validateDeclaredFile({
    declaredFileName: input.declaredFileName,
    declaredContentType: input.declaredContentType,
    declaredSizeBytes: input.declaredSizeBytes,
    limits,
  });
  if (validation) {
    return { ok: false, error: validation };
  }
  if (!isDraftId(input.draftId) || !isDataSourceId(input.dataSourceId)) {
    return { ok: false, error: uploadNotFoundOrForbidden() };
  }
  const declaredFileName = input.declaredFileName;
  const declaredContentType = input.declaredContentType;
  const declaredSizeBytes = input.declaredSizeBytes;
  if (
    typeof declaredFileName !== "string" ||
    typeof declaredContentType !== "string" ||
    !isPositiveSafeInteger(declaredSizeBytes)
  ) {
    return {
      ok: false,
      error: uploadFailure(
        400,
        "INVALID_UPLOAD_REQUEST",
        "invalid_upload_declaration",
      ),
    };
  }

  const now = input.now?.() ?? new Date();
  const expiresAt = new Date(
    now.getTime() + limits.uploadTtlSeconds * 1000,
  ).toISOString();
  const uploadId = input.ids?.uploadId?.() ?? generatedId("upl", now);
  const dataVersionId = input.ids?.dataVersionId?.() ?? generatedId("dv", now);
  if (!isUploadId(uploadId) || !isDataVersionId(dataVersionId)) {
    return {
      ok: false,
      error: uploadFailure(503, "DEPENDENCY_UNAVAILABLE", "invalid_id_source"),
    };
  }
  const objectKey = generatedUploadObjectKey({
    scope: authorized.value,
    draftId: input.draftId,
    uploadId,
  });

  let storageUpload: { readonly storageUploadId: string };
  try {
    storageUpload = await input.storage.createMultipartUpload({
      objectKey,
      contentType: declaredContentType,
    });
  } catch {
    return { ok: false, error: uploadDependencyUnavailable() };
  }

  let created: MultipartUploadRepositoryResult<MultipartUploadRecord>;
  try {
    created = await input.repository.create({
      scope: authorized.value,
      actorId: input.actorContext.actorId,
      uploadId,
      draftId: input.draftId,
      dataSourceId: input.dataSourceId,
      dataVersionId,
      objectKey,
      storageUploadId: storageUpload.storageUploadId,
      declaredFileName,
      declaredContentType,
      declaredSizeBytes,
      now: now.toISOString(),
      expiresAt,
      limits,
    });
  } catch {
    return { ok: false, error: uploadDependencyUnavailable() };
  }
  if (!created.ok) {
    return { ok: false, error: mapUploadRepositoryError(created.error) };
  }
  if (
    !validateUploadRecord(created.value) ||
    created.value.objectKey !== objectKey
  ) {
    return { ok: false, error: uploadDependencyUnavailable() };
  }
  return { ok: true, value: { upload: created.value } };
}

export async function signMultipartUploadPart(input: {
  readonly actorContext: ActorContext;
  readonly scope: ControlPlaneAuthorizationScope;
  readonly uploadId: unknown;
  readonly partNumber: unknown;
  readonly repository: MultipartUploadRepository;
  readonly storage: MultipartObjectStoragePort;
  readonly authorize: ControlPlaneAuthorizer;
  readonly limits?: Partial<MultipartUploadLimits>;
  readonly now?: () => Date;
}): Promise<
  MultipartUploadUseCaseResult<{
    readonly uploadId: string;
    readonly partNumber: number;
    readonly objectKey: string;
    readonly method: "PUT";
    readonly url: string;
    readonly expiresAt: string;
    readonly signedHeaders: readonly string[];
  }>
> {
  const authorized = authorizeUploadEdit(input);
  if (!authorized.ok) {
    return authorized;
  }
  const limits = effectiveUploadLimits(input.limits);
  if (!isUploadId(input.uploadId)) {
    return { ok: false, error: uploadNotFoundOrForbidden() };
  }
  const partNumber = validatePartNumber(input.partNumber, limits);
  if (typeof partNumber !== "number") {
    return { ok: false, error: partNumber };
  }
  const now = input.now?.() ?? new Date();
  let found: MultipartUploadRepositoryResult<MultipartUploadRecord>;
  try {
    found = await input.repository.getActive({
      scope: authorized.value,
      uploadId: input.uploadId,
      now: now.toISOString(),
    });
  } catch {
    return { ok: false, error: uploadDependencyUnavailable() };
  }
  if (!found.ok) {
    return { ok: false, error: mapUploadRepositoryError(found.error) };
  }
  if (!validateUploadRecord(found.value)) {
    return { ok: false, error: uploadDependencyUnavailable() };
  }
  if (found.value.status !== "uploading") {
    return {
      ok: false,
      error: uploadFailure(409, "UPLOAD_STATE_CONFLICT", "invalid_state"),
    };
  }
  const expiresAt = new Date(now.getTime() + limits.partUrlTtlSeconds * 1000);
  try {
    const signed = await input.storage.presignUploadPart({
      objectKey: found.value.objectKey,
      storageUploadId: found.value.storageUploadId,
      partNumber,
      expiresAt,
    });
    return {
      ok: true,
      value: {
        uploadId: found.value.uploadId,
        objectKey: found.value.objectKey,
        partNumber,
        method: signed.method,
        url: signed.url,
        expiresAt: signed.expiresAt,
        signedHeaders: signed.signedHeaders,
      },
    };
  } catch {
    return { ok: false, error: uploadDependencyUnavailable() };
  }
}

export async function confirmMultipartUploadPart(input: {
  readonly actorContext: ActorContext;
  readonly scope: ControlPlaneAuthorizationScope;
  readonly uploadId: unknown;
  readonly objectKey: unknown;
  readonly partNumber: unknown;
  readonly sizeBytes: unknown;
  readonly checksumSha256: unknown;
  readonly repository: MultipartUploadRepository;
  readonly storage: MultipartObjectStoragePort;
  readonly authorize: ControlPlaneAuthorizer;
  readonly limits?: Partial<MultipartUploadLimits>;
  readonly now?: () => Date;
}): Promise<
  MultipartUploadUseCaseResult<{
    readonly upload: MultipartUploadRecord;
    readonly part: UploadedPartRecord;
  }>
> {
  const authorized = authorizeUploadEdit(input);
  if (!authorized.ok) {
    return authorized;
  }
  const limits = effectiveUploadLimits(input.limits);
  if (
    !isUploadId(input.uploadId) ||
    typeof input.objectKey !== "string" ||
    !isPositiveSafeInteger(input.sizeBytes) ||
    !isSha256Digest(input.checksumSha256)
  ) {
    return { ok: false, error: uploadNotFoundOrForbidden() };
  }
  const partNumber = validatePartNumber(input.partNumber, limits);
  if (typeof partNumber !== "number") {
    return { ok: false, error: partNumber };
  }

  const operationNow = readUploadClock(input.now);
  if (!operationNow.ok) {
    return operationNow;
  }

  let found: MultipartUploadRepositoryResult<MultipartUploadRecord>;
  try {
    found = await input.repository.getActive({
      scope: authorized.value,
      uploadId: input.uploadId,
      now: operationNow.value.toISOString(),
    });
  } catch {
    return { ok: false, error: uploadDependencyUnavailable() };
  }
  if (!found.ok) {
    return { ok: false, error: mapUploadRepositoryError(found.error) };
  }
  if (found.value.objectKey !== input.objectKey) {
    return { ok: false, error: uploadNotFoundOrForbidden() };
  }
  if (found.value.status !== "uploading") {
    return {
      ok: false,
      error: uploadFailure(409, "UPLOAD_STATE_CONFLICT", "invalid_state"),
    };
  }

  let inspected: UploadedPartRecord | null;
  try {
    inspected = await input.storage.inspectUploadedPart({
      objectKey: found.value.objectKey,
      storageUploadId: found.value.storageUploadId,
      partNumber,
    });
  } catch {
    return { ok: false, error: uploadDependencyUnavailable() };
  }
  if (
    !inspected ||
    inspected.sizeBytes !== input.sizeBytes ||
    inspected.checksumSha256 !== input.checksumSha256
  ) {
    return {
      ok: false,
      error: uploadFailure(409, "UPLOAD_STATE_CONFLICT", "part_mismatch"),
    };
  }

  let recorded: MultipartUploadRepositoryResult<MultipartUploadRecord>;
  try {
    recorded = await input.repository.recordPart({
      scope: authorized.value,
      uploadId: input.uploadId,
      part: inspected,
    });
  } catch {
    return { ok: false, error: uploadDependencyUnavailable() };
  }
  if (!recorded.ok) {
    return { ok: false, error: mapUploadRepositoryError(recorded.error) };
  }
  return {
    ok: true,
    value: {
      upload: recorded.value,
      part: inspected,
    },
  };
}

export async function completeMultipartUpload(input: {
  readonly actorContext: ActorContext;
  readonly scope: ControlPlaneAuthorizationScope;
  readonly uploadId: unknown;
  readonly repository: MultipartUploadRepository;
  readonly storage: MultipartObjectStoragePort;
  readonly authorize: ControlPlaneAuthorizer;
  readonly now?: () => Date;
}): Promise<
  MultipartUploadUseCaseResult<{
    readonly upload: MultipartUploadRecord;
    readonly checksumSha256: string;
    readonly sizeBytes: number;
  }>
> {
  const authorized = authorizeUploadEdit(input);
  if (!authorized.ok) {
    return authorized;
  }
  if (!isUploadId(input.uploadId)) {
    return { ok: false, error: uploadNotFoundOrForbidden() };
  }
  const now = input.now?.() ?? new Date();
  let found: MultipartUploadRepositoryResult<MultipartUploadRecord>;
  try {
    found = await input.repository.getActive({
      scope: authorized.value,
      uploadId: input.uploadId,
      now: now.toISOString(),
    });
  } catch {
    return { ok: false, error: uploadDependencyUnavailable() };
  }
  if (!found.ok) {
    return { ok: false, error: mapUploadRepositoryError(found.error) };
  }
  if (found.value.status === "uploaded") {
    const sizeBytes =
      found.value.serverSizeBytes ??
      found.value.parts.reduce((total, part) => total + part.sizeBytes, 0);
    return {
      ok: true,
      value: {
        upload: found.value,
        checksumSha256:
          found.value.serverChecksumSha256 ??
          stableDigest(found.value.objectKey),
        sizeBytes,
      },
    };
  }
  if (found.value.parts.length === 0) {
    return {
      ok: false,
      error: uploadFailure(409, "UPLOAD_STATE_CONFLICT", "no_confirmed_parts"),
    };
  }

  let completed: {
    readonly sizeBytes: number;
    readonly checksumSha256: string;
  };
  try {
    completed = await input.storage.completeMultipartUpload({
      objectKey: found.value.objectKey,
      storageUploadId: found.value.storageUploadId,
      parts: found.value.parts,
    });
  } catch {
    return { ok: false, error: uploadDependencyUnavailable() };
  }
  if (!isSha256Digest(completed.checksumSha256)) {
    return { ok: false, error: uploadDependencyUnavailable() };
  }
  let recorded: MultipartUploadRepositoryResult<MultipartUploadRecord>;
  try {
    recorded = await input.repository.complete({
      scope: authorized.value,
      uploadId: input.uploadId,
      sizeBytes: completed.sizeBytes,
      checksumSha256: completed.checksumSha256,
      now: now.toISOString(),
    });
  } catch {
    return { ok: false, error: uploadDependencyUnavailable() };
  }
  if (!recorded.ok) {
    return { ok: false, error: mapUploadRepositoryError(recorded.error) };
  }
  return { ok: true, value: { upload: recorded.value, ...completed } };
}

export async function abortMultipartUpload(input: {
  readonly actorContext: ActorContext;
  readonly scope: ControlPlaneAuthorizationScope;
  readonly uploadId: unknown;
  readonly repository: MultipartUploadRepository;
  readonly storage: MultipartObjectStoragePort;
  readonly authorize: ControlPlaneAuthorizer;
  readonly now?: () => Date;
}): Promise<
  MultipartUploadUseCaseResult<{ readonly upload: MultipartUploadRecord }>
> {
  const authorized = authorizeUploadEdit(input);
  if (!authorized.ok) {
    return authorized;
  }
  if (!isUploadId(input.uploadId)) {
    return { ok: false, error: uploadNotFoundOrForbidden() };
  }
  const now = input.now?.() ?? new Date();
  let found: MultipartUploadRepositoryResult<MultipartUploadRecord>;
  try {
    found = await input.repository.getActive({
      scope: authorized.value,
      uploadId: input.uploadId,
      now: now.toISOString(),
    });
  } catch {
    return { ok: false, error: uploadDependencyUnavailable() };
  }
  if (!found.ok && found.error !== "invalid_state") {
    return { ok: false, error: mapUploadRepositoryError(found.error) };
  }
  if (found.ok && found.value.status === "uploading") {
    try {
      await input.storage.abortMultipartUpload({
        objectKey: found.value.objectKey,
        storageUploadId: found.value.storageUploadId,
      });
    } catch {
      return { ok: false, error: uploadDependencyUnavailable() };
    }
  }
  let aborted: MultipartUploadRepositoryResult<MultipartUploadRecord>;
  try {
    aborted = await input.repository.abort({
      scope: authorized.value,
      uploadId: input.uploadId,
      now: now.toISOString(),
    });
  } catch {
    return { ok: false, error: uploadDependencyUnavailable() };
  }
  if (!aborted.ok) {
    return { ok: false, error: mapUploadRepositoryError(aborted.error) };
  }
  return { ok: true, value: { upload: aborted.value } };
}

export async function recoverMultipartUpload(input: {
  readonly actorContext: ActorContext;
  readonly scope: ControlPlaneAuthorizationScope;
  readonly uploadId: unknown;
  readonly repository: MultipartUploadRepository;
  readonly storage: MultipartObjectStoragePort;
  readonly authorize: ControlPlaneAuthorizer;
  readonly limits?: Partial<MultipartUploadLimits>;
  readonly now?: () => Date;
}): Promise<
  MultipartUploadUseCaseResult<{ readonly upload: MultipartUploadRecord }>
> {
  const authorized = authorizeUploadEdit(input);
  if (!authorized.ok) {
    return authorized;
  }
  if (!isUploadId(input.uploadId)) {
    return { ok: false, error: uploadNotFoundOrForbidden() };
  }
  const limits = effectiveUploadLimits(input.limits);
  const now = input.now?.() ?? new Date();
  let found: MultipartUploadRepositoryResult<MultipartUploadRecord>;
  try {
    found = await input.repository.getActive({
      scope: authorized.value,
      uploadId: input.uploadId,
      now: now.toISOString(),
    });
  } catch {
    return { ok: false, error: uploadDependencyUnavailable() };
  }
  if (found.ok) {
    return { ok: true, value: { upload: found.value } };
  }
  if (found.error !== "expired") {
    return { ok: false, error: mapUploadRepositoryError(found.error) };
  }

  let expired: MultipartUploadRepositoryResult<MultipartUploadRecord>;
  try {
    expired = await input.repository.getActive({
      scope: authorized.value,
      uploadId: input.uploadId,
      now: new Date(0).toISOString(),
    });
  } catch {
    return { ok: false, error: uploadDependencyUnavailable() };
  }
  if (!expired.ok) {
    return { ok: false, error: mapUploadRepositoryError(expired.error) };
  }

  let parts: readonly UploadedPartRecord[];
  try {
    parts = await input.storage.listUploadedParts({
      objectKey: expired.value.objectKey,
      storageUploadId: expired.value.storageUploadId,
    });
  } catch {
    return { ok: false, error: uploadDependencyUnavailable() };
  }
  const expiresAt = new Date(
    now.getTime() + limits.uploadTtlSeconds * 1000,
  ).toISOString();
  let recovered: MultipartUploadRepositoryResult<MultipartUploadRecord>;
  try {
    recovered = await input.repository.recoverExpired({
      scope: authorized.value,
      uploadId: input.uploadId,
      parts,
      now: now.toISOString(),
      expiresAt,
    });
  } catch {
    return { ok: false, error: uploadDependencyUnavailable() };
  }
  if (!recovered.ok) {
    return { ok: false, error: mapUploadRepositoryError(recovered.error) };
  }
  return { ok: true, value: { upload: recovered.value } };
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function hashHex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function amzDate(date: Date): string {
  return date.toISOString().replaceAll(/[:-]|\.\d{3}/g, "");
}

function dateScope(date: Date): string {
  return amzDate(date).slice(0, 8);
}

function awsPercentEncode(value: string): string {
  return encodeURIComponent(value).replaceAll("%2F", "/");
}

function canonicalQuery(params: readonly [string, string][]): string {
  return [...params]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");
}

export interface S3MultipartStorageConfig {
  readonly endpoint: string;
  readonly bucket: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly fetch?: typeof fetch;
}

export function createS3MultipartObjectStoragePort(
  config: S3MultipartStorageConfig,
): MultipartObjectStoragePort {
  const endpoint = new URL(config.endpoint);
  const fetchImpl = config.fetch ?? fetch;
  const host = endpoint.host;
  const bucketPrefix = `/${encodeURIComponent(config.bucket)}`;

  function urlForObject(objectKey: string, query = ""): URL {
    const url = new URL(endpoint.toString());
    url.pathname = `${bucketPrefix}/${awsPercentEncode(objectKey)}`;
    url.search = query;
    return url;
  }

  function signingKey(date: Date): Buffer {
    const dateKey = hmac(`AWS4${config.secretAccessKey}`, dateScope(date));
    const regionKey = hmac(dateKey, config.region);
    const serviceKey = hmac(regionKey, "s3");
    return hmac(serviceKey, "aws4_request");
  }

  function presignedUrl(input: {
    readonly method: "PUT";
    readonly objectKey: string;
    readonly query: readonly [string, string][];
    readonly expiresAt: Date;
  }): string {
    const now = new Date(
      input.expiresAt.getTime() -
        multipartUploadDefaults.partUrlTtlSeconds * 1000,
    );
    const credentialScope = `${dateScope(now)}/${config.region}/s3/aws4_request`;
    const baseParams: readonly [string, string][] = [
      ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
      ["X-Amz-Content-Sha256", "UNSIGNED-PAYLOAD"],
      ["X-Amz-Credential", `${config.accessKeyId}/${credentialScope}`],
      ["X-Amz-Date", amzDate(now)],
      [
        "X-Amz-Expires",
        String(
          Math.max(
            1,
            Math.floor((input.expiresAt.getTime() - now.getTime()) / 1000),
          ),
        ),
      ],
      ["X-Amz-SignedHeaders", "host"],
      ...input.query,
    ];
    const canonicalUri = `${bucketPrefix}/${awsPercentEncode(input.objectKey)}`;
    const canonical = [
      input.method,
      canonicalUri,
      canonicalQuery(baseParams),
      `host:${host}\n`,
      "host",
      "UNSIGNED-PAYLOAD",
    ].join("\n");
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate(now),
      credentialScope,
      hashHex(canonical),
    ].join("\n");
    const signature = createHmac("sha256", signingKey(now))
      .update(stringToSign)
      .digest("hex");
    const url = urlForObject(input.objectKey);
    url.search = canonicalQuery([
      ...baseParams,
      ["X-Amz-Signature", signature],
    ]);
    return url.toString();
  }

  async function signedFetch(
    method: "POST" | "GET" | "DELETE",
    objectKey: string,
    query: string,
    body?: string,
  ): Promise<Response> {
    const now = new Date();
    const url = urlForObject(objectKey, query);
    const payloadHash = hashHex(body ?? "");
    const credentialScope = `${dateScope(now)}/${config.region}/s3/aws4_request`;
    const canonical = [
      method,
      url.pathname,
      url.search ? url.search.slice(1) : "",
      `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate(now)}\n`,
      "host;x-amz-content-sha256;x-amz-date",
      payloadHash,
    ].join("\n");
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate(now),
      credentialScope,
      hashHex(canonical),
    ].join("\n");
    const signature = createHmac("sha256", signingKey(now))
      .update(stringToSign)
      .digest("hex");
    const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${signature}`;
    return fetchImpl(url, {
      method,
      ...(body === undefined ? {} : { body }),
      headers: {
        authorization,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate(now),
      },
    });
  }

  async function responseTextOrThrow(response: Response): Promise<string> {
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`s3 request failed: ${response.status}`);
    }
    return text;
  }

  function xmlValue(xml: string, tag: string): string | undefined {
    const match = new RegExp(`<${tag}>([^<]+)</${tag}>`).exec(xml);
    return match?.[1];
  }

  return {
    async createMultipartUpload(input) {
      const response = await signedFetch("POST", input.objectKey, "uploads=");
      const xml = await responseTextOrThrow(response);
      const storageUploadId = xmlValue(xml, "UploadId");
      if (!storageUploadId) {
        throw new Error("s3 create multipart did not return UploadId");
      }
      return { storageUploadId };
    },
    async presignUploadPart(input) {
      return {
        method: "PUT" as const,
        url: presignedUrl({
          method: "PUT",
          objectKey: input.objectKey,
          expiresAt: input.expiresAt,
          query: [
            ["partNumber", String(input.partNumber)],
            ["uploadId", input.storageUploadId],
          ],
        }),
        expiresAt: input.expiresAt.toISOString(),
        signedHeaders: ["host"],
      };
    },
    async inspectUploadedPart(input) {
      const parts = await this.listUploadedParts({
        objectKey: input.objectKey,
        storageUploadId: input.storageUploadId,
      });
      return parts.find((part) => part.partNumber === input.partNumber) ?? null;
    },
    async listUploadedParts(input) {
      const response = await signedFetch(
        "GET",
        input.objectKey,
        canonicalQuery([["uploadId", input.storageUploadId]]),
      );
      const xml = await responseTextOrThrow(response);
      return [...xml.matchAll(/<Part>([\s\S]*?)<\/Part>/g)].map((match) => {
        const partXml = match[1] ?? "";
        const partNumber = Number(xmlValue(partXml, "PartNumber"));
        const sizeBytes = Number(xmlValue(partXml, "Size"));
        const etag = xmlValue(partXml, "ETag")?.replaceAll('"', "") ?? "";
        const checksum = xmlValue(partXml, "ChecksumSHA256");
        return {
          partNumber,
          sizeBytes,
          etag,
          checksumSha256: checksum
            ? `sha256:${createHash("sha256").update(checksum).digest("hex")}`
            : stableDigest(
                `${input.objectKey}:${input.storageUploadId}:${partNumber}:${etag}:${sizeBytes}`,
              ),
          confirmedAt: new Date().toISOString(),
        };
      });
    },
    async completeMultipartUpload(input) {
      const body = `<CompleteMultipartUpload>${input.parts
        .map(
          (part) =>
            `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>"${part.etag}"</ETag></Part>`,
        )
        .join("")}</CompleteMultipartUpload>`;
      await responseTextOrThrow(
        await signedFetch(
          "POST",
          input.objectKey,
          canonicalQuery([["uploadId", input.storageUploadId]]),
          body,
        ),
      );
      const sizeBytes = input.parts.reduce(
        (total, part) => total + part.sizeBytes,
        0,
      );
      return {
        sizeBytes,
        checksumSha256: stableDigest(
          input.parts
            .map((part) => `${part.partNumber}:${part.checksumSha256}`)
            .join("|"),
        ),
      };
    },
    async abortMultipartUpload(input) {
      await responseTextOrThrow(
        await signedFetch(
          "DELETE",
          input.objectKey,
          canonicalQuery([["uploadId", input.storageUploadId]]),
        ),
      );
    },
  };
}

export interface HighImpactActionAuditRecord {
  readonly actorId: string;
  readonly action: HighImpactActionKind;
  readonly scope: ControlPlaneAuthorizationScope;
  readonly target: HighImpactActionTarget;
  readonly targetRevision: number;
  readonly reason: string;
  readonly requestId: string;
  readonly stepUpIntentId: string;
  readonly occurredAt: string;
}

export type AtomicHighImpactActionResult =
  | {
      readonly kind: "executed";
      readonly targetRevision: number;
    }
  | { readonly kind: "authorization_changed" }
  | { readonly kind: "intent_expired" }
  | { readonly kind: "intent_replayed" }
  | { readonly kind: "not_found_or_forbidden" }
  | { readonly kind: "target_revision_conflict" };

export type StepUpIntentVerifierResult =
  | {
      readonly kind: "verified";
      readonly claims: StepUpIntentClaims;
    }
  | { readonly kind: "invalid" }
  | { readonly kind: "expired" }
  | { readonly kind: "dependency_unavailable" };

export interface StepUpIntentVerifier {
  verifyStepUpIntentToken(token: string): Promise<unknown>;
}

export interface HighImpactActionRepository {
  executeHighImpactActionAndRecordAudit(input: {
    readonly verifiedIntent: {
      readonly intentId: string;
      readonly expiresAt: string;
    };
    readonly actorId: string;
    readonly action: HighImpactActionKind;
    readonly scope: ControlPlaneAuthorizationScope;
    readonly target: HighImpactActionTarget;
    readonly requiredCapability: ControlPlaneCapability;
    readonly reason: string;
    readonly requestId: string;
    readonly occurredAt: string;
    readonly authorization: {
      readonly actorId: string;
      readonly scope: ControlPlaneAuthorizationScope;
      readonly capability: ControlPlaneCapability;
    };
  }): Promise<AtomicHighImpactActionResult>;
}

export type HighImpactActionExecutionResult =
  | {
      readonly ok: true;
      readonly value: {
        readonly action: HighImpactActionKind;
        readonly target: HighImpactActionTarget;
        readonly targetRevision: number;
      };
    }
  | {
      readonly ok: false;
      readonly error:
        | ControlApiAuthorizationFailure
        | ControlApiDependencyFailure
        | ControlApiStepUpFailure;
    };

function capabilityForHighImpactAction(
  action: HighImpactActionKind,
): ControlPlaneCapability | undefined {
  return highImpactActionCapabilityMatrix[action];
}

function isKnownControlPlaneCapability(
  value: unknown,
): value is ControlPlaneCapability {
  return (
    typeof value === "string" &&
    Object.values(controlPlaneCapabilities).includes(
      value as ControlPlaneCapability,
    )
  );
}

const highImpactActionScopeKindMatrix = Object.freeze({
  "credential.revoke": "project",
  "deployment.pause": "project",
  "deployment.publish": "project",
  "scope.expand.data": "project",
  "scope.expand.output": "project",
  "service_version.retire": "project",
} as const satisfies Readonly<Record<HighImpactActionKind, "project">>);

function requiredScopeKindForHighImpactAction(
  action: HighImpactActionKind,
): "project" {
  return highImpactActionScopeKindMatrix[action];
}

function isReason(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 500 &&
    !/[\r\n]/.test(value)
  );
}

function isRequestId(value: unknown): value is string {
  return typeof value === "string" && requestIdPattern.test(value);
}

function isStepUpToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= minStepUpTokenLength &&
    value.length <= maxStepUpTokenLength
  );
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  try {
    const allowed = new Set(allowedKeys);
    return Object.keys(value).every((key) => allowed.has(key));
  } catch {
    return false;
  }
}

function decodeControlPlaneScope(
  value: unknown,
  requireExactKeys = false,
): ControlPlaneAuthorizationScope | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  let kind: unknown;
  let workspaceId: unknown;
  let projectId: unknown;
  let environment: unknown;
  try {
    kind = value.kind;
    workspaceId = value.workspaceId;
    projectId = value.projectId;
    environment = value.environment;
  } catch {
    return undefined;
  }

  if (kind === "workspace") {
    if (
      typeof workspaceId !== "string" ||
      (requireExactKeys && !hasOnlyKeys(value, ["kind", "workspaceId"]))
    ) {
      return undefined;
    }
    return Object.freeze({
      kind,
      workspaceId,
    });
  }

  if (kind === "project") {
    if (
      typeof workspaceId !== "string" ||
      typeof projectId !== "string" ||
      (environment !== "development" &&
        environment !== "test" &&
        environment !== "production") ||
      (requireExactKeys &&
        !hasOnlyKeys(value, [
          "kind",
          "workspaceId",
          "projectId",
          "environment",
        ]))
    ) {
      return undefined;
    }
    return Object.freeze({
      kind,
      workspaceId,
      projectId,
      environment,
    });
  }

  return undefined;
}

function isControlPlaneScope(
  value: unknown,
): value is ControlPlaneAuthorizationScope {
  return decodeControlPlaneScope(value) !== undefined;
}

function decodeHighImpactTarget(
  value: unknown,
  requireExactKeys = false,
): HighImpactActionTarget | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  let kind: unknown;
  let id: unknown;
  let revision: unknown;
  try {
    kind = value.kind;
    id = value.id;
    revision = value.revision;
  } catch {
    return undefined;
  }

  if (
    (kind !== "credential" &&
      kind !== "data_scope" &&
      kind !== "deployment" &&
      kind !== "output_scope" &&
      kind !== "service_version") ||
    typeof id !== "string" ||
    typeof revision !== "number" ||
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    revision >= Number.MAX_SAFE_INTEGER ||
    (requireExactKeys && !hasOnlyKeys(value, ["kind", "id", "revision"]))
  ) {
    return undefined;
  }

  return Object.freeze({
    kind,
    id,
    revision,
  });
}

function isHighImpactTarget(value: unknown): value is HighImpactActionTarget {
  return decodeHighImpactTarget(value) !== undefined;
}

function decodeVerifiedClaims(value: unknown): StepUpIntentClaims | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (
    !hasOnlyKeys(value, [
      "intentId",
      "actorId",
      "action",
      "scope",
      "target",
      "authenticatedAt",
      "issuedAt",
      "expiresAt",
    ])
  ) {
    return undefined;
  }

  let intentId: unknown;
  let actorId: unknown;
  let action: unknown;
  let scope: unknown;
  let target: unknown;
  let authenticatedAt: unknown;
  let issuedAt: unknown;
  let expiresAt: unknown;
  try {
    intentId = value.intentId;
    actorId = value.actorId;
    action = value.action;
    scope = value.scope;
    target = value.target;
    authenticatedAt = value.authenticatedAt;
    issuedAt = value.issuedAt;
    expiresAt = value.expiresAt;
  } catch {
    return undefined;
  }

  if (
    typeof intentId !== "string" ||
    typeof actorId !== "string" ||
    !isHighImpactActionKind(action) ||
    typeof authenticatedAt !== "string" ||
    typeof issuedAt !== "string" ||
    typeof expiresAt !== "string"
  ) {
    return undefined;
  }
  const decodedScope = decodeControlPlaneScope(scope, true);
  const decodedTarget = decodeHighImpactTarget(target, true);
  if (!decodedScope || !decodedTarget) {
    return undefined;
  }

  return Object.freeze({
    intentId,
    actorId,
    action,
    scope: decodedScope,
    target: decodedTarget,
    authenticatedAt,
    issuedAt,
    expiresAt,
  });
}

function decodeStepUpVerifierResult(
  value: unknown,
): StepUpIntentVerifierResult | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  let kind: unknown;
  let claims: unknown;
  try {
    kind = value.kind;
    claims = value.claims;
  } catch {
    return undefined;
  }

  if (
    kind === "invalid" ||
    kind === "expired" ||
    kind === "dependency_unavailable"
  ) {
    return hasOnlyKeys(value, ["kind"]) ? { kind } : undefined;
  }
  if (kind !== "verified") {
    return undefined;
  }
  if (!hasOnlyKeys(value, ["kind", "claims"])) {
    return undefined;
  }

  const decodedClaims = decodeVerifiedClaims(claims);
  if (!decodedClaims) {
    return undefined;
  }
  return {
    kind: "verified",
    claims: decodedClaims,
  };
}

function decodeAuthorizationDecision(
  value: unknown,
): ControlPlaneAuthorizationDecision | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  let allow: unknown;
  try {
    allow = value.allow;
  } catch {
    return undefined;
  }

  if (allow === false) {
    if (!hasOnlyKeys(value, ["allow", "reason"])) {
      return undefined;
    }
    let reason: unknown;
    try {
      reason = value.reason;
    } catch {
      return undefined;
    }
    return reason === "not_found_or_forbidden"
      ? { allow: false, reason }
      : undefined;
  }
  if (allow !== true) {
    return undefined;
  }
  if (!hasOnlyKeys(value, ["allow", "actorId", "scope", "capability"])) {
    return undefined;
  }

  let actorIdValue: unknown;
  let scopeValue: unknown;
  let capabilityValue: unknown;
  try {
    actorIdValue = value.actorId;
    scopeValue = value.scope;
    capabilityValue = value.capability;
  } catch {
    return undefined;
  }

  if (
    typeof actorIdValue !== "string" ||
    !isKnownControlPlaneCapability(capabilityValue)
  ) {
    return undefined;
  }
  const decodedScope = decodeControlPlaneScope(scopeValue, true);
  if (!decodedScope || decodedScope.kind !== "project") {
    return undefined;
  }

  return {
    allow: true,
    actorId: actorIdValue,
    scope: decodedScope,
    capability: capabilityValue,
  };
}

function scopesEqual(
  left: ControlPlaneAuthorizationScope,
  right: ControlPlaneAuthorizationScope,
): boolean {
  if (left.kind !== right.kind || left.workspaceId !== right.workspaceId) {
    return false;
  }
  if (left.kind === "workspace") {
    return right.kind === "workspace";
  }
  return (
    right.kind === "project" &&
    left.projectId === right.projectId &&
    left.environment === right.environment
  );
}

function cloneProjectScope(
  scope: ControlPlaneAuthorizationScope,
): Extract<ControlPlaneAuthorizationScope, { readonly kind: "project" }> {
  if (scope.kind !== "project") {
    throw new Error("trusted high-impact scope must be project");
  }
  return Object.freeze({
    kind: "project" as const,
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    environment: scope.environment,
  });
}

function decodeAtomicHighImpactActionResult(
  value: unknown,
): AtomicHighImpactActionResult | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  let kind: unknown;
  let targetRevision: unknown;
  try {
    kind = value.kind;
    targetRevision = value.targetRevision;
  } catch {
    return undefined;
  }

  if (
    kind === "authorization_changed" ||
    kind === "intent_expired" ||
    kind === "intent_replayed" ||
    kind === "not_found_or_forbidden" ||
    kind === "target_revision_conflict"
  ) {
    return hasOnlyKeys(value, ["kind"]) ? { kind } : undefined;
  }
  if (kind !== "executed") {
    return undefined;
  }
  if (!hasOnlyKeys(value, ["kind", "targetRevision"])) {
    return undefined;
  }
  return typeof targetRevision === "number"
    ? { kind: "executed", targetRevision }
    : undefined;
}

function readExecutionTime(now: (() => Date) | undefined): Date | undefined {
  try {
    const value = now?.() ?? new Date();
    return Number.isFinite(value.getTime()) ? value : undefined;
  } catch {
    return undefined;
  }
}

export async function executeHighImpactAction(input: {
  readonly actorContext: ActorContext;
  readonly action: unknown;
  readonly scope: unknown;
  readonly target: unknown;
  readonly reason: unknown;
  readonly requestId: unknown;
  readonly stepUpToken: unknown;
  readonly stepUpVerifier: StepUpIntentVerifier;
  readonly repository: HighImpactActionRepository;
  readonly authorize: ControlPlaneAuthorizer;
  readonly now?: () => Date;
}): Promise<HighImpactActionExecutionResult> {
  const now = readExecutionTime(input.now);
  if (!now) {
    return {
      ok: false,
      error: dependencyUnavailable(),
    };
  }
  if (!isHighImpactActionKind(input.action)) {
    return {
      ok: false,
      error: notFoundOrForbidden(),
    };
  }
  const requestScope = decodeControlPlaneScope(input.scope);
  const requestTarget = decodeHighImpactTarget(input.target);
  if (!requestScope || !requestTarget) {
    return {
      ok: false,
      error: notFoundOrForbidden(),
    };
  }
  const capability = capabilityForHighImpactAction(input.action);
  if (!capability) {
    return {
      ok: false,
      error: notFoundOrForbidden(),
    };
  }
  if (
    requestScope.kind !== requiredScopeKindForHighImpactAction(input.action)
  ) {
    return {
      ok: false,
      error: notFoundOrForbidden(),
    };
  }
  if (!isStepUpToken(input.stepUpToken)) {
    return {
      ok: false,
      error: stepUpRequired("missing_step_up_intent"),
    };
  }
  if (!isReason(input.reason) || !isRequestId(input.requestId)) {
    return {
      ok: false,
      error: notFoundOrForbidden(),
    };
  }

  let verifierResult: unknown;
  try {
    verifierResult = await input.stepUpVerifier.verifyStepUpIntentToken(
      input.stepUpToken,
    );
  } catch {
    return {
      ok: false,
      error: dependencyUnavailable(),
    };
  }
  const verified = decodeStepUpVerifierResult(verifierResult);
  if (!verified) {
    return {
      ok: false,
      error: dependencyUnavailable(),
    };
  }
  if (verified.kind === "dependency_unavailable") {
    return {
      ok: false,
      error: dependencyUnavailable(),
    };
  }
  if (verified.kind === "invalid" || verified.kind === "expired") {
    return {
      ok: false,
      error: stepUpRequired(
        verified.kind === "expired"
          ? "step_up_intent_expired"
          : "invalid_step_up_intent",
      ),
    };
  }

  const stepUp = validateStepUpIntentClaims({
    claims: verified.claims,
    actorContext: input.actorContext,
    action: input.action,
    scope: requestScope,
    target: requestTarget,
    now: () => now,
  });
  if (!stepUp.ok) {
    return {
      ok: false,
      error: stepUpRequired(
        stepUp.error.category === "step_up_intent_expired"
          ? "step_up_intent_expired"
          : "invalid_step_up_intent",
      ),
    };
  }

  let rawDecision: unknown;
  try {
    rawDecision = input.authorize(input.actorContext, requestScope, capability);
  } catch {
    return {
      ok: false,
      error: dependencyUnavailable(),
    };
  }
  const decision = decodeAuthorizationDecision(rawDecision);
  if (!decision) {
    return {
      ok: false,
      error: dependencyUnavailable(),
    };
  }
  if (!decision.allow) {
    return {
      ok: false,
      error: notFoundOrForbidden(),
    };
  }
  if (
    decision.actorId !== input.actorContext.actorId ||
    decision.actorId !== stepUp.value.actorId ||
    !scopesEqual(decision.scope, stepUp.value.scope) ||
    stepUp.value.scope.kind !== "project" ||
    decision.capability !== capability
  ) {
    return {
      ok: false,
      error: dependencyUnavailable(),
    };
  }

  const trustedActorId = stepUp.value.actorId;
  const trustedAuthorizationScope = cloneProjectScope(stepUp.value.scope);
  const trustedAuthorization = Object.freeze({
    actorId: trustedActorId,
    scope: trustedAuthorizationScope,
    capability,
  });

  let rawResult: unknown;
  try {
    rawResult = await input.repository.executeHighImpactActionAndRecordAudit({
      verifiedIntent: {
        intentId: stepUp.value.intentId,
        expiresAt: stepUp.value.expiresAt,
      },
      actorId: trustedActorId,
      action: stepUp.value.action,
      scope: stepUp.value.scope,
      target: stepUp.value.target,
      requiredCapability: capability,
      reason: input.reason,
      requestId: input.requestId,
      occurredAt: now.toISOString(),
      authorization: trustedAuthorization,
    });
  } catch {
    return {
      ok: false,
      error: dependencyUnavailable(),
    };
  }
  const result = decodeAtomicHighImpactActionResult(rawResult);
  if (!result) {
    return {
      ok: false,
      error: dependencyUnavailable(),
    };
  }

  if (result.kind === "intent_expired" || result.kind === "intent_replayed") {
    return {
      ok: false,
      error: stepUpRequired(
        result.kind === "intent_expired"
          ? "step_up_intent_expired"
          : "step_up_intent_replayed",
      ),
    };
  }
  if (
    result.kind === "authorization_changed" ||
    result.kind === "not_found_or_forbidden" ||
    result.kind === "target_revision_conflict"
  ) {
    return {
      ok: false,
      error: notFoundOrForbidden(),
    };
  }
  if (
    !Number.isSafeInteger(result.targetRevision) ||
    result.targetRevision !== stepUp.value.target.revision + 1
  ) {
    return {
      ok: false,
      error: dependencyUnavailable(),
    };
  }

  return {
    ok: true,
    value: {
      action: stepUp.value.action,
      target: stepUp.value.target,
      targetRevision: result.targetRevision,
    },
  };
}

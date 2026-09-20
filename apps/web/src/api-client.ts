import type {
  AcceptedJobResponse,
  CreateDataSourceRequest,
  CreateDraftRequest,
  CreateProjectRequest,
  CreateWorkspaceRequest,
  Cursor,
  CursorPaginationRequest,
  DataSourceListResponse,
  DataSourceResponse,
  DataVersionResponse,
  DraftListResponse,
  DraftResponse,
  Environment,
  ErrorEnvelope,
  Job,
  ModuleListResponse,
  ModuleVersionResponse,
  ProjectListResponse,
  ProjectResponse,
  StartDataVersionProcessingRequest,
  UpdateDraftRequest,
  UpdateProjectRequest,
  WorkspaceListResponse,
  WorkspaceResponse,
} from "@modular-mcp/contracts";
import {
  validateAcceptedJobResponse,
  validateDataSourceListResponse,
  validateDataSourceResponse,
  validateDataVersionResponse,
  validateDraftListResponse,
  validateDraftResponse,
  validateErrorEnvelope,
  validateJob,
  validateModuleListResponse,
  validateModuleVersionResponse,
  validateProjectListResponse,
  validateProjectResponse,
  validateWorkspaceListResponse,
  validateWorkspaceResponse,
  type ContractDecodeResult,
} from "@modular-mcp/contracts";

export type CursorParams = CursorPaginationRequest;

export interface ScopeParams {
  readonly workspaceId: string;
}

export interface ProjectScopeParams extends ScopeParams {
  readonly projectId: string;
}

export interface EnvironmentScopeParams extends ProjectScopeParams {
  readonly environment: Environment;
}

export interface IdempotentRequest {
  readonly idempotencyKey: string;
}

export interface ApiClientConfig {
  readonly baseUrl?: string;
  readonly fetch: typeof fetch;
  readonly getAuthorizationHeader?: () => string | undefined;
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export type ApiJobResult = ApiAcceptedJob | ApiFailure;

export interface ApiSuccess<T> {
  readonly ok: true;
  readonly status: number;
  readonly data: T;
}

export interface ApiAcceptedJob {
  readonly ok: true;
  readonly status: 202;
  readonly job: AcceptedJobResponse;
}

export interface ApiFailure {
  readonly ok: false;
  readonly status: number;
  readonly error: ErrorEnvelope["error"];
  readonly authAction?: "reauthenticate" | "hide-sensitive-content";
}

type ClientHeaders = Headers | Record<string, string>;
type Decoder<T> = (value: unknown) => ContractDecodeResult<T>;

export interface ControlPlaneApiClient {
  listWorkspaces(
    params?: CursorParams,
  ): Promise<ApiResult<WorkspaceListResponse>>;
  createWorkspace(
    body: CreateWorkspaceRequest,
    request: IdempotentRequest,
  ): Promise<ApiResult<WorkspaceResponse>>;
  getWorkspace(params: ScopeParams): Promise<ApiResult<WorkspaceResponse>>;
  listProjects(
    params: ScopeParams & CursorParams,
  ): Promise<ApiResult<ProjectListResponse>>;
  createProject(
    params: ScopeParams,
    body: CreateProjectRequest,
    request: IdempotentRequest,
  ): Promise<ApiResult<ProjectResponse>>;
  getProject(params: ProjectScopeParams): Promise<ApiResult<ProjectResponse>>;
  updateProject(
    params: ProjectScopeParams,
    body: UpdateProjectRequest,
  ): Promise<ApiResult<ProjectResponse>>;
  archiveProject(
    params: ProjectScopeParams,
    request: IdempotentRequest,
  ): Promise<ApiResult<ProjectResponse>>;
  restoreProject(
    params: ProjectScopeParams,
    request: IdempotentRequest,
  ): Promise<ApiResult<ProjectResponse>>;
  listDrafts(
    params: EnvironmentScopeParams & CursorParams,
  ): Promise<ApiResult<DraftListResponse>>;
  createDraft(
    params: EnvironmentScopeParams,
    body: CreateDraftRequest,
    request: IdempotentRequest,
  ): Promise<ApiResult<DraftResponse>>;
  getDraft(
    params: EnvironmentScopeParams & { readonly draftId: string },
  ): Promise<ApiResult<DraftResponse>>;
  updateDraft(
    params: EnvironmentScopeParams & {
      readonly draftId: string;
      readonly ifMatch: string;
    },
    body: UpdateDraftRequest,
  ): Promise<ApiResult<DraftResponse>>;
  listDataSources(
    params: EnvironmentScopeParams & CursorParams,
  ): Promise<ApiResult<DataSourceListResponse>>;
  createDataSource(
    params: EnvironmentScopeParams,
    body: CreateDataSourceRequest,
    request: IdempotentRequest,
  ): Promise<ApiResult<DataSourceResponse>>;
  getDataSource(
    params: EnvironmentScopeParams & { readonly dataSourceId: string },
  ): Promise<ApiResult<DataSourceResponse>>;
  startDataVersionProcessing(
    params: EnvironmentScopeParams & { readonly dataSourceId: string },
    request: IdempotentRequest & StartDataVersionProcessingRequest,
  ): Promise<ApiJobResult>;
  getDataVersion(
    params: EnvironmentScopeParams & { readonly dataVersionId: string },
  ): Promise<ApiResult<DataVersionResponse>>;
  listModuleCatalog(
    params: { readonly environment: Environment } & CursorParams,
  ): Promise<ApiResult<ModuleListResponse>>;
  getModuleCatalogVersion(params: {
    readonly environment: Environment;
    readonly moduleId: string;
    readonly moduleVersion: string;
  }): Promise<ApiResult<ModuleVersionResponse>>;
  getJob(params: { readonly jobId: string }): Promise<ApiResult<Job>>;
}

export function createControlPlaneApiClient(
  config: ApiClientConfig,
): ControlPlaneApiClient {
  const baseUrl = (config.baseUrl ?? "").replace(/\/$/, "");

  async function request<T>(
    method: string,
    path: string,
    expectedStatus: number,
    decoder: Decoder<T>,
    options: {
      readonly query?: QueryParams;
      readonly body?: unknown;
      readonly headers?: ClientHeaders;
    } = {},
  ): Promise<ApiResult<T>> {
    const response = await parseResponse(method, path, options);
    if (!response.ok) {
      return response.failure;
    }
    if (response.value.status !== expectedStatus) {
      return contractFailure(response.value.status, "unexpected_http_status");
    }
    const body = await readJson(response.value);
    if (!body.ok) {
      return contractFailure(response.value.status, body.reason);
    }
    const decoded = decoder(body.value);
    if (!decoded.ok) {
      return contractFailure(response.value.status, "invalid_success_payload");
    }
    return {
      ok: true,
      status: response.value.status,
      data: decoded.value,
    };
  }

  async function parseResponse(
    method: string,
    path: string,
    options: {
      readonly query?: QueryParams;
      readonly body?: unknown;
      readonly headers?: ClientHeaders;
    },
  ): Promise<
    | { readonly ok: true; readonly value: Response }
    | { readonly ok: false; readonly failure: ApiFailure }
  > {
    let response: Response;
    try {
      response = await send(method, path, options);
    } catch {
      return { ok: false, failure: contractFailure(0, "network_failure") };
    }
    if (!response.ok) {
      return { ok: false, failure: await parseFailure(response) };
    }
    return { ok: true, value: response };
  }

  async function acceptedJob(
    method: string,
    path: string,
    options: {
      readonly body?: unknown;
      readonly headers?: ClientHeaders;
    },
  ): Promise<ApiJobResult> {
    const response = await parseResponse(method, path, options);
    if (!response.ok) {
      return response.failure;
    }
    if (response.value.status !== 202) {
      return contractFailure(response.value.status, "unexpected_http_status");
    }
    const body = await readJson(response.value);
    if (!body.ok) {
      return contractFailure(response.value.status, body.reason);
    }
    const decoded = validateAcceptedJobResponse(body.value);
    if (!decoded.ok) {
      return contractFailure(response.value.status, "invalid_accepted_job");
    }
    return { ok: true, status: 202, job: decoded.value };
  }

  async function send(
    method: string,
    path: string,
    options: {
      readonly query?: QueryParams;
      readonly body?: unknown;
      readonly headers?: ClientHeaders;
    },
  ): Promise<Response> {
    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");
    const authorization = config.getAuthorizationHeader?.();
    if (authorization) {
      headers.set("Authorization", authorization);
    }
    const init: RequestInit = { method, headers };
    if (options.body !== undefined) {
      headers.set("Content-Type", "application/json");
      init.body = JSON.stringify(options.body);
    }
    return config.fetch(`${baseUrl}${path}${queryString(options.query)}`, init);
  }

  return {
    listWorkspaces(params = {}) {
      return request(
        "GET",
        "/api/v1/workspaces",
        200,
        validateWorkspaceListResponse,
        { query: cursorQuery(params) },
      );
    },
    createWorkspace(body, idempotent) {
      return request(
        "POST",
        "/api/v1/workspaces",
        201,
        validateWorkspaceResponse,
        {
          body,
          headers: idempotencyHeader(idempotent),
        },
      );
    },
    getWorkspace(params) {
      return request(
        "GET",
        `/api/v1/workspaces/${segment(params.workspaceId)}`,
        200,
        validateWorkspaceResponse,
      );
    },
    listProjects(params) {
      return request(
        "GET",
        `/api/v1/workspaces/${segment(params.workspaceId)}/projects`,
        200,
        validateProjectListResponse,
        { query: cursorQuery(params) },
      );
    },
    createProject(params, body, idempotent) {
      return request(
        "POST",
        `/api/v1/workspaces/${segment(params.workspaceId)}/projects`,
        201,
        validateProjectResponse,
        { body, headers: idempotencyHeader(idempotent) },
      );
    },
    getProject(params) {
      return request("GET", projectPath(params), 200, validateProjectResponse);
    },
    updateProject(params, body) {
      return request(
        "PATCH",
        projectPath(params),
        200,
        validateProjectResponse,
        {
          body,
        },
      );
    },
    archiveProject(params, idempotent) {
      return request(
        "POST",
        `${projectPath(params)}:archive`,
        200,
        validateProjectResponse,
        {
          headers: idempotencyHeader(idempotent),
        },
      );
    },
    restoreProject(params, idempotent) {
      return request(
        "POST",
        `${projectPath(params)}:restore`,
        200,
        validateProjectResponse,
        {
          headers: idempotencyHeader(idempotent),
        },
      );
    },
    listDrafts(params) {
      return request(
        "GET",
        `${environmentPath(params)}/drafts`,
        200,
        validateDraftListResponse,
        { query: cursorQuery(params) },
      );
    },
    createDraft(params, body, idempotent) {
      return request(
        "POST",
        `${environmentPath(params)}/drafts`,
        201,
        validateDraftResponse,
        {
          body,
          headers: idempotencyHeader(idempotent),
        },
      );
    },
    getDraft(params) {
      return request(
        "GET",
        `${environmentPath(params)}/drafts/${segment(params.draftId)}`,
        200,
        validateDraftResponse,
      );
    },
    updateDraft(params, body) {
      return request(
        "PATCH",
        `${environmentPath(params)}/drafts/${segment(params.draftId)}`,
        200,
        validateDraftResponse,
        { body, headers: { "If-Match": params.ifMatch } },
      );
    },
    listDataSources(params) {
      return request(
        "GET",
        `${environmentPath(params)}/data-sources`,
        200,
        validateDataSourceListResponse,
        { query: cursorQuery(params) },
      );
    },
    createDataSource(params, body, idempotent) {
      return request(
        "POST",
        `${environmentPath(params)}/data-sources`,
        201,
        validateDataSourceResponse,
        {
          body,
          headers: idempotencyHeader(idempotent),
        },
      );
    },
    getDataSource(params) {
      return request(
        "GET",
        `${environmentPath(params)}/data-sources/${segment(params.dataSourceId)}`,
        200,
        validateDataSourceResponse,
      );
    },
    startDataVersionProcessing(params, processing) {
      return acceptedJob(
        "POST",
        `${environmentPath(params)}/data-sources/${segment(
          params.dataSourceId,
        )}/versions`,
        {
          body:
            processing.expectedFileCount === undefined
              ? {}
              : { expectedFileCount: processing.expectedFileCount },
          headers: idempotencyHeader(processing),
        },
      );
    },
    getDataVersion(params) {
      return request(
        "GET",
        `${environmentPath(params)}/data-versions/${segment(
          params.dataVersionId,
        )}`,
        200,
        validateDataVersionResponse,
      );
    },
    listModuleCatalog(params) {
      return request(
        "GET",
        "/api/v1/module-catalog/modules",
        200,
        validateModuleListResponse,
        {
          query: moduleCatalogQuery(params),
        },
      );
    },
    getModuleCatalogVersion(params) {
      return request(
        "GET",
        `/api/v1/module-catalog/modules/${segment(
          params.moduleId,
        )}/versions/${segment(params.moduleVersion)}`,
        200,
        validateModuleVersionResponse,
        { query: { environment: params.environment } },
      );
    },
    getJob(params) {
      return request(
        "GET",
        `/api/v1/jobs/${segment(params.jobId)}`,
        200,
        validateJob,
      );
    },
  };
}

type QueryPrimitive = string | number | boolean;
type QueryParams = Readonly<Record<string, QueryPrimitive | undefined>>;

function projectPath(params: ProjectScopeParams): string {
  return `/api/v1/workspaces/${segment(params.workspaceId)}/projects/${segment(
    params.projectId,
  )}`;
}

function environmentPath(params: EnvironmentScopeParams): string {
  return `${projectPath(params)}/environments/${segment(params.environment)}`;
}

function idempotencyHeader(request: IdempotentRequest): ClientHeaders {
  return { "Idempotency-Key": request.idempotencyKey };
}

function segment(value: string): string {
  return encodeURIComponent(value);
}

function cursorQuery(params: CursorParams): QueryParams {
  return {
    cursor: params.cursor,
    limit: params.limit,
  };
}

function moduleCatalogQuery(
  params: { readonly environment: Environment } & CursorParams,
): QueryParams {
  return {
    environment: params.environment,
    cursor: params.cursor,
    limit: params.limit,
  };
}

function queryString(params: QueryParams | undefined): string {
  if (!params) {
    return "";
  }
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (
      value === undefined ||
      key === "workspaceId" ||
      key === "projectId" ||
      key === "dataSourceId" ||
      key === "dataVersionId" ||
      key === "draftId"
    ) {
      continue;
    }
    if (
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      continue;
    }
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

async function parseFailure(response: Response): Promise<ApiFailure> {
  const body = await readJson(response);
  if (!body.ok) {
    return contractFailure(response.status, body.reason);
  }
  const decoded = validateErrorEnvelope(body.value);
  if (!decoded.ok) {
    return contractFailure(response.status, "invalid_error_envelope");
  }
  return {
    ok: false,
    status: response.status,
    error: decoded.value.error,
    ...authActionFor(response.status, decoded.value),
  };
}

function authActionFor(
  status: number,
  envelope: ErrorEnvelope,
): Pick<ApiFailure, "authAction"> | Record<string, never> {
  if (status === 401) {
    return { authAction: "reauthenticate" };
  }
  if (
    status === 403 ||
    envelope.error.code === "AUTHZ_NOT_FOUND_OR_DENIED" ||
    envelope.error.category === "AUTHZ"
  ) {
    return { authAction: "hide-sensitive-content" };
  }
  return {};
}

async function readJson(
  response: Response,
): Promise<
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly reason: string }
> {
  if (response.status === 204) {
    return { ok: false, reason: "empty_response" };
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!/\bapplication\/json\b|\+json\b/i.test(contentType)) {
    return { ok: false, reason: "non_json_response" };
  }
  try {
    return { ok: true, value: await response.json() };
  } catch {
    return { ok: false, reason: "invalid_json_response" };
  }
}

function contractFailure(status: number, reason: string): ApiFailure {
  return {
    ok: false,
    status,
    error: {
      code: "DEPENDENCY_UNAVAILABLE",
      category: "DEPENDENCY",
      message: "Control-plane response failed contract validation.",
      requestId: "req_client_contract_failure",
      retryable: true,
      nextAction:
        "Retry after the control-plane response contract is restored.",
      details: { reason },
    },
  };
}

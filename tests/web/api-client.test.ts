import { describe, expect, it } from "vitest";
import {
  createControlPlaneApiClient,
  type ApiFailure,
} from "../../apps/web/src/index.js";

interface FetchCall {
  readonly url: string;
  readonly init: RequestInit;
}

const now = "2026-09-19T00:00:00Z";
const workspaceId = "ws_018f0000-0000-7000-8000-000000000001";
const projectId = "prj_018f0000-0000-7000-8000-000000000201";
const dataSourceId = "src_018f0000-0000-7000-8000-000000000301";
const draftId = "drf_018f0000-0000-7000-8000-000000000401";
const jobId = "job_018f0000-0000-7000-8000-000000000501";

function mockFetch(
  response: unknown,
  status = 200,
  headers: HeadersInit = { "Content-Type": "application/json" },
): { readonly calls: readonly FetchCall[]; readonly fetch: typeof fetch } {
  const calls: FetchCall[] = [];
  return {
    calls,
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      return new Response(
        response === undefined ? undefined : JSON.stringify(response),
        { status, headers },
      );
    }) as typeof fetch,
  };
}

function throwingFetch(): typeof fetch {
  return (async () => {
    throw new Error("Authorization Bearer super-secret-token exploded");
  }) as typeof fetch;
}

function page(items: readonly unknown[] = []) {
  return { items, pageInfo: { hasMore: false } };
}

function workspace(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId,
    kind: "team",
    displayName: "Alpha",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function project(overrides: Record<string, unknown> = {}) {
  return {
    projectId,
    workspaceId,
    name: "Alpha project",
    defaultRegion: "us-east-1",
    defaultEnvironment: "development",
    status: "active",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function draft(overrides: Record<string, unknown> = {}) {
  return {
    draftId,
    projectId,
    environment: "development",
    name: "Draft",
    status: "editing",
    revision: 2,
    currentStep: "goal",
    updatedAt: now,
    ...overrides,
  };
}

function dataSource(overrides: Record<string, unknown> = {}) {
  return {
    dataSourceId,
    projectId,
    environment: "development",
    kind: "file_upload",
    displayName: "Source",
    sensitivity: "internal",
    versionStrategy: "fixed",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function moduleSummary() {
  return {
    moduleId: "mod_search",
    moduleVersion: "1.0.0",
    kind: "capability",
    displayName: "Search",
    riskLevel: "low",
    reviewStatus: "approved",
    capabilities: ["service.read"],
  };
}

function moduleVersion() {
  return {
    ...moduleSummary(),
    dependencies: [],
  };
}

function acceptedJob(overrides: Record<string, unknown> = {}) {
  return {
    jobId,
    status: "accepted",
    statusUrl: `/api/v1/jobs/${jobId}`,
    ...overrides,
  };
}

function errorEnvelope(
  code: "AUTHN_SESSION_EXPIRED" | "AUTHZ_NOT_FOUND_OR_DENIED",
) {
  return {
    error: {
      code,
      category: code === "AUTHN_SESSION_EXPIRED" ? "AUTHN" : "AUTHZ",
      message: "Access denied",
      requestId: "req_018f0000-0000-7000-8000-000000000001",
      retryable: false,
      nextAction: "Sign in again or request access.",
    },
  };
}

function expectDependencyFailure(result: unknown, status: number) {
  expect(result).toMatchObject({
    ok: false,
    status,
    error: {
      code: "DEPENDENCY_UNAVAILABLE",
      category: "DEPENDENCY",
    },
  } satisfies ApiFailure);
  expect(JSON.stringify(result)).not.toContain("super-secret-token");
}

describe("control-plane API client", () => {
  it("decodes success responses and sends cursor pagination and authorization", async () => {
    const transport = mockFetch(page([workspace()]));
    const client = createControlPlaneApiClient({
      baseUrl: "https://control.example",
      fetch: transport.fetch,
      getAuthorizationHeader: () => "Bearer session-token",
    });

    await expect(
      client.listWorkspaces({ cursor: "cursor_token1", limit: 25 }),
    ).resolves.toEqual({
      ok: true,
      status: 200,
      data: page([workspace()]),
    });
    expect(transport.calls[0]?.url).toBe(
      "https://control.example/api/v1/workspaces?cursor=cursor_token1&limit=25",
    );
    expect(
      new Headers(transport.calls[0]?.init.headers).get("Authorization"),
    ).toBe("Bearer session-token");
  });

  it("uses exact operation query allowlists and final URLs", async () => {
    const transport = mockFetch(page());
    const client = createControlPlaneApiClient({
      baseUrl: "https://control.example",
      fetch: transport.fetch,
    });

    await client.listProjects({
      workspaceId,
      cursor: "cursor_token1",
      limit: 10,
    });
    await client.listDrafts({
      workspaceId,
      projectId,
      environment: "development",
      cursor: "cursor_token2",
      limit: 20,
    });
    await client.listDataSources({
      workspaceId,
      projectId,
      environment: "test",
      cursor: "cursor_token3",
      limit: 30,
    });
    await client.listModuleCatalog({
      environment: "production",
      cursor: "cursor_token4",
      limit: 40,
    });

    const versionTransport = mockFetch(moduleVersion());
    await createControlPlaneApiClient({
      baseUrl: "https://control.example",
      fetch: versionTransport.fetch,
    }).getModuleCatalogVersion({
      environment: "production",
      moduleId: "mod_search/documents",
      moduleVersion: "1.0.0+build",
    });

    expect(transport.calls.map((call) => call.url)).toEqual([
      `https://control.example/api/v1/workspaces/${workspaceId}/projects?cursor=cursor_token1&limit=10`,
      `https://control.example/api/v1/workspaces/${workspaceId}/projects/${projectId}/environments/development/drafts?cursor=cursor_token2&limit=20`,
      `https://control.example/api/v1/workspaces/${workspaceId}/projects/${projectId}/environments/test/data-sources?cursor=cursor_token3&limit=30`,
      "https://control.example/api/v1/module-catalog/modules?environment=production&cursor=cursor_token4&limit=40",
    ]);
    expect(versionTransport.calls[0]?.url).toBe(
      "https://control.example/api/v1/module-catalog/modules/mod_search%2Fdocuments/versions/1.0.0%2Bbuild?environment=production",
    );
  });

  it("uses contract headers for idempotent writes and draft revisions", async () => {
    const transport = mockFetch(draft());
    const client = createControlPlaneApiClient({ fetch: transport.fetch });

    await client.updateDraft(
      {
        workspaceId,
        projectId,
        environment: "development",
        draftId,
        ifMatch: "rev-1",
      },
      { revision: 1, patch: { name: "Draft" } },
    );

    expect(transport.calls[0]?.url).toBe(
      `/api/v1/workspaces/${workspaceId}/projects/${projectId}/environments/development/drafts/${draftId}`,
    );
    expect(new Headers(transport.calls[0]?.init.headers).get("If-Match")).toBe(
      "rev-1",
    );
  });

  it("decodes 202 AcceptedJobResponse for async processing", async () => {
    const transport = mockFetch(acceptedJob(), 202);
    const client = createControlPlaneApiClient({ fetch: transport.fetch });

    await expect(
      client.startDataVersionProcessing(
        {
          workspaceId,
          projectId,
          environment: "production",
          dataSourceId,
        },
        { idempotencyKey: "idem_1", expectedFileCount: 3 },
      ),
    ).resolves.toEqual({ ok: true, status: 202, job: acceptedJob() });
    expect(transport.calls[0]?.url).toBe(
      `/api/v1/workspaces/${workspaceId}/projects/${projectId}/environments/production/data-sources/${dataSourceId}/versions`,
    );
    expect(
      new Headers(transport.calls[0]?.init.headers).get("Idempotency-Key"),
    ).toBe("idem_1");
  });

  it("maps 401 403 and 404 contract errors to stable auth actions", async () => {
    const expired = mockFetch(errorEnvelope("AUTHN_SESSION_EXPIRED"), 401);
    const denied403 = mockFetch(
      errorEnvelope("AUTHZ_NOT_FOUND_OR_DENIED"),
      403,
    );
    const denied404 = mockFetch(
      errorEnvelope("AUTHZ_NOT_FOUND_OR_DENIED"),
      404,
    );

    const expiredResult = await createControlPlaneApiClient({
      fetch: expired.fetch,
    }).getJob({ jobId });
    const denied403Result = await createControlPlaneApiClient({
      fetch: denied403.fetch,
    }).getJob({ jobId });
    const denied404Result = await createControlPlaneApiClient({
      fetch: denied404.fetch,
    }).getJob({ jobId });

    expect(expiredResult).toMatchObject({
      ok: false,
      status: 401,
      authAction: "reauthenticate",
      error: { code: "AUTHN_SESSION_EXPIRED" },
    } satisfies ApiFailure);
    expect(denied403Result).toMatchObject({
      ok: false,
      status: 403,
      authAction: "hide-sensitive-content",
      error: { code: "AUTHZ_NOT_FOUND_OR_DENIED" },
    } satisfies ApiFailure);
    expect(denied404Result).toMatchObject({
      ok: false,
      status: 404,
      authAction: "hide-sensitive-content",
      error: { code: "AUTHZ_NOT_FOUND_OR_DENIED" },
    } satisfies ApiFailure);
  });

  it("fails closed for malformed success payloads and additionalProperties", async () => {
    const malformed = mockFetch({ nope: true });
    const extra = mockFetch(page([{ ...workspace(), extra: true }]));

    await expect(
      createControlPlaneApiClient({ fetch: malformed.fetch }).listWorkspaces(),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "DEPENDENCY_UNAVAILABLE" },
    });
    await expect(
      createControlPlaneApiClient({ fetch: extra.fetch }).listWorkspaces(),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "DEPENDENCY_UNAVAILABLE" },
    });
  });

  it("fails closed for malformed ErrorEnvelope and malformed 202 Job", async () => {
    const badError = mockFetch(
      { error: { code: "NOPE", category: "NOPE" } },
      401,
    );
    const badJob = mockFetch(acceptedJob({ status: "queued" }), 202);

    await expect(
      createControlPlaneApiClient({ fetch: badError.fetch }).getJob({ jobId }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "DEPENDENCY_UNAVAILABLE" },
    });
    await expect(
      createControlPlaneApiClient({
        fetch: badJob.fetch,
      }).startDataVersionProcessing(
        { workspaceId, projectId, environment: "production", dataSourceId },
        { idempotencyKey: "idem_1" },
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "DEPENDENCY_UNAVAILABLE" },
    });
  });

  it("fails closed for wrong status 204 empty body non JSON and fetch throw", async () => {
    const wrongStatus = mockFetch(page(), 201);
    const empty = mockFetch(undefined, 204);
    const text = mockFetch("nope", 200, { "Content-Type": "text/plain" });

    expectDependencyFailure(
      await createControlPlaneApiClient({
        fetch: wrongStatus.fetch,
      }).listWorkspaces(),
      201,
    );
    expectDependencyFailure(
      await createControlPlaneApiClient({
        fetch: empty.fetch,
      }).listWorkspaces(),
      204,
    );
    expectDependencyFailure(
      await createControlPlaneApiClient({ fetch: text.fetch }).listWorkspaces(),
      200,
    );
    expectDependencyFailure(
      await createControlPlaneApiClient({
        fetch: throwingFetch(),
      }).listWorkspaces(),
      0,
    );
  });

  it("decodes representative project data source module and job responses", async () => {
    const projectTransport = mockFetch(project());
    const dataSourceTransport = mockFetch(dataSource());
    const moduleTransport = mockFetch(page([moduleSummary()]));
    const jobTransport = mockFetch({
      jobId,
      requestId: "req_018f0000-0000-7000-8000-000000000001",
      status: "running",
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      createControlPlaneApiClient({ fetch: projectTransport.fetch }).getProject(
        { workspaceId, projectId },
      ),
    ).resolves.toMatchObject({ ok: true, data: project() });
    await expect(
      createControlPlaneApiClient({
        fetch: dataSourceTransport.fetch,
      }).getDataSource({
        workspaceId,
        projectId,
        environment: "development",
        dataSourceId,
      }),
    ).resolves.toMatchObject({ ok: true, data: dataSource() });
    await expect(
      createControlPlaneApiClient({
        fetch: moduleTransport.fetch,
      }).listModuleCatalog({ environment: "development" }),
    ).resolves.toMatchObject({ ok: true, data: page([moduleSummary()]) });
    await expect(
      createControlPlaneApiClient({ fetch: jobTransport.fetch }).getJob({
        jobId,
      }),
    ).resolves.toMatchObject({ ok: true });
  });
});

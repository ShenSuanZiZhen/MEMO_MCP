import type { Environment } from "@modular-mcp/contracts";
import type { TenantQueryCache, TenantScope } from "./cache.js";

export interface SessionWorkspace {
  readonly workspaceId: string;
  readonly displayName: string;
  readonly capabilities: readonly string[];
}

export interface SessionProject {
  readonly projectId: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly defaultEnvironment: Environment;
  readonly environments: readonly Environment[];
  readonly capabilities: readonly string[];
}

export interface AuthenticatedWebSession {
  readonly status: "authenticated";
  readonly actorId: string;
  readonly workspaces: readonly SessionWorkspace[];
  readonly projects: readonly SessionProject[];
  readonly activeScope: TenantScope;
  readonly pageStateRevision: number;
  readonly focusTargetId: "main-content";
}

export interface AnonymousWebSession {
  readonly status: "anonymous";
  readonly pageStateRevision: number;
  readonly focusTargetId: "main-content";
}

export type WebSession = AnonymousWebSession | AuthenticatedWebSession;

export interface SessionController {
  getSession(): WebSession;
  switchWorkspace(workspaceId: string): WebSession;
  switchProject(projectId: string): WebSession;
  switchEnvironment(environment: Environment): WebSession;
  signOut(): WebSession;
}

export function createAnonymousSession(): AnonymousWebSession {
  return {
    status: "anonymous",
    pageStateRevision: 0,
    focusTargetId: "main-content",
  };
}

export function createSessionController(
  initialSession: AuthenticatedWebSession,
  queryCache: TenantQueryCache,
): SessionController {
  let session: WebSession = snapshotSession(initialSession);

  return {
    getSession(): WebSession {
      return session;
    },
    switchWorkspace(workspaceId: string): WebSession {
      const current = requireAuthenticated(session);
      if (current.activeScope.workspaceId === workspaceId) {
        return current;
      }
      if (
        !current.workspaces.some(
          (workspace) => workspace.workspaceId === workspaceId,
        )
      ) {
        throw new Error("workspace is not available in the session");
      }
      const nextProject = current.projects.find(
        (project) => project.workspaceId === workspaceId,
      );
      const nextScope: TenantScope = nextProject
        ? {
            workspaceId,
            projectId: nextProject.projectId,
            environment: defaultAllowedEnvironment(nextProject),
          }
        : { workspaceId };
      queryCache.clearWorkspace(current.activeScope.workspaceId);
      session = switchScope(current, nextScope);
      return session;
    },
    switchProject(projectId: string): WebSession {
      const current = requireAuthenticated(session);
      const project = current.projects.find(
        (candidate) =>
          candidate.workspaceId === current.activeScope.workspaceId &&
          candidate.projectId === projectId,
      );
      if (!project) {
        throw new Error("project is not available in the active workspace");
      }
      const nextScope: TenantScope = {
        workspaceId: current.activeScope.workspaceId,
        projectId,
        environment: defaultAllowedEnvironment(project),
      };
      if (current.activeScope.projectId) {
        queryCache.clearProject(
          current.activeScope.workspaceId,
          current.activeScope.projectId,
        );
      }
      session = switchScope(current, nextScope);
      return session;
    },
    switchEnvironment(environment: Environment): WebSession {
      const current = requireAuthenticated(session);
      if (!isEnvironment(environment) || !current.activeScope.projectId) {
        throw new Error("environment switch requires an active project");
      }
      const project = current.projects.find(
        (candidate) =>
          candidate.workspaceId === current.activeScope.workspaceId &&
          candidate.projectId === current.activeScope.projectId,
      );
      if (!project || !project.environments.includes(environment)) {
        throw new Error("environment is not available in the active project");
      }
      const nextScope: TenantScope = {
        workspaceId: current.activeScope.workspaceId,
        projectId: current.activeScope.projectId,
        environment,
      };
      if (current.activeScope.environment) {
        queryCache.clearEnvironment(
          current.activeScope.workspaceId,
          current.activeScope.projectId,
          current.activeScope.environment,
        );
      }
      session = switchScope(current, nextScope);
      return session;
    },
    signOut(): WebSession {
      queryCache.clearAll();
      session = createAnonymousSession();
      return session;
    },
  };
}

function switchScope(
  current: AuthenticatedWebSession,
  nextScope: TenantScope,
): AuthenticatedWebSession {
  return snapshotSession({
    ...current,
    activeScope: nextScope,
    pageStateRevision: current.pageStateRevision + 1,
    focusTargetId: "main-content",
  });
}

function requireAuthenticated(session: WebSession): AuthenticatedWebSession {
  if (session.status !== "authenticated") {
    throw new Error("authenticated session required");
  }
  return session;
}

function snapshotSession(
  session: AuthenticatedWebSession,
): AuthenticatedWebSession;
function snapshotSession(session: AnonymousWebSession): AnonymousWebSession;
function snapshotSession(session: WebSession): WebSession {
  if (session.status === "authenticated") {
    return Object.freeze({
      status: "authenticated",
      actorId: session.actorId,
      workspaces: Object.freeze(
        session.workspaces.map((workspace) =>
          Object.freeze({
            workspaceId: workspace.workspaceId,
            displayName: workspace.displayName,
            capabilities: Object.freeze([...workspace.capabilities].sort()),
          }),
        ),
      ),
      projects: Object.freeze(
        session.projects.map((project) =>
          Object.freeze({
            projectId: project.projectId,
            workspaceId: project.workspaceId,
            name: project.name,
            defaultEnvironment: project.defaultEnvironment,
            environments: Object.freeze([...project.environments]),
            capabilities: Object.freeze([...project.capabilities].sort()),
          }),
        ),
      ),
      activeScope: Object.freeze({ ...session.activeScope }),
      pageStateRevision: session.pageStateRevision,
      focusTargetId: session.focusTargetId,
    });
  }
  return Object.freeze({ ...session });
}

function defaultAllowedEnvironment(project: SessionProject): Environment {
  if (project.environments.includes(project.defaultEnvironment)) {
    return project.defaultEnvironment;
  }
  const first = project.environments[0];
  if (!first) {
    throw new Error("project has no allowed environments");
  }
  return first;
}

function isEnvironment(value: unknown): value is Environment {
  return value === "development" || value === "test" || value === "production";
}

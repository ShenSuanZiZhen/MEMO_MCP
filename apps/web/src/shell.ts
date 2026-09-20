import type { Environment } from "@modular-mcp/contracts";
import {
  routeById,
  routeMap,
  type WebRoute,
  type WebRouteId,
} from "./routes.js";
import type { AuthenticatedWebSession, WebSession } from "./session.js";

export interface NavigationItem {
  readonly id: WebRouteId;
  readonly label: string;
  readonly href: string;
  readonly requiredCapability?: string;
  readonly sensitive?: boolean;
}

export interface EnvironmentBadge {
  readonly label: "Development" | "Test" | "Production";
  readonly tone: "neutral" | "warning" | "danger";
  readonly iconLabel: string;
}

export interface ShellA11yBaseline {
  readonly skipLink: {
    readonly label: "Skip to main content";
    readonly href: "#main-content";
  };
  readonly landmarks: readonly ["banner", "navigation", "main"];
  readonly mainContentId: "main-content";
  readonly focusAfterRouteChangeId: "main-content";
}

export interface ShellLayoutSlots {
  readonly topBar: readonly string[];
  readonly globalActions: readonly ["search", "tasks", "notifications", "user"];
  readonly sideNav: readonly NavigationItem[];
  readonly pageHeader: readonly ["title", "status", "primaryAction"];
  readonly content: "main-content";
  readonly wizard?: readonly ["steps", "body", "effectiveResult", "footer"];
  readonly a11y: ShellA11yBaseline;
}

export interface ShellView {
  readonly sessionStatus: WebSession["status"];
  readonly activeRoute: WebRouteId;
  readonly environmentBadge?: EnvironmentBadge;
  readonly layout: ShellLayoutSlots;
  readonly primaryActionVisible: boolean;
}

export type ShellViewResult =
  | { readonly ok: true; readonly view: ShellView }
  | {
      readonly ok: false;
      readonly action: "redirect" | "denied";
      readonly reason:
        | "anonymous"
        | "missing_scope"
        | "missing_capability"
        | "unknown_route"
        | "platform_unavailable";
      readonly redirectTo?: WebRouteId;
    };

export const shellA11yBaseline: ShellA11yBaseline = Object.freeze({
  skipLink: Object.freeze({
    label: "Skip to main content",
    href: "#main-content",
  }),
  landmarks: Object.freeze(["banner", "navigation", "main"] as const),
  mainContentId: "main-content",
  focusAfterRouteChangeId: "main-content",
});

const projectNavigation = Object.freeze([
  nav("projectOverview", "Overview"),
  nav("serviceList", "MCP Services"),
  nav("data", "Data"),
  nav("moduleCatalog", "Modules"),
  nav("testCenter", "Test"),
  nav("accessCredentials", "Access and Credentials", {
    sensitive: true,
  }),
  nav("operationsAlerts", "Operations and Alerts"),
  nav("review", "Review and Deploy"),
  nav("membersRoles", "Members and Roles", {
    sensitive: true,
  }),
  nav("projectSettings", "Project Settings"),
] as const);

export function createShellView(
  session: WebSession,
  activeRoute: WebRouteId,
): ShellViewResult {
  const access = resolveRouteAccess(session, activeRoute);
  if (!access.ok) {
    return access;
  }
  const layout = createLayoutSlots(session, activeRoute);
  const view: ShellView = {
    sessionStatus: session.status,
    activeRoute,
    layout,
    primaryActionVisible: primaryActionVisible(session, activeRoute),
  };
  if (
    session.status === "authenticated" &&
    session.activeScope.environment !== undefined
  ) {
    return {
      ok: true,
      view: {
        ...view,
        environmentBadge: environmentBadge(session.activeScope.environment),
      },
    };
  }
  return { ok: true, view };
}

export function visibleNavigation(
  session: WebSession,
): readonly NavigationItem[] {
  if (session.status !== "authenticated") {
    return [];
  }
  return projectNavigation
    .map((item) => {
      const access = resolveRouteAccess(session, item.id);
      if (!access.ok || session.activeScope.projectId === undefined) {
        return undefined;
      }
      const href = hrefForRoute(item.id, session);
      if (!href) {
        return undefined;
      }
      const requiredCapability = routeById(item.id).requiredCapability;
      return requiredCapability
        ? { ...item, href, requiredCapability }
        : { ...item, href };
    })
    .filter((item): item is NavigationItem => item !== undefined);
}

export function environmentBadge(environment: Environment): EnvironmentBadge {
  if (environment === "production") {
    return {
      label: "Production",
      tone: "danger",
      iconLabel: "High risk production environment",
    };
  }
  if (environment === "test") {
    return { label: "Test", tone: "warning", iconLabel: "Test environment" };
  }
  return {
    label: "Development",
    tone: "neutral",
    iconLabel: "Development environment",
  };
}

export function resolveRouteAccess(
  session: WebSession,
  routeId: string,
): ShellViewResult {
  const route = routeMap.find((candidate) => candidate.id === routeId) as
    | WebRoute
    | undefined;
  if (!route) {
    return { ok: false, action: "denied", reason: "unknown_route" };
  }
  if (route.access === "public") {
    return shellAllowed();
  }
  if (session.status !== "authenticated") {
    return {
      ok: false,
      action: "redirect",
      reason: "anonymous",
      redirectTo: "login",
    };
  }
  if (route.platformOnly === true) {
    return { ok: false, action: "denied", reason: "platform_unavailable" };
  }
  if (route.access === "authenticated") {
    return requireCapability(session, route);
  }
  if (!workspaceExists(session, session.activeScope.workspaceId)) {
    return { ok: false, action: "denied", reason: "missing_scope" };
  }
  if (route.access === "workspace") {
    return requireCapability(session, route);
  }
  if (!activeProject(session)) {
    return { ok: false, action: "denied", reason: "missing_scope" };
  }
  if (route.access === "project") {
    return requireCapability(session, route);
  }
  if (!activeProjectEnvironment(session)) {
    return { ok: false, action: "denied", reason: "missing_scope" };
  }
  return requireCapability(session, route);
}

export function validateShellA11yBaseline(
  baseline: ShellA11yBaseline = shellA11yBaseline,
): readonly string[] {
  const violations: string[] = [];
  if (baseline.skipLink.href !== `#${baseline.mainContentId}`) {
    violations.push("skip link must target main content");
  }
  for (const landmark of ["banner", "navigation", "main"] as const) {
    if (!baseline.landmarks.includes(landmark)) {
      violations.push(`missing ${landmark} landmark`);
    }
  }
  if (baseline.focusAfterRouteChangeId !== baseline.mainContentId) {
    violations.push("route changes must restore focus to main content");
  }
  return violations;
}

function createLayoutSlots(
  session: WebSession,
  activeRoute: WebRouteId,
): ShellLayoutSlots {
  const route = routeMap.find((candidate) => candidate.id === activeRoute);
  const topBar = topBarSlots(route?.layoutSlot ?? "project");
  const base = {
    topBar,
    globalActions: ["search", "tasks", "notifications", "user"],
    sideNav:
      route?.layoutSlot === "project" || route?.layoutSlot === "wizard"
        ? visibleNavigation(session)
        : [],
    pageHeader: ["title", "status", "primaryAction"],
    content: "main-content",
    a11y: shellA11yBaseline,
  } as const;
  if (route?.layoutSlot === "wizard") {
    return {
      ...base,
      wizard: ["steps", "body", "effectiveResult", "footer"],
    };
  }
  return base;
}

function capabilitiesForActiveWorkspace(
  session: AuthenticatedWebSession,
): ReadonlySet<string> {
  const activeWorkspace = session.workspaces.find(
    (workspace) => workspace.workspaceId === session.activeScope.workspaceId,
  );
  return new Set(activeWorkspace?.capabilities ?? []);
}

function effectiveCapabilitiesForActiveProject(
  session: AuthenticatedWebSession,
): ReadonlySet<string> {
  const workspaceCapabilities = capabilitiesForActiveWorkspace(session);
  const project = activeProject(session);
  if (!project) {
    return workspaceCapabilities;
  }
  return new Set(
    project.capabilities.filter((capability) =>
      workspaceCapabilities.has(capability),
    ),
  );
}

function requireCapability(
  session: AuthenticatedWebSession,
  route: WebRoute,
): ShellViewResult {
  if (!route.requiredCapability) {
    return shellAllowed();
  }
  const capabilities =
    route.access === "workspace" || route.access === "authenticated"
      ? capabilitiesForActiveWorkspace(session)
      : effectiveCapabilitiesForActiveProject(session);
  return capabilities.has(route.requiredCapability)
    ? shellAllowed()
    : { ok: false, action: "denied", reason: "missing_capability" };
}

function shellAllowed(): ShellViewResult {
  return {
    ok: true,
    view: {
      sessionStatus: "anonymous",
      activeRoute: "login",
      layout: {
        topBar: [],
        globalActions: ["search", "tasks", "notifications", "user"],
        sideNav: [],
        pageHeader: ["title", "status", "primaryAction"],
        content: "main-content",
        a11y: shellA11yBaseline,
      },
      primaryActionVisible: false,
    },
  };
}

function workspaceExists(
  session: AuthenticatedWebSession,
  workspaceId: string,
): boolean {
  return session.workspaces.some(
    (workspace) => workspace.workspaceId === workspaceId,
  );
}

function activeProject(session: AuthenticatedWebSession) {
  return session.projects.find(
    (project) =>
      project.workspaceId === session.activeScope.workspaceId &&
      project.projectId === session.activeScope.projectId,
  );
}

function activeProjectEnvironment(session: AuthenticatedWebSession): boolean {
  const project = activeProject(session);
  return (
    project !== undefined &&
    session.activeScope.environment !== undefined &&
    project.environments.includes(session.activeScope.environment)
  );
}

function primaryActionVisible(
  session: WebSession,
  activeRoute: WebRouteId,
): boolean {
  return resolveRouteAccess(session, activeRoute).ok;
}

function topBarSlots(layoutSlot: WebRoute["layoutSlot"]): readonly string[] {
  if (layoutSlot === "auth") {
    return ["logo"];
  }
  if (layoutSlot === "workspace") {
    return ["logo", "workspace"];
  }
  return ["logo", "workspace", "project", "environment"];
}

function hrefForRoute(
  id: WebRouteId,
  session: AuthenticatedWebSession,
): string | undefined {
  const route = routeById(id);
  let path = route.path.replace(
    ":workspaceId",
    segment(session.activeScope.workspaceId),
  );
  if (path.includes(":projectId")) {
    if (!session.activeScope.projectId) {
      return undefined;
    }
    path = path.replace(":projectId", segment(session.activeScope.projectId));
  }
  if (path.includes(":environment")) {
    if (!session.activeScope.environment) {
      return undefined;
    }
    path = path.replace(
      ":environment",
      segment(session.activeScope.environment),
    );
  }
  return path.includes(":") ? undefined : path;
}

function segment(value: string): string {
  return encodeURIComponent(value);
}

function nav(
  id: WebRouteId,
  label: string,
  options: {
    readonly requiredCapability?: string;
    readonly sensitive?: boolean;
  } = {},
): NavigationItem {
  const route = routeMap.find((candidate) => candidate.id === id);
  if (!route) {
    throw new Error(`navigation route does not exist: ${id}`);
  }
  const item: NavigationItem = {
    id,
    label,
    href: route.path,
  };
  if (options.requiredCapability !== undefined) {
    return Object.freeze({
      ...item,
      requiredCapability: options.requiredCapability,
      sensitive: options.sensitive ?? false,
    });
  }
  return Object.freeze(item);
}

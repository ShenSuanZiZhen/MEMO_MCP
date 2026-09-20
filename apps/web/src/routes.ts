export type RouteAccess =
  | "public"
  | "authenticated"
  | "workspace"
  | "project"
  | "environment";

export interface WebRoute {
  readonly id: string;
  readonly ui: string;
  readonly path: string;
  readonly title: string;
  readonly access: RouteAccess;
  readonly layoutSlot: "auth" | "workspace" | "project" | "wizard" | "overlay";
  readonly requiredCapability?: string;
  readonly platformOnly?: boolean;
}

const routeDefinitions = [
  {
    id: "login",
    ui: "UI-01",
    path: "/login",
    title: "Login",
    access: "public",
    layoutSlot: "auth",
  },
  {
    id: "workspaceSelect",
    ui: "UI-02",
    path: "/workspaces",
    title: "Workspaces",
    access: "authenticated",
    layoutSlot: "workspace",
  },
  {
    id: "projectSelect",
    ui: "UI-03",
    path: "/workspaces/:workspaceId/projects",
    title: "Projects",
    access: "workspace",
    layoutSlot: "workspace",
  },
  {
    id: "projectOverview",
    ui: "UI-04",
    path: "/workspaces/:workspaceId/projects/:projectId/:environment/overview",
    title: "Overview",
    access: "environment",
    layoutSlot: "project",
  },
  {
    id: "serviceList",
    ui: "UI-05",
    path: "/workspaces/:workspaceId/projects/:projectId/:environment/services",
    title: "MCP Services",
    access: "environment",
    layoutSlot: "project",
  },
  {
    id: "serviceWizard",
    ui: "UI-06..UI-23",
    path: "/workspaces/:workspaceId/projects/:projectId/:environment/services/new/:step",
    title: "Create Service",
    access: "environment",
    layoutSlot: "wizard",
  },
  {
    id: "data",
    ui: "UI-08..UI-14,UI-31",
    path: "/workspaces/:workspaceId/projects/:projectId/:environment/data",
    title: "Data",
    access: "environment",
    layoutSlot: "project",
  },
  {
    id: "moduleCatalog",
    ui: "UI-15,UI-38",
    path: "/workspaces/:workspaceId/projects/:projectId/:environment/modules",
    title: "Modules",
    access: "environment",
    layoutSlot: "project",
  },
  {
    id: "testCenter",
    ui: "UI-22",
    path: "/workspaces/:workspaceId/projects/:projectId/:environment/tests",
    title: "Test",
    access: "environment",
    layoutSlot: "project",
  },
  {
    id: "accessCredentials",
    ui: "UI-27,UI-28,UI-32",
    path: "/workspaces/:workspaceId/projects/:projectId/:environment/access",
    title: "Access and Credentials",
    access: "environment",
    layoutSlot: "project",
    requiredCapability: "workspace.manage",
  },
  {
    id: "operationsAlerts",
    ui: "UI-29,UI-33,UI-36,UI-37",
    path: "/workspaces/:workspaceId/projects/:projectId/:environment/operations",
    title: "Operations and Alerts",
    access: "environment",
    layoutSlot: "project",
  },
  {
    id: "review",
    ui: "UI-24,UI-25,UI-26",
    path: "/workspaces/:workspaceId/projects/:projectId/:environment/review",
    title: "Review and Deploy",
    access: "environment",
    layoutSlot: "project",
    requiredCapability: "candidate.review",
  },
  {
    id: "membersRoles",
    ui: "UI-39",
    path: "/workspaces/:workspaceId/projects/:projectId/members",
    title: "Members and Roles",
    access: "project",
    layoutSlot: "project",
    requiredCapability: "project.member.manage",
  },
  {
    id: "projectSettings",
    ui: "UI-03",
    path: "/workspaces/:workspaceId/projects/:projectId/settings",
    title: "Project Settings",
    access: "project",
    layoutSlot: "project",
    requiredCapability: "workspace.manage",
  },
  {
    id: "platformOps",
    ui: "UI-40",
    path: "/platform",
    title: "Platform Operations",
    access: "authenticated",
    layoutSlot: "workspace",
    requiredCapability: "workspace.manage",
    platformOnly: true,
  },
] as const satisfies readonly WebRoute[];

export const routeMap = freezeRouteMap(routeDefinitions);

export type WebRouteId = (typeof routeMap)[number]["id"];

export function routeById(id: WebRouteId): WebRoute {
  const route = routeMap.find((candidate) => candidate.id === id);
  if (!route) {
    throw new Error(`unknown route: ${id}`);
  }
  return route;
}

function freezeRouteMap<const Routes extends readonly WebRoute[]>(
  routes: Routes,
): Routes {
  for (const route of routes) {
    Object.freeze(route);
  }
  return Object.freeze(routes) as Routes;
}

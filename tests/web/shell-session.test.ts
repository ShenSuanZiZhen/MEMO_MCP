import { describe, expect, it } from "vitest";
import {
  createQueryKey,
  createSessionController,
  createShellView,
  createTenantQueryCache,
  focusMainContent,
  renderShell,
  routeById,
  routeMap,
  resolveRouteAccess,
  shellA11yBaseline,
  tenantScopeKey,
  visibleNavigation,
  type AuthenticatedWebSession,
  type QueryKey,
} from "../../apps/web/src/index.js";
import * as webPublic from "../../apps/web/src/index.js";
import { createShellDom, runAxeOnShell } from "./shell-dom-helper.js";

const allCapabilities = [
  "candidate.review",
  "deployment.pause",
  "deployment.publish",
  "draft.edit",
  "project.archive",
  "project.create",
  "project.member.manage",
  "project.read",
  "project.restore",
  "service.read",
  "workspace.manage",
  "workspace.member.manage",
  "workspace.read",
] as const;

const observerCapabilities = [
  "project.read",
  "service.read",
  "workspace.read",
] as const;

function sessionFixture(
  overrides: Partial<AuthenticatedWebSession> = {},
): AuthenticatedWebSession {
  return {
    status: "authenticated",
    actorId: "usr_018f0000-0000-7000-8000-000000000101",
    workspaces: [
      {
        workspaceId: "ws_alpha",
        displayName: "Alpha",
        capabilities: [...allCapabilities],
      },
      {
        workspaceId: "ws_beta",
        displayName: "Beta",
        capabilities: [...observerCapabilities],
      },
    ],
    projects: [
      {
        workspaceId: "ws_alpha",
        projectId: "prj_alpha",
        name: "Alpha project",
        defaultEnvironment: "development",
        environments: ["development", "test", "production"],
        capabilities: [...allCapabilities],
      },
      {
        workspaceId: "ws_alpha",
        projectId: "prj_alpha_observer",
        name: "Alpha observer project",
        defaultEnvironment: "development",
        environments: ["development", "production"],
        capabilities: [...observerCapabilities],
      },
      {
        workspaceId: "ws_beta",
        projectId: "prj_beta",
        name: "Beta project",
        defaultEnvironment: "production",
        environments: ["production"],
        capabilities: [...observerCapabilities],
      },
    ],
    activeScope: {
      workspaceId: "ws_alpha",
      projectId: "prj_alpha",
      environment: "development",
    },
    pageStateRevision: 0,
    focusTargetId: "main-content",
    ...overrides,
  };
}

function seedCache() {
  const cache = createTenantQueryCache();
  const keys = {
    alphaWorkspace: createQueryKey({ workspaceId: "ws_alpha" }, "workspace"),
    alphaProjectDev: createQueryKey(
      {
        workspaceId: "ws_alpha",
        projectId: "prj_alpha",
        environment: "development",
      },
      "listDrafts",
    ),
    alphaProjectProd: createQueryKey(
      {
        workspaceId: "ws_alpha",
        projectId: "prj_alpha",
        environment: "production",
      },
      "listDrafts",
    ),
    alphaOtherProject: createQueryKey(
      {
        workspaceId: "ws_alpha",
        projectId: "prj_alpha_observer",
        environment: "development",
      },
      "listDrafts",
    ),
    betaProject: createQueryKey(
      {
        workspaceId: "ws_beta",
        projectId: "prj_beta",
        environment: "production",
      },
      "listDrafts",
    ),
  } satisfies Record<string, QueryKey>;
  for (const [name, key] of Object.entries(keys)) {
    cache.set(key, { name });
  }
  return { cache, keys };
}

describe("web shell routes and session", () => {
  it("keeps test-only DOM and axe helpers out of the production public entry", () => {
    expect("createShellDom" in webPublic).toBe(false);
    expect("runAxeOnShell" in webPublic).toBe(false);
  });

  it("uses scope-bearing cache keys for workspace project and environment", () => {
    const session = sessionFixture();
    expect(tenantScopeKey(session.activeScope)).toBe(
      "tenant:ws_alpha:prj_alpha:development",
    );
    expect(createQueryKey(session.activeScope, "getProject")).toEqual([
      "tenant:ws_alpha:prj_alpha:development",
      "getProject",
    ]);
  });

  it("clears all old workspace caches on workspace switch and preserves target workspace", () => {
    const { cache, keys } = seedCache();
    const controller = createSessionController(sessionFixture(), cache);
    const next = controller.switchWorkspace("ws_beta");

    expect(next).toMatchObject({
      status: "authenticated",
      activeScope: {
        workspaceId: "ws_beta",
        projectId: "prj_beta",
        environment: "production",
      },
      pageStateRevision: 1,
      focusTargetId: "main-content",
    });
    expect(cache.get(keys.alphaWorkspace)).toBeUndefined();
    expect(cache.get(keys.alphaProjectDev)).toBeUndefined();
    expect(cache.get(keys.alphaProjectProd)).toBeUndefined();
    expect(cache.get(keys.alphaOtherProject)).toBeUndefined();
    expect(cache.get(keys.betaProject)).toEqual({ name: "betaProject" });

    controller.switchWorkspace("ws_alpha");
    expect(cache.get(keys.betaProject)).toBeUndefined();
  });

  it("clears old project environments on project switch and old environment on environment switch", () => {
    const { cache, keys } = seedCache();
    const controller = createSessionController(sessionFixture(), cache);

    controller.switchProject("prj_alpha_observer");
    expect(cache.get(keys.alphaProjectDev)).toBeUndefined();
    expect(cache.get(keys.alphaProjectProd)).toBeUndefined();
    expect(cache.get(keys.alphaOtherProject)).toEqual({
      name: "alphaOtherProject",
    });

    const prodKey = createQueryKey(
      {
        workspaceId: "ws_alpha",
        projectId: "prj_alpha_observer",
        environment: "production",
      },
      "listDrafts",
    );
    cache.set(prodKey, { name: "observerProd" });
    controller.switchEnvironment("production");
    expect(cache.get(keys.alphaOtherProject)).toBeUndefined();
    expect(cache.get(prodKey)).toEqual({ name: "observerProd" });
  });

  it("clears every tenant cache on sign out", () => {
    const { cache } = seedCache();
    const controller = createSessionController(sessionFixture(), cache);

    controller.signOut();

    expect(cache.size).toBe(0);
    expect(controller.getSession()).toMatchObject({ status: "anonymous" });
  });

  it("fails closed for unknown workspace project and environment without mutating state or cache", () => {
    const { cache, keys } = seedCache();
    const controller = createSessionController(sessionFixture(), cache);
    const before = controller.getSession();
    const beforeKeys = cache.keys();

    expect(() => controller.switchWorkspace("ws_unknown")).toThrow(
      "workspace is not available",
    );
    expect(controller.getSession()).toBe(before);
    expect(cache.keys()).toEqual(beforeKeys);

    expect(() => controller.switchProject("prj_beta")).toThrow(
      "project is not available",
    );
    expect(controller.getSession()).toBe(before);
    expect(cache.keys()).toEqual(beforeKeys);

    expect(() =>
      controller.switchEnvironment("staging" as "development"),
    ).toThrow("environment switch requires");
    expect(controller.getSession()).toBe(before);
    expect(cache.get(keys.alphaProjectDev)).toEqual({
      name: "alphaProjectDev",
    });
  });

  it("deep freezes a defensive session snapshot", () => {
    const mutable = sessionFixture();
    const workspaceCapabilities = mutable.workspaces[0]!
      .capabilities as string[];
    const projectCapabilities = mutable.projects[1]!.capabilities as string[];
    const controller = createSessionController(
      mutable,
      createTenantQueryCache(),
    );

    workspaceCapabilities.push("workspace.manage");
    projectCapabilities.push("workspace.manage", "project.member.manage");
    (mutable.projects as AuthenticatedWebSession["projects"] & unknown[]).push({
      workspaceId: "ws_alpha",
      projectId: "prj_injected",
      name: "Injected",
      defaultEnvironment: "development",
      environments: ["development"],
      capabilities: allCapabilities,
    });

    controller.switchProject("prj_alpha_observer");
    const navIds = visibleNavigation(controller.getSession()).map(
      (item) => item.id,
    );
    expect(navIds).not.toContain("accessCredentials");
    expect(navIds).not.toContain("membersRoles");
    expect(() => controller.switchProject("prj_injected")).toThrow();
  });

  it("gates sensitive routes for anonymous missing capability and platform states", () => {
    const anonymous = {
      status: "anonymous",
      pageStateRevision: 0,
      focusTargetId: "main-content",
    } as const;
    expect(createShellView(anonymous, "accessCredentials")).toMatchObject({
      ok: false,
      action: "redirect",
      reason: "anonymous",
    });

    const controller = createSessionController(
      sessionFixture(),
      createTenantQueryCache(),
    );
    controller.switchProject("prj_alpha_observer");
    expect(
      createShellView(controller.getSession(), "accessCredentials"),
    ).toMatchObject({
      ok: false,
      reason: "missing_capability",
    });
    expect(
      createShellView(controller.getSession(), "membersRoles"),
    ).toMatchObject({
      ok: false,
      reason: "missing_capability",
    });
    expect(resolveRouteAccess(controller.getSession(), "missing")).toEqual({
      ok: false,
      action: "denied",
      reason: "unknown_route",
    });
    expect(createShellView(sessionFixture(), "platformOps")).toMatchObject({
      ok: false,
      reason: "platform_unavailable",
    });
  });

  it("freezes route access policy and keeps gate decisions intact after mutation attempts", () => {
    expect(Object.isFrozen(routeMap)).toBe(true);
    for (const route of routeMap) {
      expect(Object.isFrozen(route)).toBe(true);
    }
    expect(Object.isFrozen(shellA11yBaseline)).toBe(true);
    expect(Object.isFrozen(shellA11yBaseline.skipLink)).toBe(true);
    expect(Object.isFrozen(shellA11yBaseline.landmarks)).toBe(true);

    const accessCredentials = routeById("accessCredentials");
    const platformOps = routeById("platformOps");
    expect(Object.isFrozen(accessCredentials)).toBe(true);
    expect(Object.isFrozen(platformOps)).toBe(true);

    expect(() => {
      delete (
        accessCredentials as unknown as {
          requiredCapability?: string;
        }
      ).requiredCapability;
    }).toThrow(TypeError);
    expect(() => {
      (
        platformOps as unknown as {
          platformOnly?: boolean;
        }
      ).platformOnly = false;
    }).toThrow(TypeError);
    expect(() => {
      (
        routeById("accessCredentials") as unknown as {
          requiredCapability?: string;
        }
      ).requiredCapability = "workspace.read";
    }).toThrow(TypeError);

    const controller = createSessionController(
      sessionFixture(),
      createTenantQueryCache(),
    );
    controller.switchProject("prj_alpha_observer");

    expect(
      createShellView(controller.getSession(), "accessCredentials"),
    ).toMatchObject({
      ok: false,
      reason: "missing_capability",
    });
    expect(createShellView(sessionFixture(), "platformOps")).toMatchObject({
      ok: false,
      reason: "platform_unavailable",
    });
    expect(
      visibleNavigation(controller.getSession()).map((item) => item.id),
    ).not.toContain("accessCredentials");
  });

  it("uses actual encoded navigation hrefs without template placeholders", () => {
    const special = sessionFixture({
      workspaces: [
        {
          workspaceId: "ws alpha/1",
          displayName: "Special",
          capabilities: allCapabilities,
        },
      ],
      projects: [
        {
          workspaceId: "ws alpha/1",
          projectId: "prj alpha/1",
          name: "Special project",
          defaultEnvironment: "production",
          environments: ["production"],
          capabilities: allCapabilities,
        },
      ],
      activeScope: {
        workspaceId: "ws alpha/1",
        projectId: "prj alpha/1",
        environment: "production",
      },
    });
    const navigation = visibleNavigation(special);

    expect(navigation).not.toHaveLength(0);
    for (const item of navigation) {
      expect(item.href).not.toContain(":workspaceId");
      expect(item.href).not.toContain(":projectId");
      expect(item.href).not.toContain(":environment");
      expect(item.href).toContain("ws%20alpha%2F1");
      expect(item.href).toContain("prj%20alpha%2F1");
    }
  });

  it("does not render project shell on auth layout and marks production semantically", () => {
    const login = createShellView(
      {
        status: "anonymous",
        pageStateRevision: 0,
        focusTargetId: "main-content",
      },
      "login",
    );
    expect(login).toMatchObject({
      ok: true,
      view: { layout: { topBar: ["logo"], sideNav: [] } },
    });

    const project = createShellView(sessionFixture(), "projectOverview");
    expect(project).toMatchObject({
      ok: true,
      view: { layout: { content: "main-content" } },
    });
    if (!project.ok) {
      throw new Error("expected project shell");
    }
    const production = createShellView(
      sessionFixture({
        activeScope: {
          workspaceId: "ws_alpha",
          projectId: "prj_alpha",
          environment: "production",
        },
      }),
      "projectOverview",
    );
    if (!production.ok) {
      throw new Error("expected production shell");
    }
    expect(production.view.environmentBadge).toEqual({
      label: "Production",
      tone: "danger",
      iconLabel: "High risk production environment",
    });
    expect(renderShell(production.view).html).toContain(
      'aria-label="High risk production environment"',
    );
  });

  it("passes real axe checks and shell focus behavior", async () => {
    const result = createShellView(sessionFixture(), "projectOverview");
    if (!result.ok) {
      throw new Error("expected accessible shell");
    }

    await expect(runAxeOnShell(result.view)).resolves.toEqual({
      violations: [],
    });

    const dom = createShellDom(result.view);
    const document = dom.window.document;
    const focusable = [
      ...document.querySelectorAll<HTMLElement>(
        'a[href], button, select, [tabindex]:not([tabindex="-1"])',
      ),
    ];
    expect(focusable[0]?.textContent).toContain("Skip to main content");
    focusable[0]?.focus();
    expect(document.activeElement).toBe(focusable[0]);
    focusable[0]?.click();
    expect(document.activeElement?.id).toBe("main-content");

    document.body.focus();
    focusMainContent(document);
    expect(document.activeElement?.id).toBe("main-content");
    expect(document.querySelector("nav")?.getAttribute("aria-label")).toBe(
      "Project navigation",
    );
    expect(document.querySelector("main h1")).not.toBeNull();
  });
});

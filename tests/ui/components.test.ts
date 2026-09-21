import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { arch, platform } from "node:process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  attachUiBehaviors,
  renderEffectiveResultPanel,
  renderFormField,
  renderIssuePanel,
  renderPageState,
  renderStatusTag,
  renderTaskProgress,
  renderUiShowcase,
  uiSemanticTokens,
  type Issue,
  type PageStateKind,
  type StatusKind,
} from "../../packages/ui/src/index.js";
import * as publicUi from "../../packages/ui/src/index.js";
import {
  EffectiveResultMatrix,
  FormFieldMatrix,
  IssuePanelMatrix,
  PageStateMatrix,
  Showcase,
  StatusTagAllStates,
  TaskProgressMatrix,
} from "../../packages/ui/src/wp14b.stories.js";

interface TestWindow {
  readonly document: Document;
  eval(source: string): void;
}

interface TestDom {
  readonly window: TestWindow;
}

interface AxeModule {
  readonly source: string;
}

interface JsdomModule {
  readonly JSDOM: new (
    html: string,
    options: {
      readonly pretendToBeVisual: boolean;
      readonly runScripts: "outside-only";
      readonly url: string;
    },
  ) => TestDom;
}

interface PngModule {
  readonly PNG: {
    sync: {
      read(buffer: Buffer): {
        readonly width: number;
        readonly height: number;
        readonly data: Uint8Array;
      };
    };
  };
}

interface PlaywrightModule {
  readonly chromium: {
    launch(): Promise<Browser>;
  };
}

interface Browser {
  newPage(options: {
    readonly viewport: { readonly width: number; readonly height: number };
    readonly deviceScaleFactor?: number;
  }): Promise<Page>;
  close(): Promise<void>;
  version(): string;
}

interface Page {
  emulateMedia(options: { readonly reducedMotion: "reduce" }): Promise<void>;
  setContent(
    html: string,
    options: { readonly waitUntil: "load" },
  ): Promise<void>;
  addStyleTag(options: { readonly content: string }): Promise<void>;
  addScriptTag(options: {
    readonly content: string;
    readonly type?: "module";
  }): Promise<void>;
  screenshot(options: {
    readonly fullPage: true;
    readonly type: "png";
  }): Promise<Buffer>;
  click(selector: string): Promise<void>;
  evaluate<T>(fn: () => T | Promise<T>): Promise<T>;
  readonly keyboard: {
    press(key: "Enter" | "Space"): Promise<void>;
  };
  locator(selector: string): {
    focus(): Promise<void>;
    press(key: "Enter" | "Space"): Promise<void>;
  };
}

const testRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(dirname(testRoot));
const uiRoot = join(repoRoot, "packages", "ui");
const uiDistEntry = join(uiRoot, "dist", "index.js");
const uiCss = readFileSync(join(uiRoot, "src", "styles.css"), "utf8");
const requireFromUiPackage = createRequire(
  new URL("../../packages/ui/package.json", import.meta.url),
);
const axeCore = requireFromUiPackage("axe-core") as AxeModule;
const { JSDOM } = requireFromUiPackage("jsdom") as JsdomModule;
const { PNG } = requireFromUiPackage("pngjs") as PngModule;
const { chromium } = requireFromUiPackage(
  "@playwright/test",
) as PlaywrightModule;
const storybookPackageRoot = dirname(
  requireFromUiPackage.resolve("storybook/package.json"),
);
const visualFont = readFileSync(
  join(storybookPackageRoot, "assets/browser/nunito-sans-regular.woff2"),
);
const visualFontSha256 = createHash("sha256").update(visualFont).digest("hex");
const visualFontCss = `@font-face{font-family:"WP14BVisual";src:url(data:font/woff2;base64,${visualFont.toString(
  "base64",
)}) format("woff2");font-weight:400;font-style:normal;font-display:block}`;
const fontSha256 =
  "49fe05ec477bb0f2f815a7494c933070606b5c68e84f96e11374e07c59a64d61";
const visualViewports = Object.freeze({
  browserAxe: Object.freeze({ width: 1280, height: 1000 }),
  showcase1280: Object.freeze({ width: 1280, height: 1200 }),
  showcase1024: Object.freeze({ width: 1024, height: 1200 }),
});
const visualEnvironments = Object.freeze({
  "darwin-arm64": Object.freeze({
    arch: "arm64",
    baselineDir: join(testRoot, "visual-baselines", "darwin-arm64"),
    browserVersion: "153.0.8010.12",
    deviceScaleFactor: 1,
    fontSha256,
    platform: "darwin",
    viewports: visualViewports,
  }),
  "linux-x64": Object.freeze({
    arch: "x64",
    baselineDir: join(testRoot, "visual-baselines", "linux-x64"),
    browserVersion: "153.0.8010.12",
    deviceScaleFactor: 1,
    fontSha256,
    platform: "linux",
    viewports: visualViewports,
  }),
});
const visualEnvironmentKey = `${platform}-${arch}`;
const visualEnvironment =
  visualEnvironments[visualEnvironmentKey as keyof typeof visualEnvironments];
let uiBuildReady = false;

function documentFor(html: string): Document {
  return new JSDOM(wrapHtml(html), {
    pretendToBeVisual: true,
    runScripts: "outside-only",
    url: "https://ui.modular-mcp.local",
  }).window.document;
}

function wrapHtml(body: string): string {
  if (body.trimStart().startsWith("<!doctype html>")) {
    return body.replace("<head>", `<head><style>${uiCss}</style>`);
  }
  return `<!doctype html><html lang="zh-CN"><head><title>WP-14B Test</title><style>${uiCss}</style></head><body><main>${body}</main></body></html>`;
}

async function jsdomAxeViolations(html: string): Promise<readonly string[]> {
  const dom = new JSDOM(wrapHtml(html), {
    pretendToBeVisual: true,
    runScripts: "outside-only",
    url: "https://ui.modular-mcp.local",
  });
  dom.window.eval(axeCore.source);
  const axe = (
    dom.window as unknown as {
      axe: {
        run(
          node: Document,
          options: {
            readonly rules: Record<string, { readonly enabled: boolean }>;
          },
        ): Promise<{
          readonly violations: readonly { readonly id: string }[];
        }>;
      };
    }
  ).axe;
  const result = await axe.run(dom.window.document, {
    rules: {
      // jsdom has no canvas implementation for axe color-contrast checks.
      "color-contrast": { enabled: false },
    },
  });
  return result.violations.map((violation) => violation.id);
}

async function launchManagedChromium(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch (error) {
    throw new Error(
      `Playwright-managed Chromium is required for WP-14B visual tests. Run "pnpm --filter @modular-mcp/ui exec playwright install --with-deps chromium" before executing tests. Original error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function currentVisualEnvironment(): NonNullable<typeof visualEnvironment> {
  if (visualEnvironment === undefined) {
    throw new Error(
      `Unsupported WP-14B visual baseline environment: ${visualEnvironmentKey}. Expected one of ${Object.keys(
        visualEnvironments,
      ).join(", ")}.`,
    );
  }
  return visualEnvironment;
}

function ensureUiBuild(): void {
  if (uiBuildReady && existsSync(uiDistEntry)) {
    return;
  }
  execFileSync("pnpm", ["--filter", "@modular-mcp/ui", "build"], {
    cwd: repoRoot,
    stdio: "pipe",
  });
  uiBuildReady = true;
}

function productionUiModuleDataUrl(): string {
  ensureUiBuild();
  const source = readFileSync(uiDistEntry, "utf8");
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

const statusKinds: readonly StatusKind[] = [
  "draft",
  "processing",
  "actionRequired",
  "success",
  "running",
  "paused",
  "failed",
  "blocked",
  "archived",
];

const pageStateKinds: readonly PageStateKind[] = [
  "empty",
  "filteredEmpty",
  "loading",
  "shortTask",
  "longTask",
  "success",
  "partial",
  "retryable",
  "nonretryable",
  "permission",
  "dataChanged",
  "degraded",
];

describe("WP-14B UI components", () => {
  it("enforces PageStateProps discriminated union compile-time constraints", () => {
    execFileSync(
      "pnpm",
      [
        "exec",
        "tsc",
        "--noEmit",
        "--project",
        "tests/ui/tsconfig.page-state-props.json",
      ],
      { cwd: repoRoot, stdio: "pipe" },
    );
  });

  it("limits public exports to production components tokens css and interactions", () => {
    expect(Object.keys(publicUi).sort()).toEqual([
      "attachUiBehaviors",
      "packageLayer",
      "renderEffectiveResultPanel",
      "renderFormField",
      "renderIssuePanel",
      "renderPageState",
      "renderStatusTag",
      "renderTaskProgress",
      "renderUiShowcase",
      "uiSemanticTokens",
      "uiStoryMatrix",
      "uiStylesHref",
    ]);
  });

  it("renders semantic status tags without live regions by default", () => {
    for (const kind of statusKinds) {
      const document = documentFor(renderStatusTag({ kind }).html);
      const tag = document.querySelector<HTMLElement>(".ui-status-tag");
      expect(tag?.textContent?.trim()).not.toBe("");
      expect(tag?.getAttribute("role")).toBeNull();
      expect(tag?.querySelector("[aria-hidden='true']")).not.toBeNull();
    }
    expect(
      documentFor(renderStatusTag({ kind: "processing", announce: true }).html)
        .querySelector(".ui-status-tag")
        ?.getAttribute("role"),
    ).toBe("status");
  });

  it("connects form labels help and errors with escaped aria-describedby", () => {
    const document = documentFor(
      renderFormField({
        id: 'service"name',
        label: "服务名称",
        required: true,
        helpText: "用于发布后的服务列表。",
        error: "必须使用 3-64 个字母、数字或连字符。",
        errorExample: "docs-search",
      }).html,
    );
    const input = document.querySelector<HTMLInputElement>('#service\\"name');
    const label = document.querySelector("label");
    const error = document.querySelector("[role='alert']");

    expect(label?.getAttribute("for")).toBe('service"name');
    expect(input?.getAttribute("aria-describedby")).toBe(
      'service"name-help service"name-error',
    );
    expect(input?.getAttribute("aria-invalid")).toBe("true");
    expect(error?.textContent).toContain("docs-search");
  });

  it("implements secret toggle for mouse Enter Space and repeated binding", () => {
    const secret = "local-only-secret";
    const document = documentFor(
      renderFormField({
        id: "api-secret",
        label: "API Secret",
        kind: "secret",
        value: "saved-secret-never-render",
        helpText: "保存后不会回显。",
      }).html,
    );
    attachUiBehaviors(document);
    attachUiBehaviors(document);
    const input = document.querySelector<HTMLInputElement>("#api-secret")!;
    const button = document.querySelector<HTMLButtonElement>("button")!;
    input.value = secret;

    expect(document.body.innerHTML).not.toContain("saved-secret-never-render");
    expect(button.textContent).toBe("显示 Secret");
    button.click();
    expect(input.type).toBe("text");
    expect(input.value).toBe(secret);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.textContent).toBe("隐藏 Secret");
    expect(document.activeElement).toBe(button);
    button.dispatchEvent(
      new document.defaultView!.KeyboardEvent("keydown", { key: "Enter" }),
    );
    expect(input.type).toBe("password");
    button.dispatchEvent(
      new document.defaultView!.KeyboardEvent("keydown", { key: " " }),
    );
    expect(input.type).toBe("text");
    expect(document.body.innerHTML).not.toContain(secret);
  });

  it("renders effective result changed markers as visible readable text", () => {
    const document = documentFor(
      renderEffectiveResultPanel({
        idPrefix: "effective-a",
        groups: {
          data: [
            {
              id: "data-source",
              label: "文档数据",
              summary: "2 个来源",
              sourceId: "source-config",
              changed: true,
            },
          ],
        },
      }).html,
    );
    expect(document.querySelector(".ui-change-marker")?.textContent).toBe(
      "已变化",
    );
  });

  it("renders issue severities correctly and links to real targets", () => {
    const issues: readonly Issue[] = [
      issue("missing-metadata", "步骤 3 · 模块", "blocking", "module-config"),
      issue("large-file", "步骤 2 · 数据", "warning", "file-config"),
      issue("hint", "步骤 2 · 数据", "info", "file-config"),
    ];
    const html = `<div id="module-config"></div><div id="file-config"></div>${
      renderIssuePanel({
        idPrefix: "issue-a",
        issues,
        targetIds: ["module-config", "file-config"],
      }).html
    }`;
    const document = documentFor(html);

    expect(document.querySelector("[data-severity='blocking']")).not.toBeNull();
    expect(document.querySelector("[data-severity='warning']")).not.toBeNull();
    expect(document.querySelector("[data-severity='info']")).not.toBeNull();
    expect(document.body.textContent).toContain("提示");
    expect(document.body.textContent).not.toMatch(/忽略所有|ignore all/i);
    for (const link of document.querySelectorAll<HTMLAnchorElement>(
      "a.ui-button",
    )) {
      expect(document.querySelector(link.hash)).not.toBeNull();
      expect(link.getAttribute("data-target-valid")).toBe("true");
    }
  });

  it("fails closed for undeclared unknown duplicate empty and malicious issue targets", () => {
    const cases = [
      {
        name: "known",
        targetIds: ["module-config"],
        targetId: "module-config",
        valid: true,
      },
      {
        name: "unknown",
        targetIds: ["module-config"],
        targetId: "missing-target",
        valid: false,
      },
      {
        name: "omitted-targetIds",
        targetIds: undefined,
        targetId: "module-config",
        valid: false,
      },
      { name: "empty", targetIds: [""], targetId: "", valid: false },
      {
        name: "duplicate",
        targetIds: ["module-config", "module-config"],
        targetId: "module-config",
        valid: false,
      },
      {
        name: "malicious",
        targetIds: [`x" onclick="alert(1)`],
        targetId: `x" onclick="alert(1)`,
        valid: false,
      },
    ] as const;

    for (const scenario of cases) {
      const document = documentFor(
        renderIssuePanel({
          idPrefix: `issue-${scenario.name}`,
          issues: [
            issue(
              `issue-${scenario.name}`,
              "步骤 3 · 模块",
              "blocking",
              scenario.targetId,
            ),
          ],
          ...(scenario.targetIds === undefined
            ? {}
            : { targetIds: scenario.targetIds }),
        } as Parameters<typeof renderIssuePanel>[0]).html,
      );
      if (scenario.valid) {
        const link = document.querySelector<HTMLAnchorElement>("a.ui-button");
        expect(link?.getAttribute("data-target-valid")).toBe("true");
        expect(link?.getAttribute("href")).toBe("#module-config");
      } else {
        expect(document.querySelector("a.ui-button")).toBeNull();
        const note = document.querySelector<HTMLElement>(".ui-button-disabled");
        expect(note?.getAttribute("data-target-valid")).toBe("false");
        expect(note?.getAttribute("aria-disabled")).toBe("true");
      }
      expect(document.querySelector("[onclick]")).toBeNull();
    }
  });

  it("renders task progress with readable stages and safe percent normalization", () => {
    const document = documentFor(
      [
        renderTaskProgress({
          idPrefix: "task-a",
          label: "建立索引",
          percent: Number.NaN,
          stages: [
            { label: "上传", state: "complete" },
            { label: "索引", state: "current" },
            { label: "验证", state: "pending" },
          ],
          detail: "已处理 35 / 48 个段落，预计还需约 20 秒",
          canRunInBackground: true,
          logTargetId: "task-log",
        }).html,
        renderTaskProgress({
          idPrefix: "task-b",
          label: "建立索引",
          percent: Number.POSITIVE_INFINITY,
          stages: [{ label: "索引", state: "failed" }],
          detail: "失败阶段：索引。",
        }).html,
      ].join(""),
    );

    const progress = document.querySelector("[role='progressbar']");
    expect(progress?.getAttribute("aria-valuenow")).toBe("0");
    expect(progress?.getAttribute("aria-valuetext")).toContain("0%");
    expect(document.querySelector("[aria-current='step']")).not.toBeNull();
    expect(document.body.textContent).toContain("已完成：上传");
    expect(document.body.textContent).toContain("当前：索引");
    expect(document.body.textContent).toContain("失败：索引");
    expect(document.querySelector("[autofocus]")).toBeNull();
  });

  it("covers all required page state kinds with structured variants", () => {
    for (const kind of pageStateKinds) {
      const props =
        kind === "permission"
          ? ({ kind: "permission" } as const)
          : ({
              id: `state-${kind}`,
              kind,
              title: `状态：${kind}`,
              description: "保留导航并说明下一步。",
            } as const);
      const document = documentFor(
        renderPageState({
          ...props,
          ...(kind === "partial"
            ? {
                counts: {
                  succeeded: 7,
                  failed: 2,
                  impact: "2 个数据源需重新处理。",
                },
              }
            : {}),
          ...(kind === "degraded"
            ? {
                capabilities: {
                  available: ["搜索"],
                  unavailable: ["引用验证"],
                },
              }
            : {}),
        }).html,
      );
      expect(
        document.querySelector(".ui-page-state")?.getAttribute("data-kind"),
      ).toBe(kind);
      if (kind === "loading" || kind === "shortTask" || kind === "longTask") {
        expect(
          document.querySelector(".ui-page-state")?.getAttribute("aria-busy"),
        ).toBe("true");
      }
      if (kind === "partial") {
        expect(document.body.textContent).toContain("成功");
        expect(document.body.textContent).toContain("失败");
        expect(document.body.textContent).toContain("2 个数据源");
      }
      if (kind === "permission") {
        expect(document.body.textContent).toContain("权限不足");
        expect(document.body.textContent).toContain("切换上下文");
      }
      if (kind === "degraded") {
        expect(document.body.textContent).toContain("可用能力");
        expect(document.body.textContent).toContain("不可用能力");
      }
    }
  });

  it("does not leak caller supplied permission PageState fields at runtime", () => {
    const sentinels = [
      "SECRET_TITLE_WORKSPACE_ALPHA",
      "SECRET_DESCRIPTION_PROJECT_BRAVO",
      "SECRET_DETAILS_ENV_CHARLIE",
      "SECRET_PRIMARY_ACTION_DELTA",
      "SECRET_COUNT_IMPACT_RESOURCE_ECHO",
      "SECRET_AVAILABLE_CAPABILITY_FOXTROT",
      "SECRET_UNAVAILABLE_CAPABILITY_GOLF",
      "SECRET_ID_HOTEL",
    ];
    const html = renderPageState({
      kind: "permission",
      id: "SECRET_ID_HOTEL",
      title: "SECRET_TITLE_WORKSPACE_ALPHA",
      description: "SECRET_DESCRIPTION_PROJECT_BRAVO",
      details: "SECRET_DETAILS_ENV_CHARLIE",
      primaryAction: "SECRET_PRIMARY_ACTION_DELTA",
      counts: {
        succeeded: Number.NaN,
        failed: Number.POSITIVE_INFINITY,
        impact: "SECRET_COUNT_IMPACT_RESOURCE_ECHO",
      },
      capabilities: {
        available: ["SECRET_AVAILABLE_CAPABILITY_FOXTROT"],
        unavailable: ["SECRET_UNAVAILABLE_CAPABILITY_GOLF"],
      },
    } as unknown as Parameters<typeof renderPageState>[0]).html;

    for (const sentinel of sentinels) {
      expect(html).not.toContain(sentinel);
    }
    expect(html).toContain("权限不足");
    expect(html).toContain("你没有访问此内容所需的权限");
    expect(html).toContain("切换上下文");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Infinity");
  });

  it("handles throwing permission PageState getters and proxies without leaking sensitive fields", () => {
    const proxy = new Proxy(
      { kind: "permission" },
      {
        get(target, key) {
          if (key === "kind") {
            return target.kind;
          }
          throw new Error(`SECRET_PROXY_${String(key)}`);
        },
        ownKeys() {
          throw new Error("SECRET_PROXY_ENUMERATION");
        },
      },
    );

    const html = renderPageState(
      proxy as unknown as Parameters<typeof renderPageState>[0],
    ).html;
    expect(html).toContain("权限不足");
    expect(html).toContain("切换上下文");
    expect(html).not.toContain("SECRET_PROXY");
  });

  it("renders multiple permission PageStates without duplicate ids or sentinel leaks", async () => {
    const sentinels = [
      "SECRET_MULTI_TITLE_ALPHA",
      "SECRET_MULTI_DESCRIPTION_BRAVO",
      "SECRET_MULTI_DETAILS_CHARLIE",
      "SECRET_MULTI_IMPACT_DELTA",
      "SECRET_MALFORMED_ECHO",
    ];
    const throwingProxy = new Proxy(
      { kind: "permission" },
      {
        get(target, key) {
          if (key === "kind") {
            return target.kind;
          }
          throw new Error(`SECRET_MALFORMED_ECHO_${String(key)}`);
        },
      },
    );
    const html = [
      renderPageState({ kind: "permission" }).html,
      renderPageState({ kind: "permission", action: "contactAdmin" }).html,
      renderPageState({
        kind: "permission",
        title: "SECRET_MULTI_TITLE_ALPHA",
        description: "SECRET_MULTI_DESCRIPTION_BRAVO",
        details: "SECRET_MULTI_DETAILS_CHARLIE",
        counts: {
          succeeded: -1,
          failed: Number.NaN,
          impact: "SECRET_MULTI_IMPACT_DELTA",
        },
      } as unknown as Parameters<typeof renderPageState>[0]).html,
      renderPageState(
        throwingProxy as unknown as Parameters<typeof renderPageState>[0],
      ).html,
    ].join("");
    const document = documentFor(html);
    const ids = [...document.querySelectorAll("[id]")].map((node) => node.id);
    expect(ids.length).toBe(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const sentinel of sentinels) {
      expect(html).not.toContain(sentinel);
    }
    await expect(jsdomAxeViolations(html)).resolves.toEqual([]);
  });

  it("escapes malicious ids labels steps targets and summaries", async () => {
    const malicious = `x" onclick="alert(1)`;
    const html = [
      renderFormField({
        id: malicious,
        label: `<script>alert(1)</script>`,
        helpText: malicious,
        error: malicious,
      }).html,
      renderEffectiveResultPanel({
        idPrefix: "safe-effective",
        groups: {
          data: [
            {
              id: malicious,
              label: `<img src=x onerror=alert(1)>`,
              summary: `<script>alert(1)</script>`,
              sourceId: malicious,
            },
          ],
        },
      }).html,
      renderIssuePanel({
        idPrefix: "safe-issue",
        issues: [
          {
            id: "issue-safe",
            step: malicious,
            severity: "info",
            title: malicious,
            reason: malicious,
            impact: malicious,
            recommendation: malicious,
            actions: [{ label: malicious, targetId: malicious }],
          },
        ],
      }).html,
    ].join("");
    const document = documentFor(html);

    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector("[onclick]")).toBeNull();
    expect(document.body.innerHTML).toContain("&lt;script&gt;");
    await expect(jsdomAxeViolations(html)).resolves.toEqual([]);
  });

  it("allows multiple same-kind components without duplicate ids", async () => {
    const html = [
      renderEffectiveResultPanel({ idPrefix: "effective-one", groups: {} })
        .html,
      renderEffectiveResultPanel({ idPrefix: "effective-two", groups: {} })
        .html,
      renderIssuePanel({ idPrefix: "issue-one", issues: [] }).html,
      renderIssuePanel({ idPrefix: "issue-two", issues: [] }).html,
      renderTaskProgress({
        idPrefix: "task-one",
        label: "任务一",
        percent: 10,
        stages: [{ label: "上传", state: "current" }],
        detail: "运行中",
      }).html,
      renderTaskProgress({
        idPrefix: "task-two",
        label: "任务二",
        percent: 20,
        stages: [{ label: "扫描", state: "current" }],
        detail: "运行中",
      }).html,
    ].join("");
    const document = documentFor(html);
    const ids = [...document.querySelectorAll("[id]")].map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    await expect(jsdomAxeViolations(html)).resolves.toEqual([]);
  });

  it("exposes real Storybook entries for the full matrix", () => {
    const stories = [
      StatusTagAllStates,
      FormFieldMatrix,
      EffectiveResultMatrix,
      IssuePanelMatrix,
      TaskProgressMatrix,
      PageStateMatrix,
      Showcase,
    ];
    for (const story of stories) {
      expect(story.render).toBeTypeOf("function");
    }
    expect(Object.isFrozen(uiSemanticTokens)).toBe(true);
  });

  it("passes jsdom axe checks on the rendered showcase", async () => {
    await expect(jsdomAxeViolations(renderUiShowcase().html)).resolves.toEqual(
      [],
    );
  });

  it("keeps the showcase structure snapshot stable", () => {
    const hash = createHash("sha256")
      .update(renderUiShowcase().html)
      .digest("hex");
    expect(hash).toBe(
      "0df8d4ef90017e3e5a80a4a9845b4152b5df522c859dc43446fbb4f68533217d",
    );
  });
});

describe("WP-14B browser accessibility and visual regression", () => {
  const environment = currentVisualEnvironment();
  const cases = [
    {
      name: "showcase-1280",
      ...environment.viewports.showcase1280,
      html: renderUiShowcase().html,
    },
    {
      name: "showcase-1024",
      ...environment.viewports.showcase1024,
      html: renderUiShowcase().html,
    },
    {
      name: "form-field-error-secret",
      width: 1280,
      height: 700,
      html: `${
        renderFormField({
          id: "visual-error",
          label: "错误字段",
          error: "必须使用 3-64 个字母、数字或连字符。",
          errorExample: "docs-search",
        }).html
      }${
        renderFormField({
          id: "visual-secret",
          label: "API Secret",
          kind: "secret",
          helpText: "保存后不会回显。",
        }).html
      }`,
    },
    {
      name: "issue-panel-blocking",
      width: 1280,
      height: 700,
      html: `<div id="module-config"></div>${
        renderIssuePanel({
          idPrefix: "visual-issue",
          issues: [
            issue(
              "visual-blocking",
              "步骤 3 · 模块",
              "blocking",
              "module-config",
            ),
          ],
          targetIds: ["module-config"],
        }).html
      }`,
    },
    {
      name: "task-progress-running",
      width: 1280,
      height: 700,
      html: renderTaskProgress({
        idPrefix: "visual-task",
        label: "建立索引",
        percent: 72,
        stages: [
          { label: "上传", state: "complete" },
          { label: "索引", state: "current" },
          { label: "验证", state: "pending" },
        ],
        detail: "已处理 35 / 48 个段落，预计还需约 20 秒",
        canRunInBackground: true,
        logTargetId: "task-log",
      }).html,
    },
    {
      name: "page-state-matrix",
      width: 1280,
      height: 1100,
      html: pageStateKinds
        .map((kind) => {
          if (kind === "permission") {
            return renderPageState({ kind: "permission" });
          }
          const props = {
            id: `visual-${kind}`,
            kind,
            title: `状态：${kind}`,
            description: "保留导航并说明下一步。",
          } as const;
          return renderPageState({
            ...props,
            ...(kind === "partial"
              ? {
                  counts: {
                    succeeded: 7,
                    failed: 2,
                    impact: "2 个数据源需重新处理。",
                  },
                }
              : {}),
            ...(kind === "degraded"
              ? {
                  capabilities: {
                    available: ["搜索"],
                    unavailable: ["引用验证"],
                  },
                }
              : {}),
          });
        })
        .map((rendered) => rendered.html)
        .join(""),
    },
  ] as const;

  it("uses the canonical managed Chromium visual environment", async () => {
    expect(visualFontSha256).toBe(environment.fontSha256);
    expect(visualEnvironmentKey).toBe(
      `${environment.platform}-${environment.arch}`,
    );
    const browser = await launchManagedChromium();
    try {
      expect(browser.version()).toBe(environment.browserVersion);
      expect(environment.deviceScaleFactor).toBe(1);
    } finally {
      await browser.close();
    }
  }, 30_000);

  for (const scenario of cases) {
    it(`matches PNG visual baseline for ${scenario.name}`, async () => {
      const screenshot = await screenshotHtml(
        scenario.html,
        scenario.width,
        scenario.height,
      );
      const baselinePath = join(
        environment.baselineDir,
        `${scenario.name}.png`,
      );
      if (
        process.env.CI === "true" &&
        process.env.UPDATE_UI_BASELINES === "1"
      ) {
        throw new Error("UPDATE_UI_BASELINES=1 is forbidden in CI.");
      }
      if (process.env.UPDATE_UI_BASELINES === "1") {
        mkdirSync(dirname(baselinePath), { recursive: true });
        writeFileSync(baselinePath, screenshot);
      }
      expect(existsSync(baselinePath), baselinePath).toBe(true);
      const diff = pngDiff(readFileSync(baselinePath), screenshot);
      expect(diff.changedPixels).toBeLessThanOrEqual(500);
    }, 30_000);
  }

  it("passes real browser axe with color contrast enabled", async () => {
    const browser = await launchManagedChromium();
    const page = await browser.newPage({
      viewport: environment.viewports.browserAxe,
      deviceScaleFactor: environment.deviceScaleFactor,
    });
    try {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setContent(wrapHtml(renderUiShowcase().html), {
        waitUntil: "load",
      });
      await page.addScriptTag({ content: axeCore.source });
      const violations = await page.evaluate(async () => {
        const result = await (
          window as unknown as {
            axe: {
              run(): Promise<{
                violations: readonly { id: string; impact?: string | null }[];
              }>;
            };
          }
        ).axe.run();
        return result.violations.map((violation) => violation.id);
      });
      expect(violations).toEqual([]);
      const overflow = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(overflow.width).toBeLessThanOrEqual(overflow.client);
    } finally {
      await browser.close();
    }
  }, 30_000);

  it("passes real browser axe for multiple permission PageStates", async () => {
    const browser = await launchManagedChromium();
    const page = await browser.newPage({
      viewport: environment.viewports.browserAxe,
      deviceScaleFactor: environment.deviceScaleFactor,
    });
    try {
      await page.setContent(
        wrapHtml(
          [
            "<h1>Permission states</h1>",
            renderPageState({ kind: "permission" }).html,
            renderPageState({ kind: "permission", action: "contactAdmin" })
              .html,
            renderPageState({
              kind: "permission",
              title: "SECRET_BROWSER_PERMISSION_TITLE",
            } as unknown as Parameters<typeof renderPageState>[0]).html,
          ].join(""),
        ),
        { waitUntil: "load" },
      );
      await page.addScriptTag({ content: axeCore.source });
      const result = await page.evaluate(async () => {
        const ids = [...document.querySelectorAll("[id]")].map(
          (node) => node.id,
        );
        const axeResult = await (
          window as unknown as {
            axe: {
              run(): Promise<{
                violations: readonly { id: string; impact?: string | null }[];
              }>;
            };
          }
        ).axe.run();
        return {
          duplicateIds: ids.length - new Set(ids).size,
          html: document.body.innerHTML,
          violations: axeResult.violations.map((violation) => violation.id),
        };
      });
      expect(result.duplicateIds).toBe(0);
      expect(result.html).not.toContain("SECRET_BROWSER_PERMISSION_TITLE");
      expect(result.violations).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 30_000);

  it("toggles secret fields in a real browser without duplicate listeners or cross-instance changes", async () => {
    const firstId = `browser:secret"alpha`;
    const secondId = "browser.secret:beta";
    const browser = await launchManagedChromium();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 700 },
      deviceScaleFactor: environment.deviceScaleFactor,
    });
    try {
      await page.setContent(
        wrapHtml(
          [
            renderFormField({
              id: firstId,
              label: "Primary Secret",
              kind: "secret",
            }).html,
            renderFormField({
              id: secondId,
              label: "Secondary Secret",
              kind: "secret",
            }).html,
          ].join(""),
        ),
        { waitUntil: "load" },
      );
      await page.addScriptTag({
        type: "module",
        content: `import { attachUiBehaviors } from ${JSON.stringify(
          productionUiModuleDataUrl(),
        )};
globalThis.__wp14bAttachUiBehaviors = attachUiBehaviors;
attachUiBehaviors(document);
attachUiBehaviors(document);`,
      });
      await page.evaluate(() => {
        const button = document.querySelector<HTMLButtonElement>(
          "[data-ui-secret-toggle='true']",
        );
        button?.focus();
      });
      await page.keyboard.press("Enter");
      let state = await secretState(page);
      expect(state).toEqual({
        activeControls: firstId,
        firstPressed: "true",
        firstText: "隐藏 Secret",
        firstType: "text",
        secondPressed: "false",
        secondText: "显示 Secret",
        secondType: "password",
      });
      await page.keyboard.press("Space");
      state = await secretState(page);
      expect(state).toEqual({
        activeControls: firstId,
        firstPressed: "false",
        firstText: "显示 Secret",
        firstType: "password",
        secondPressed: "false",
        secondText: "显示 Secret",
        secondType: "password",
      });
      await page.click("[data-ui-secret-toggle='true']");
      state = await secretState(page);
      expect(state).toEqual({
        activeControls: firstId,
        firstPressed: "true",
        firstText: "隐藏 Secret",
        firstType: "text",
        secondPressed: "false",
        secondText: "显示 Secret",
        secondType: "password",
      });
    } finally {
      await browser.close();
    }
  }, 30_000);
});

function issue(
  id: string,
  step: string,
  severity: Issue["severity"],
  targetId: string,
): Issue {
  return {
    id,
    step,
    severity,
    title:
      severity === "blocking"
        ? "缺少“文档元数据”依赖"
        : severity === "warning"
          ? "文件较大"
          : "建议补充描述",
    reason: "引用验证需要元数据能力。",
    impact: "引用验证将无法确定引用版本。",
    recommendation: "补齐依赖模块后继续。",
    actions: [{ label: "查看模块", targetId }],
  };
}

async function screenshotHtml(
  html: string,
  width: number,
  height: number,
): Promise<Buffer> {
  const browser = await launchManagedChromium();
  const environment = currentVisualEnvironment();
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: environment.deviceScaleFactor,
  });
  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setContent(wrapHtml(html), { waitUntil: "load" });
    await page.addStyleTag({
      content: `${visualFontCss}*{font-family:"WP14BVisual",sans-serif!important;animation:none!important;transition:none!important}`,
    });
    const overflow = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(overflow.width).toBeLessThanOrEqual(overflow.client);
    return await page.screenshot({
      fullPage: true,
      type: "png",
    });
  } finally {
    await browser.close();
  }
}

async function secretState(page: Page): Promise<{
  readonly activeControls: string | null;
  readonly firstPressed: string | null;
  readonly firstText: string | null;
  readonly firstType: string | null;
  readonly secondPressed: string | null;
  readonly secondText: string | null;
  readonly secondType: string | null;
}> {
  return await page.evaluate(() => {
    const firstId = `browser:secret"alpha`;
    const secondId = "browser.secret:beta";
    const first = document.getElementById(firstId) as HTMLInputElement | null;
    const second = document.getElementById(secondId) as HTMLInputElement | null;
    const toggles = [
      ...document.querySelectorAll<HTMLButtonElement>(
        "[data-ui-secret-toggle='true']",
      ),
    ];
    const firstToggle =
      toggles.find(
        (toggle) => toggle.getAttribute("aria-controls") === firstId,
      ) ?? null;
    const secondToggle =
      toggles.find(
        (toggle) => toggle.getAttribute("aria-controls") === secondId,
      ) ?? null;
    return {
      activeControls:
        document.activeElement?.getAttribute("aria-controls") ?? null,
      firstPressed: firstToggle?.getAttribute("aria-pressed") ?? null,
      firstText: firstToggle?.textContent ?? null,
      firstType: first?.type ?? null,
      secondPressed: secondToggle?.getAttribute("aria-pressed") ?? null,
      secondText: secondToggle?.textContent ?? null,
      secondType: second?.type ?? null,
    };
  });
}

function pngDiff(
  expected: Buffer,
  actual: Buffer,
): { readonly changedPixels: number } {
  const expectedPng = PNG.sync.read(expected);
  const actualPng = PNG.sync.read(actual);
  expect(actualPng.width).toBe(expectedPng.width);
  expect(actualPng.height).toBe(expectedPng.height);
  let changedPixels = 0;
  for (let index = 0; index < expectedPng.data.length; index += 4) {
    if (
      expectedPng.data[index] !== actualPng.data[index] ||
      expectedPng.data[index + 1] !== actualPng.data[index + 1] ||
      expectedPng.data[index + 2] !== actualPng.data[index + 2] ||
      expectedPng.data[index + 3] !== actualPng.data[index + 3]
    ) {
      changedPixels += 1;
    }
  }
  return { changedPixels };
}

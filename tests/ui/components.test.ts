import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  renderEffectiveResultPanel,
  renderFormField,
  renderIssuePanel,
  renderPageState,
  renderStatusTag,
  renderTaskProgress,
  renderUiShowcase,
  uiSemanticTokens,
  uiStoryMatrix,
  type Issue,
  type PageStateKind,
  type StatusKind,
} from "../../packages/ui/src/index.js";
import {
  EffectiveResultFullGroups,
  FormFieldErrorAndSecret,
  IssuePanelBlockingAndWarning,
  PageStateStateMatrix,
  Showcase,
  StatusTagAllStates,
  TaskProgressLongRunning,
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

const requireFromUiPackage = createRequire(
  new URL("../../packages/ui/package.json", import.meta.url),
);
const axeCore = requireFromUiPackage("axe-core") as AxeModule;
const { JSDOM } = requireFromUiPackage("jsdom") as JsdomModule;

function documentFor(html: string): Document {
  return new JSDOM(html, {
    pretendToBeVisual: true,
    runScripts: "outside-only",
    url: "https://ui.modular-mcp.local",
  }).window.document;
}

async function axeViolations(html: string): Promise<readonly string[]> {
  const dom = new JSDOM(html, {
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
          readonly violations: readonly {
            readonly id: string;
          }[];
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
  it("renders semantic status tags without color-only meaning", () => {
    for (const kind of statusKinds) {
      const document = documentFor(renderStatusTag({ kind }).html);
      const tag = document.querySelector<HTMLElement>("[role='status']");
      expect(tag?.textContent?.trim()).not.toBe("");
      expect(tag?.getAttribute("aria-label")).not.toBe("");
      expect(tag?.getAttribute("data-tone")).toMatch(
        /neutral|info|success|warning|danger|paused|archived/,
      );
      expect(tag?.querySelector("[aria-hidden='true']")).not.toBeNull();
    }
  });

  it("connects form labels help and errors with aria-describedby", () => {
    const document = documentFor(
      renderFormField({
        id: "service-name",
        label: "服务名称",
        required: true,
        helpText: "用于发布后的服务列表。",
        error: "必须使用 3-64 个字母、数字或连字符。",
        errorExample: "docs-search",
      }).html,
    );
    const input = document.querySelector<HTMLInputElement>("#service-name");
    const label = document.querySelector("label");
    const error = document.querySelector("#service-name-error");

    expect(label?.getAttribute("for")).toBe("service-name");
    expect(input?.getAttribute("aria-describedby")).toBe(
      "service-name-help service-name-error",
    );
    expect(input?.getAttribute("aria-invalid")).toBe("true");
    expect(input?.getAttribute("aria-required")).toBe("true");
    expect(error?.getAttribute("role")).toBe("alert");
    expect(error?.textContent).toContain("docs-search");
  });

  it("keeps secret values hidden and provides an explicit toggle", () => {
    const document = documentFor(
      renderFormField({
        id: "api-secret",
        label: "API Secret",
        kind: "secret",
        value: "should-not-render",
        helpText: "保存后不会回显。",
      }).html,
    );

    expect(document.body.innerHTML).not.toContain("should-not-render");
    expect(document.querySelector("input")?.getAttribute("type")).toBe(
      "password",
    );
    expect(document.querySelector("button")?.getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("renders effective result fixed groups with source links", () => {
    const document = documentFor(
      renderEffectiveResultPanel({
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

    const headings = [...document.querySelectorAll("h3")].map(
      (heading) => heading.textContent,
    );
    expect(headings).toEqual([
      "数据",
      "Tools",
      "Resources",
      "Prompts",
      "输出",
      "访问",
      "不会提供",
      "风险与问题",
    ]);
    expect(document.querySelector("a")?.getAttribute("href")).toBe(
      "#source-config",
    );
    expect(document.querySelector("[data-changed='true']")).not.toBeNull();
  });

  it("renders issue panel without ignore-all escape hatches", () => {
    const issues: readonly Issue[] = [
      {
        id: "missing-metadata",
        step: "步骤 3 · 模块",
        severity: "blocking",
        title: "缺少“文档元数据”依赖",
        reason: "引用验证需要元数据能力。",
        impact: "引用验证将无法确定引用版本。",
        recommendation: "补齐依赖模块后继续。",
        actions: [{ label: "查看模块", targetId: "module-config" }],
      },
      {
        id: "large-file",
        step: "步骤 2 · 数据",
        severity: "warning",
        title: "文件较大",
        reason: "上传文件超过常规处理大小。",
        impact: "后台任务可能持续更久。",
        recommendation: "保留输入并等待后台处理。",
        actions: [{ label: "查看文件", targetId: "file-config" }],
      },
    ];
    const document = documentFor(renderIssuePanel({ issues }).html);

    expect(document.querySelector("[data-severity='blocking']")).not.toBeNull();
    expect(document.querySelector("[data-severity='warning']")).not.toBeNull();
    expect(document.body.textContent).toContain("阻断 1 / 警告 1");
    expect(document.body.textContent).toContain("前往修改");
    expect(document.body.textContent).not.toMatch(/忽略所有|ignore all/i);
  });

  it("renders task progress with numeric value stage text and polite live region", () => {
    const document = documentFor(
      renderTaskProgress({
        label: "建立索引",
        percent: 72.2,
        stages: [
          { label: "上传", state: "complete" },
          { label: "索引", state: "current" },
          { label: "验证", state: "pending" },
        ],
        detail: "已处理 35 / 48 个段落，预计还需约 20 秒",
        canRunInBackground: true,
        logTargetId: "task-log",
      }).html,
    );
    const progress = document.querySelector("[role='progressbar']");

    expect(progress?.getAttribute("aria-valuenow")).toBe("72");
    expect(
      document.querySelector("[aria-live='polite']")?.textContent,
    ).toContain("35 / 48");
    expect(document.body.textContent).toContain("索引");
    expect(document.querySelector("[autofocus]")).toBeNull();
  });

  it("covers all required page state kinds", () => {
    for (const kind of pageStateKinds) {
      const document = documentFor(
        renderPageState({
          kind,
          title: `状态：${kind}`,
          description: "保留导航并说明下一步。",
        }).html,
      );
      expect(
        document.querySelector(".ui-page-state")?.getAttribute("data-kind"),
      ).toBe(kind);
      expect(document.querySelector("h2")?.textContent).toBe(`状态：${kind}`);
    }
  });

  it("exports a frozen story matrix covering every component family", () => {
    expect(Object.isFrozen(uiSemanticTokens)).toBe(true);
    expect(Object.isFrozen(uiStoryMatrix)).toBe(true);
    expect(uiStoryMatrix.map((story) => story.title)).toEqual([
      "StatusTag/AllStates",
      "FormField/ErrorAndSecret",
      "EffectiveResult/FullGroups",
      "IssuePanel/BlockingAndWarning",
      "TaskProgress/LongRunning",
      "PageState/StateMatrix",
    ]);
  });

  it("exposes Storybook-compatible entries for the full matrix", () => {
    const stories = [
      StatusTagAllStates,
      FormFieldErrorAndSecret,
      EffectiveResultFullGroups,
      IssuePanelBlockingAndWarning,
      TaskProgressLongRunning,
      PageStateStateMatrix,
      Showcase,
    ];
    for (const story of stories) {
      expect(story.render()).toContain("<");
    }
  });

  it("passes axe checks on the real rendered showcase", async () => {
    await expect(axeViolations(renderUiShowcase().html)).resolves.toEqual([]);
  });

  it("keeps the showcase visual snapshot stable", () => {
    const hash = createHash("sha256")
      .update(renderUiShowcase().html)
      .digest("hex");
    expect(hash).toBe(
      "71c5aebba74c741908feeef97c4088bd09f586d2e0be4b7f42eb44480fd1a064",
    );
  });
});

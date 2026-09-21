export const packageLayer = "ui" as const;
export const uiStylesHref = "./styles.css" as const;

export type UiTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "paused"
  | "archived";

export interface RenderedUi {
  readonly html: string;
}

export const uiSemanticTokens = deepFreeze({
  color: {
    surface: "--mcp-ui-surface",
    text: "--mcp-ui-text",
    muted: "--mcp-ui-muted",
    border: "--mcp-ui-border",
    focus: "--mcp-ui-focus-ring",
    neutral: "--mcp-ui-tone-neutral",
    info: "--mcp-ui-tone-info",
    success: "--mcp-ui-tone-success",
    warning: "--mcp-ui-tone-warning",
    danger: "--mcp-ui-tone-danger",
    paused: "--mcp-ui-tone-paused",
    archived: "--mcp-ui-tone-archived",
  },
  spacing: {
    compact: "--mcp-ui-space-compact",
    regular: "--mcp-ui-space-regular",
    spacious: "--mcp-ui-space-spacious",
  },
  radius: "--mcp-ui-radius",
  controlHeight: "--mcp-ui-control-height",
});

export type StatusKind =
  | "draft"
  | "processing"
  | "actionRequired"
  | "success"
  | "running"
  | "paused"
  | "failed"
  | "blocked"
  | "archived";

export interface StatusTagProps {
  readonly kind: StatusKind;
  readonly label?: string;
  readonly detail?: string;
  readonly announce?: boolean;
}

const statusConfig = deepFreeze({
  draft: { tone: "neutral", icon: "✎", label: "草稿" },
  processing: { tone: "info", icon: "●", label: "处理中" },
  actionRequired: { tone: "warning", icon: "!", label: "需要操作" },
  success: { tone: "success", icon: "✓", label: "成功" },
  running: { tone: "success", icon: "▶", label: "运行中" },
  paused: { tone: "paused", icon: "Ⅱ", label: "暂停" },
  failed: { tone: "danger", icon: "×", label: "失败" },
  blocked: { tone: "danger", icon: "!", label: "阻断" },
  archived: { tone: "archived", icon: "▣", label: "已归档" },
} satisfies Record<
  StatusKind,
  { readonly tone: UiTone; readonly icon: string; readonly label: string }
>);

export function renderStatusTag(props: StatusTagProps): RenderedUi {
  const config = statusConfig[props.kind];
  const label = props.label ?? config.label;
  const detail = props.detail ? ` · ${props.detail}` : "";
  const liveAttrs = props.announce
    ? ` role="status" aria-label="${attribute(`${label}${detail}`)}"`
    : "";
  return {
    html: `<span class="ui-status-tag" data-tone="${attribute(
      config.tone,
    )}"${liveAttrs}><span aria-hidden="true">${text(
      config.icon,
    )}</span><span>${text(label)}</span>${
      props.detail ? `<span>${text(detail)}</span>` : ""
    }</span>`,
  };
}

export type FieldKind = "text" | "textarea" | "select" | "secret" | "json";

export interface FormFieldProps {
  readonly id: string;
  readonly label: string;
  readonly kind?: FieldKind;
  readonly value?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly helpText?: string;
  readonly error?: string;
  readonly errorExample?: string;
  readonly options?: readonly {
    readonly value: string;
    readonly label: string;
  }[];
}

export function renderFormField(props: FormFieldProps): RenderedUi {
  const kind = props.kind ?? "text";
  const helpId = `${props.id}-help`;
  const errorId = `${props.id}-error`;
  const describedBy = [
    props.helpText ? helpId : undefined,
    props.error ? errorId : undefined,
  ].filter((value): value is string => value !== undefined);
  const description = describedBy.length
    ? ` aria-describedby="${attribute(describedBy.join(" "))}"`
    : "";
  const common = `id="${attribute(props.id)}" name="${attribute(
    props.id,
  )}"${description}${props.required ? ' required aria-required="true"' : ""}${
    props.error ? ' aria-invalid="true"' : ""
  }${props.disabled ? " disabled" : ""}`;
  const control =
    kind === "textarea" || kind === "json"
      ? `<textarea ${common} rows="${kind === "json" ? 8 : 4}"${
          kind === "json" ? ' data-editor="json"' : ""
        }>${text(props.value ?? "")}</textarea>`
      : kind === "select"
        ? `<select ${common}>${(props.options ?? [])
            .map(
              (option) =>
                `<option value="${attribute(option.value)}"${
                  option.value === props.value ? " selected" : ""
                }>${text(option.label)}</option>`,
            )
            .join("")}</select>`
        : `<input ${common} type="${
            kind === "secret" ? "password" : "text"
          }" value="${attribute(
            kind === "secret" ? "" : (props.value ?? ""),
          )}" autocomplete="${kind === "secret" ? "off" : "on"}"${
            kind === "secret" ? ' data-ui-secret-input="true"' : ""
          }>`;
  const secretToggle =
    kind === "secret"
      ? `<button type="button" class="ui-secret-toggle" data-ui-secret-toggle="true" aria-pressed="false" aria-controls="${attribute(
          props.id,
        )}">显示 Secret</button>`
      : "";
  return {
    html: `<div class="ui-form-field" data-invalid="${props.error ? "true" : "false"}">
  <label for="${attribute(props.id)}">${text(props.label)}${
    props.required ? ' <span aria-label="必填">*</span>' : ""
  }</label>
  ${props.helpText ? `<p id="${attribute(helpId)}" class="ui-help">${text(props.helpText)}</p>` : ""}
  <div class="ui-control">${control}${secretToggle}</div>
  ${
    props.error
      ? `<p id="${attribute(errorId)}" class="ui-error" role="alert">${text(
          props.error,
        )}${props.errorExample ? ` 示例：${text(props.errorExample)}` : ""}</p>`
      : ""
  }
</div>`,
  };
}

export function attachUiBehaviors(root: ParentNode): void {
  for (const button of Array.from(
    root.querySelectorAll<HTMLButtonElement>("[data-ui-secret-toggle='true']"),
  )) {
    if (button.dataset.uiBound === "true") {
      continue;
    }
    button.dataset.uiBound = "true";
    const toggle = () => toggleSecret(button, root);
    button.addEventListener("click", toggle);
    button.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggle();
      }
    });
  }
}

function toggleSecret(button: HTMLButtonElement, root: ParentNode): void {
  const controlId = button.getAttribute("aria-controls");
  if (controlId === null) {
    return;
  }
  const input = root.querySelector<HTMLInputElement>(
    `#${cssEscape(controlId)}[data-ui-secret-input='true']`,
  );
  if (input === null) {
    return;
  }
  const showing = input.type === "password";
  input.type = showing ? "text" : "password";
  button.setAttribute("aria-pressed", showing ? "true" : "false");
  button.textContent = showing ? "隐藏 Secret" : "显示 Secret";
  button.focus();
}

export type ResultGroup =
  | "data"
  | "tools"
  | "resources"
  | "prompts"
  | "outputs"
  | "access"
  | "notProvided"
  | "risks";

export interface EffectiveResultItem {
  readonly id: string;
  readonly label: string;
  readonly summary: string;
  readonly sourceId: string;
  readonly changed?: boolean;
}

export interface EffectiveResultPanelProps {
  readonly idPrefix: string;
  readonly groups: Partial<Record<ResultGroup, readonly EffectiveResultItem[]>>;
}

const resultGroupLabels = deepFreeze({
  data: "数据",
  tools: "Tools",
  resources: "Resources",
  prompts: "Prompts",
  outputs: "输出",
  access: "访问",
  notProvided: "不会提供",
  risks: "风险与问题",
} satisfies Record<ResultGroup, string>);

export function renderEffectiveResultPanel(
  props: EffectiveResultPanelProps,
): RenderedUi {
  const headingId = `${props.idPrefix}-effective-heading`;
  return {
    html: `<div class="ui-effective-result" role="group" aria-labelledby="${attribute(
      headingId,
    )}">
  <h2 id="${attribute(headingId)}">Effective Result</h2>
  ${Object.entries(resultGroupLabels)
    .map(([key, label], index) => {
      const groupId = `${props.idPrefix}-effective-${index}-${key}`;
      const items = props.groups[key as ResultGroup] ?? [];
      return `<div role="group" aria-labelledby="${attribute(groupId)}">
    <h3 id="${attribute(groupId)}">${label}</h3>
    ${
      items.length === 0
        ? '<p class="ui-muted">暂无结果</p>'
        : `<ul>${items
            .map(
              (item) =>
                `<li data-result-id="${attribute(item.id)}">${
                  item.changed
                    ? '<span class="ui-change-marker">已变化</span>'
                    : ""
                }<a href="#${attribute(item.sourceId)}">${text(
                  item.label,
                )}</a><p>${text(item.summary)}</p></li>`,
            )
            .join("")}</ul>`
    }
  </div>`;
    })
    .join("")}
</div>`,
  };
}

export type IssueSeverity = "blocking" | "warning" | "info";

export interface IssueAction {
  readonly label: string;
  readonly targetId: string;
}

export interface Issue {
  readonly id: string;
  readonly step: string;
  readonly severity: IssueSeverity;
  readonly title: string;
  readonly reason: string;
  readonly impact: string;
  readonly recommendation: string;
  readonly actions: readonly IssueAction[];
}

export interface IssuePanelProps {
  readonly idPrefix: string;
  readonly issues: readonly Issue[];
  readonly targetIds: readonly string[];
}

const issueSeverityConfig = deepFreeze({
  blocking: { label: "阻断", status: "blocked" },
  warning: { label: "警告", status: "actionRequired" },
  info: { label: "提示", status: "draft" },
} satisfies Record<
  IssueSeverity,
  { readonly label: string; readonly status: StatusKind }
>);

export function renderIssuePanel(props: IssuePanelProps): RenderedUi {
  const headingId = `${props.idPrefix}-issue-heading`;
  const blocking = props.issues.filter(
    (issue) => issue.severity === "blocking",
  );
  const warnings = props.issues.filter((issue) => issue.severity === "warning");
  const grouped = groupBy(props.issues, (issue) => issue.step);
  const knownTargets = targetRegistry(props.targetIds);
  return {
    html: `<div class="ui-issue-panel" role="group" aria-labelledby="${attribute(
      headingId,
    )}">
  <h2 id="${attribute(headingId)}">阻断 ${blocking.length} / 警告 ${warnings.length}</h2>
  ${
    props.issues.length === 0
      ? '<p class="ui-muted">暂无问题</p>'
      : Object.entries(grouped)
          .map(
            ([step, issues], index) =>
              `<div role="group" aria-labelledby="${attribute(
                `${props.idPrefix}-issue-group-${index}`,
              )}">
    <h3 id="${attribute(`${props.idPrefix}-issue-group-${index}`)}">${text(
      step || "未分组",
    )}</h3>
    <ul>${issues
      .map(
        (issue) => `<li id="${attribute(issue.id)}" data-severity="${attribute(
          issue.severity,
        )}">
      ${
        renderStatusTag({
          kind: issueSeverityConfig[issue.severity].status,
          label: issueSeverityConfig[issue.severity].label,
        }).html
      }
      <h4>${text(issue.title)}</h4>
      <p><strong>原因：</strong>${text(issue.reason)}</p>
      <p><strong>影响：</strong>${text(issue.impact)}</p>
      <p><strong>修复建议：</strong>${text(issue.recommendation)}</p>
      <div>${issue.actions
        .map((action) => {
          const targetExists = knownTargets.has(action.targetId);
          if (!targetExists) {
            return `<span class="ui-button ui-button-disabled" role="note" aria-disabled="true" data-target-valid="false">无法定位：${text(
              action.label,
            )}</span>`;
          }
          return `<a class="ui-button" href="#${attribute(
            action.targetId,
          )}" data-target-valid="true">前往修改：${text(action.label)}</a>`;
        })
        .join("")}</div>
    </li>`,
      )
      .join("")}</ul>
  </div>`,
          )
          .join("")
  }
</div>`,
  };
}

export type TaskStageState = "complete" | "current" | "pending" | "failed";

export interface TaskStage {
  readonly label: string;
  readonly state: TaskStageState;
}

export interface TaskProgressProps {
  readonly idPrefix: string;
  readonly label: string;
  readonly percent: number;
  readonly stages: readonly TaskStage[];
  readonly detail: string;
  readonly canRunInBackground?: boolean;
  readonly logTargetId?: string;
}

export function renderTaskProgress(props: TaskProgressProps): RenderedUi {
  const headingId = `${props.idPrefix}-task-heading`;
  const percent = normalizePercent(props.percent);
  return {
    html: `<div class="ui-task-progress" role="group" aria-labelledby="${attribute(
      headingId,
    )}" aria-busy="${percent < 100 ? "true" : "false"}">
  <div class="ui-progress-header">
    <h2 id="${attribute(headingId)}">${text(props.label)}</h2>
    <span>${percent}%</span>
  </div>
  <div role="progressbar" style="--progress-value:${percent}%" aria-label="${attribute(
    props.label,
  )}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" aria-valuetext="${attribute(
    `${percent}% · ${currentStageLabel(props.stages)}`,
  )}"></div>
  <ol>${props.stages
    .map(
      (stage) =>
        `<li data-state="${stage.state}"${
          stage.state === "current" ? ' aria-current="step"' : ""
        }><span aria-hidden="true">${stageIcon(stage.state)}</span><span>${text(
          `${stageStateLabel(stage.state)}：${stage.label}`,
        )}</span></li>`,
    )
    .join("")}</ol>
  <p aria-live="polite">${text(props.detail)}</p>
  <div>${
    props.canRunInBackground ? '<button type="button">在后台继续</button>' : ""
  }${
    props.logTargetId
      ? `<a href="#${attribute(props.logTargetId)}">查看详细日志</a>`
      : ""
  }</div>
</div>`,
  };
}

export type PageStateKind =
  | "empty"
  | "filteredEmpty"
  | "loading"
  | "shortTask"
  | "longTask"
  | "success"
  | "partial"
  | "retryable"
  | "nonretryable"
  | "permission"
  | "dataChanged"
  | "degraded";

export interface PageStateCounts {
  readonly succeeded: number;
  readonly failed: number;
  readonly impact: string;
}

export interface PageStateCapabilitySummary {
  readonly available: readonly string[];
  readonly unavailable: readonly string[];
}

type GeneralPageStateKind = Exclude<
  PageStateKind,
  "partial" | "degraded" | "permission"
>;

interface BasePageStateProps {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly primaryAction?: string;
  readonly details?: string;
}

export type PermissionPageStateAction = "switchContext" | "contactAdmin";

export type PageStateProps =
  | (BasePageStateProps & {
      readonly kind: GeneralPageStateKind;
      readonly counts?: never;
      readonly capabilities?: never;
    })
  | (BasePageStateProps & {
      readonly kind: "partial";
      readonly counts: PageStateCounts;
      readonly capabilities?: never;
    })
  | (BasePageStateProps & {
      readonly kind: "degraded";
      readonly capabilities: PageStateCapabilitySummary;
      readonly counts?: never;
    })
  | {
      readonly kind: "permission";
      readonly action?: PermissionPageStateAction;
      readonly id?: never;
      readonly title?: never;
      readonly description?: never;
      readonly primaryAction?: never;
      readonly details?: never;
      readonly counts?: never;
      readonly capabilities?: never;
    };

const pageStateConfig = deepFreeze({
  empty: { tone: "neutral", defaultAction: "创建或了解流程", busy: false },
  filteredEmpty: { tone: "neutral", defaultAction: "清除筛选", busy: false },
  loading: { tone: "info", defaultAction: "", busy: true },
  shortTask: { tone: "info", defaultAction: "取消", busy: true },
  longTask: { tone: "info", defaultAction: "在后台继续", busy: true },
  success: {
    tone: "success",
    defaultAction: "进入下一个核心动作",
    busy: false,
  },
  partial: {
    tone: "warning",
    defaultAction: "修复失败项或确认排除",
    busy: false,
  },
  retryable: { tone: "warning", defaultAction: "重试", busy: false },
  nonretryable: {
    tone: "danger",
    defaultAction: "替换、返回或联系支持",
    busy: false,
  },
  permission: { tone: "danger", busy: false },
  dataChanged: {
    tone: "warning",
    defaultAction: "刷新、比较或创建新版本",
    busy: false,
  },
  degraded: { tone: "warning", defaultAction: "查看告警或暂停", busy: false },
} satisfies Record<
  PageStateKind,
  {
    readonly tone: UiTone;
    readonly defaultAction?: string;
    readonly busy: boolean;
  }
>);

export function renderPageState(props: PageStateProps): RenderedUi {
  try {
    const kind = safeProperty<PageStateKind>(props, "kind");
    if (kind === "permission") {
      return renderPermissionPageState(safeProperty(props, "action"));
    }
    if (!isPageStateKind(kind) || kind === undefined) {
      return renderPermissionPageState();
    }

    const config = pageStateConfig[kind];
    const id = safeString(safeProperty(props, "id"), `page-${kind}`);
    const title = safeString(safeProperty(props, "title"), "状态不可用");
    const description = safeString(
      safeProperty(props, "description"),
      "当前状态无法显示。",
    );
    const details = safeOptionalString(safeProperty(props, "details"));
    const primaryAction =
      safeOptionalString(safeProperty(props, "primaryAction")) ??
      config.defaultAction;
    const headingId = `${id}-heading`;
    return {
      html: `<div class="ui-page-state" role="group" data-kind="${attribute(
        kind,
      )}" data-tone="${config.tone}" aria-labelledby="${attribute(
        headingId,
      )}"${config.busy ? ' aria-busy="true"' : ""}>
  <h2 id="${attribute(headingId)}">${text(title)}</h2>
  <p>${text(description)}</p>
  ${details ? `<p>${text(details)}</p>` : ""}
  ${kind === "partial" ? renderPageStateCounts(safeProperty(props, "counts")) : ""}
  ${kind === "degraded" ? renderPageStateCapabilities(safeProperty(props, "capabilities")) : ""}
  ${primaryAction ? `<button type="button">${text(primaryAction)}</button>` : ""}
</div>`,
    };
  } catch {
    return renderPermissionPageState();
  }
}

export interface UiStory {
  readonly title: string;
  render(): string;
}

export const uiStoryMatrix = deepFreeze([
  story("StatusTag/AllStates", renderStatusTagStories),
  story("FormField/Matrix", renderFormFieldStories),
  story("EffectiveResult/Matrix", renderEffectiveResultStories),
  story("IssuePanel/Matrix", renderIssuePanelStories),
  story("TaskProgress/Matrix", renderTaskProgressStories),
  story("PageState/StateMatrix", renderPageStateStories),
]);

export function renderUiShowcase(): RenderedUi {
  return {
    html: `<!doctype html><html lang="zh-CN"><head><title>WP-14B UI Showcase</title><link rel="stylesheet" href="${uiStylesHref}"></head><body><main id="main-content"><h1>WP-14B UI Showcase</h1><div id="source-config"></div><div id="tool-config"></div><div id="resource-config"></div><div id="prompt-config"></div><div id="output-config"></div><div id="access-config"></div><div id="risk-config"></div><div id="module-config"></div><div id="file-config"></div>${uiStoryMatrix
      .map(
        (item) =>
          `<section aria-labelledby="${attribute(slug(item.title))}"><h2 id="${attribute(
            slug(item.title),
          )}">${text(item.title)}</h2>${item.render()}</section>`,
      )
      .join("")}</main></body></html>`,
  };
}

function renderStatusTagStories(): string {
  return (
    [
      "draft",
      "processing",
      "actionRequired",
      "success",
      "running",
      "paused",
      "failed",
      "blocked",
      "archived",
    ] as const
  )
    .map((kind) => renderStatusTag({ kind }).html)
    .join("");
}

function renderFormFieldStories(): string {
  return [
    renderFormField({ id: "field-default", label: "默认字段" }).html,
    renderFormField({
      id: "field-required",
      label: "必填字段",
      required: true,
      helpText: "始终显示帮助文案。",
    }).html,
    renderFormField({
      id: "field-error",
      label: "错误字段",
      error: "必须使用 3-64 个字母、数字或连字符。",
      errorExample: "docs-search",
    }).html,
    renderFormField({
      id: "field-select",
      label: "选择字段",
      kind: "select",
      value: "production",
      options: [
        { value: "development", label: "Development" },
        { value: "production", label: "Production" },
      ],
    }).html,
    renderFormField({
      id: "field-textarea",
      label: "多行文本",
      kind: "textarea",
    }).html,
    renderFormField({ id: "field-json", label: "JSON 配置", kind: "json" })
      .html,
    renderFormField({
      id: "field-secret",
      label: "API Secret",
      kind: "secret",
      value: "saved-secret-never-render",
      helpText: "保存后不会回显。",
    }).html,
  ].join("");
}

function renderEffectiveResultStories(): string {
  return [
    renderEffectiveResultPanel({ idPrefix: "effective-empty", groups: {} })
      .html,
    renderEffectiveResultPanel({
      idPrefix: "effective-full",
      groups: {
        data: [result("source", "文档数据", "2 个来源", "source-config")],
        tools: [result("search", "Search Tool", "允许引用检索", "tool-config")],
        resources: [
          result("resource", "索引资源", "向量索引", "resource-config"),
        ],
        prompts: [result("prompt", "问答提示", "含引用要求", "prompt-config")],
        outputs: [result("output", "结构化答案", "JSON 输出", "output-config")],
        access: [result("access", "项目成员", "只读访问", "access-config")],
        notProvided: [result("none", "原文下载", "不会提供", "risk-config")],
        risks: [result("risk", "生产凭证", "需要确认", "risk-config", true)],
      },
    }).html,
  ].join("");
}

function renderIssuePanelStories(): string {
  return [
    renderIssuePanel({
      idPrefix: "issue-empty",
      issues: [],
      targetIds: ["module-config", "file-config"],
    }).html,
    renderIssuePanel({
      idPrefix: "issue-multi",
      issues: [
        issue("missing-metadata", "步骤 3 · 模块", "blocking"),
        issue("large-file", "步骤 2 · 数据", "warning"),
        issue("hint", "步骤 2 · 数据", "info"),
      ],
      targetIds: ["module-config", "file-config"],
    }).html,
  ].join("");
}

function renderTaskProgressStories(): string {
  return [
    task("task-zero", 0, "pending"),
    task("task-running", 72, "current"),
    task("task-failed", 50, "failed"),
    task("task-complete", 100, "complete"),
  ].join("");
}

function renderPageStateStories(): string {
  return (Object.keys(pageStateConfig) as PageStateKind[])
    .map((kind) => {
      if (kind === "permission") {
        return renderPageState({ kind: "permission" });
      }
      if (kind === "partial") {
        return renderPageState({
          id: "page-partial",
          kind,
          title: "状态：partial",
          description: "保留导航并说明下一步。",
          counts: {
            succeeded: 7,
            failed: 2,
            impact: "2 个数据源需重新处理。",
          },
        });
      }
      if (kind === "degraded") {
        return renderPageState({
          id: "page-degraded",
          kind,
          title: "状态：degraded",
          description: "保留导航并说明下一步。",
          capabilities: { available: ["搜索"], unavailable: ["引用验证"] },
        });
      }
      return renderPageState({
        id: `page-${kind}`,
        kind,
        title: `状态：${kind}`,
        description: "保留导航并说明下一步。",
      });
    })
    .map((rendered) => rendered.html)
    .join("");
}

function task(
  idPrefix: string,
  percent: number,
  state: TaskStageState,
): string {
  return renderTaskProgress({
    idPrefix,
    label: "建立索引",
    percent,
    stages: [
      { label: "上传", state: state === "pending" ? "current" : "complete" },
      { label: "扫描", state: percent > 20 ? "complete" : "pending" },
      { label: "索引", state },
      { label: "验证", state: percent === 100 ? "complete" : "pending" },
    ],
    detail: "已处理 35 / 48 个段落，预计还需约 20 秒",
    canRunInBackground: true,
    logTargetId: "task-log",
  }).html;
}

function story(title: string, render: () => string): UiStory {
  return Object.freeze({ title, render });
}

function result(
  id: string,
  label: string,
  summary: string,
  sourceId: string,
  changed = false,
): EffectiveResultItem {
  return Object.freeze({ id, label, summary, sourceId, changed });
}

function issue(id: string, step: string, severity: IssueSeverity): Issue {
  return Object.freeze({
    id,
    step,
    severity,
    title:
      severity === "blocking"
        ? "缺少“文档元数据”依赖"
        : severity === "warning"
          ? "文件较大"
          : "建议补充描述",
    reason:
      severity === "blocking"
        ? "引用验证需要元数据能力。"
        : severity === "warning"
          ? "上传文件超过常规处理大小。"
          : "描述能帮助审核者理解用途。",
    impact:
      severity === "blocking"
        ? "引用验证将无法确定引用版本。"
        : severity === "warning"
          ? "后台任务可能持续更久。"
          : "不会阻断继续。",
    recommendation:
      severity === "blocking"
        ? "补齐依赖模块后继续。"
        : severity === "warning"
          ? "保留输入并等待后台处理。"
          : "补充用途说明。",
    actions: [
      {
        label: severity === "blocking" ? "查看模块" : "查看文件",
        targetId: severity === "blocking" ? "module-config" : "file-config",
      },
    ],
  });
}

function groupBy<T>(
  values: readonly T[],
  keyFor: (value: T) => string,
): Record<string, readonly T[]> {
  const groups: Record<string, T[]> = {};
  for (const value of values) {
    const key = keyFor(value);
    groups[key] = [...(groups[key] ?? []), value];
  }
  return groups;
}

function normalizePercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function currentStageLabel(stages: readonly TaskStage[]): string {
  return (
    stages.find((stage) => stage.state === "current")?.label ?? "无当前阶段"
  );
}

function stageStateLabel(state: TaskStageState): string {
  if (state === "complete") {
    return "已完成";
  }
  if (state === "current") {
    return "当前";
  }
  if (state === "failed") {
    return "失败";
  }
  return "待处理";
}

function stageIcon(state: TaskStageState): string {
  if (state === "complete") {
    return "✓";
  }
  if (state === "current") {
    return "●";
  }
  if (state === "failed") {
    return "×";
  }
  return "○";
}

function renderPermissionPageState(action?: unknown): RenderedUi {
  const safeAction = action === "contactAdmin" ? "联系管理员" : "切换上下文";
  return {
    html: `<div class="ui-page-state" role="group" data-kind="permission" data-tone="danger" aria-label="权限不足">
  <h2>权限不足</h2>
  <p>你没有访问此内容所需的权限。请切换上下文或联系管理员。</p>
  <button type="button">${safeAction}</button>
</div>`,
  };
}

function renderPageStateCounts(value: unknown): string {
  if (!isRecord(value)) {
    return "";
  }
  const succeeded = safeCount(safeProperty(value, "succeeded"));
  const failed = safeCount(safeProperty(value, "failed"));
  const impact = safeOptionalString(safeProperty(value, "impact")) ?? "";
  return `<dl><dt>成功</dt><dd>${succeeded}</dd><dt>失败</dt><dd>${failed}</dd><dt>影响</dt><dd>${text(impact)}</dd></dl>`;
}

function renderPageStateCapabilities(value: unknown): string {
  if (!isRecord(value)) {
    return "";
  }
  const available = safeStringList(safeProperty(value, "available"));
  const unavailable = safeStringList(safeProperty(value, "unavailable"));
  return `<dl><dt>可用能力</dt><dd>${text(available.join("、") || "无")}</dd><dt>不可用能力</dt><dd>${text(unavailable.join("、") || "无")}</dd></dl>`;
}

function targetRegistry(targetIds: readonly string[] | undefined): Set<string> {
  const counts = new Map<string, number>();
  if (!Array.isArray(targetIds)) {
    return new Set();
  }
  for (const id of targetIds) {
    if (!isSafeTargetId(id)) {
      continue;
    }
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const registry = new Set<string>();
  for (const [id, count] of counts.entries()) {
    if (count === 1) {
      registry.add(id);
    }
  }
  return registry;
}

function isSafeTargetId(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_-]*$/.test(value);
}

function isPageStateKind(value: unknown): value is PageStateKind {
  return typeof value === "string" && value in pageStateConfig;
}

function safeProperty<T = unknown>(value: unknown, key: string): T | undefined {
  try {
    if (!isRecord(value)) {
      return undefined;
    }
    return value[key] as T | undefined;
  } catch {
    return undefined;
  }
}

function safeString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function safeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function safeStringList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function safeCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    return 0;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-|-$/g, "") || "section"
  );
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replaceAll(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function text(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function attribute(value: string): string {
  return text(value).replaceAll('"', "&quot;");
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null) {
    return value;
  }
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return Object.freeze(value);
}

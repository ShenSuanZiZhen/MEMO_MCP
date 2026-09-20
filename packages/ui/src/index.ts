export const packageLayer = "ui" as const;

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
  tone: {
    neutral: "ui-tone-neutral",
    info: "ui-tone-info",
    success: "ui-tone-success",
    warning: "ui-tone-warning",
    danger: "ui-tone-danger",
    paused: "ui-tone-paused",
    archived: "ui-tone-archived",
  },
  spacing: {
    compact: "ui-space-compact",
    regular: "ui-space-regular",
    spacious: "ui-space-spacious",
  },
  focusRing: "ui-focus-ring",
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
  return {
    html: `<span class="ui-status-tag" data-tone="${config.tone}" role="status" aria-label="${attribute(
      `${label}${detail}`,
    )}"><span aria-hidden="true">${text(config.icon)}</span><span>${text(
      label,
    )}</span>${props.detail ? `<span>${text(detail)}</span>` : ""}</span>`,
  };
}

export type FieldKind = "text" | "textarea" | "select" | "secret" | "json";

export interface FormFieldProps {
  readonly id: string;
  readonly label: string;
  readonly kind?: FieldKind;
  readonly value?: string;
  readonly required?: boolean;
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
  ].filter(Boolean);
  const description = describedBy.length
    ? ` aria-describedby="${attribute(describedBy.join(" "))}"`
    : "";
  const common = `id="${attribute(props.id)}" name="${attribute(
    props.id,
  )}"${description}${
    props.required ? ' required aria-required="true"' : ""
  }${props.error ? ' aria-invalid="true"' : ""}`;
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
        : `<input ${common} type="${kind === "secret" ? "password" : "text"}" value="${attribute(
            kind === "secret" ? "" : (props.value ?? ""),
          )}" autocomplete="${kind === "secret" ? "off" : "on"}">`;
  const secretToggle =
    kind === "secret"
      ? `<button type="button" aria-pressed="false" aria-controls="${attribute(
          props.id,
        )}">显示/隐藏</button>`
      : "";
  return {
    html: `<div class="ui-form-field" data-invalid="${props.error ? "true" : "false"}">
  <label for="${attribute(props.id)}">${text(props.label)}${
    props.required ? ' <span aria-label="必填">*</span>' : ""
  }</label>
  ${props.helpText ? `<p id="${helpId}" class="ui-help">${text(props.helpText)}</p>` : ""}
  <div class="ui-control">${control}${secretToggle}</div>
  ${
    props.error
      ? `<p id="${errorId}" class="ui-error" role="alert">${text(props.error)}${
          props.errorExample ? ` 示例：${text(props.errorExample)}` : ""
        }</p>`
      : ""
  }
</div>`,
  };
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
  return {
    html: `<section class="ui-effective-result" aria-labelledby="effective-result-heading">
  <h2 id="effective-result-heading">Effective Result</h2>
  ${Object.entries(resultGroupLabels)
    .map(([key, label]) => {
      const items = props.groups[key as ResultGroup] ?? [];
      return `<section aria-labelledby="effective-${key}">
    <h3 id="effective-${key}">${label}</h3>
    ${
      items.length === 0
        ? '<p class="ui-muted">暂无结果</p>'
        : `<ul>${items
            .map(
              (item) =>
                `<li data-result-id="${attribute(item.id)}"${
                  item.changed ? ' data-changed="true"' : ""
                }><a href="#${attribute(item.sourceId)}">${text(
                  item.label,
                )}</a><p>${text(item.summary)}</p></li>`,
            )
            .join("")}</ul>`
    }
  </section>`;
    })
    .join("")}
</section>`,
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
  readonly issues: readonly Issue[];
}

const issueSeverityLabel = deepFreeze({
  blocking: "阻断",
  warning: "警告",
  info: "提示",
} satisfies Record<IssueSeverity, string>);

export function renderIssuePanel(props: IssuePanelProps): RenderedUi {
  const blocking = props.issues.filter(
    (issue) => issue.severity === "blocking",
  );
  const warnings = props.issues.filter((issue) => issue.severity === "warning");
  const grouped = groupBy(props.issues, (issue) => issue.step);
  return {
    html: `<section class="ui-issue-panel" aria-labelledby="issue-panel-heading">
  <h2 id="issue-panel-heading">${blocking.length > 0 ? "阻断" : "问题"} ${blocking.length} / 警告 ${warnings.length}</h2>
  ${Object.entries(grouped)
    .map(
      ([step, issues]) => `<section aria-labelledby="issue-step-${slug(step)}">
    <h3 id="issue-step-${slug(step)}">${text(step)}</h3>
    <ul>${issues
      .map(
        (
          issue,
        ) => `<li id="${attribute(issue.id)}" data-severity="${issue.severity}">
      ${
        renderStatusTag({
          kind: issue.severity === "blocking" ? "blocked" : "actionRequired",
          label: issueSeverityLabel[issue.severity],
        }).html
      }
      <h4>${text(issue.title)}</h4>
      <p><strong>原因：</strong>${text(issue.reason)}</p>
      <p><strong>影响：</strong>${text(issue.impact)}</p>
      <p><strong>修复建议：</strong>${text(issue.recommendation)}</p>
      <div>${issue.actions
        .map(
          (action) =>
            `<a class="ui-button" href="#${attribute(action.targetId)}">前往修改：${text(
              action.label,
            )}</a>`,
        )
        .join("")}</div>
    </li>`,
      )
      .join("")}</ul>
  </section>`,
    )
    .join("")}
</section>`,
  };
}

export type TaskStageState = "complete" | "current" | "pending" | "failed";

export interface TaskStage {
  readonly label: string;
  readonly state: TaskStageState;
}

export interface TaskProgressProps {
  readonly label: string;
  readonly percent: number;
  readonly stages: readonly TaskStage[];
  readonly detail: string;
  readonly canRunInBackground?: boolean;
  readonly logTargetId?: string;
}

export function renderTaskProgress(props: TaskProgressProps): RenderedUi {
  const percent = Math.max(0, Math.min(100, Math.round(props.percent)));
  return {
    html: `<section class="ui-task-progress" aria-labelledby="task-progress-heading">
  <div class="ui-progress-header">
    <h2 id="task-progress-heading">${text(props.label)}</h2>
    <span>${percent}%</span>
  </div>
  <div role="progressbar" aria-label="${attribute(props.label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"></div>
  <ol>${props.stages
    .map(
      (stage) =>
        `<li data-state="${stage.state}"><span aria-hidden="true">${stageIcon(
          stage.state,
        )}</span><span>${text(stage.label)}</span></li>`,
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
</section>`,
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

export interface PageStateProps {
  readonly id?: string;
  readonly kind: PageStateKind;
  readonly title: string;
  readonly description: string;
  readonly primaryAction?: string;
  readonly details?: string;
}

const pageStateConfig = deepFreeze({
  empty: { tone: "neutral", defaultAction: "创建或了解流程" },
  filteredEmpty: { tone: "neutral", defaultAction: "清除筛选" },
  loading: { tone: "info", defaultAction: "" },
  shortTask: { tone: "info", defaultAction: "取消" },
  longTask: { tone: "info", defaultAction: "在后台继续" },
  success: { tone: "success", defaultAction: "进入下一个核心动作" },
  partial: { tone: "warning", defaultAction: "修复失败项或确认排除" },
  retryable: { tone: "warning", defaultAction: "重试" },
  nonretryable: { tone: "danger", defaultAction: "替换、返回或联系支持" },
  permission: { tone: "danger", defaultAction: "切换项目或联系管理员" },
  dataChanged: { tone: "warning", defaultAction: "刷新、比较或创建新版本" },
  degraded: { tone: "warning", defaultAction: "查看告警或暂停" },
} satisfies Record<
  PageStateKind,
  { readonly tone: UiTone; readonly defaultAction: string }
>);

export function renderPageState(props: PageStateProps): RenderedUi {
  const config = pageStateConfig[props.kind];
  const action = props.primaryAction ?? config.defaultAction;
  const headingId = props.id ?? `page-state-${props.kind}`;
  return {
    html: `<section class="ui-page-state" data-kind="${props.kind}" data-tone="${config.tone}" aria-labelledby="${attribute(headingId)}">
  <h2 id="${attribute(headingId)}">${text(props.title)}</h2>
  <p>${text(props.description)}</p>
  ${props.details ? `<p>${text(props.details)}</p>` : ""}
  ${action ? `<button type="button">${text(action)}</button>` : ""}
</section>`,
  };
}

export interface UiStory {
  readonly title: string;
  render(): string;
}

export const uiStoryMatrix = deepFreeze([
  story("StatusTag/AllStates", () =>
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
    ]
      .map((kind) => renderStatusTag({ kind: kind as StatusKind }).html)
      .join(""),
  ),
  story("FormField/ErrorAndSecret", () =>
    [
      renderFormField({
        id: "service-name",
        label: "服务名称",
        required: true,
        helpText: "用于发布后的服务列表。",
        error: "必须使用 3-64 个字母、数字或连字符。",
        errorExample: "docs-search",
      }).html,
      renderFormField({
        id: "api-secret",
        label: "API Secret",
        kind: "secret",
        helpText: "保存后不会回显。",
      }).html,
    ].join(""),
  ),
  story(
    "EffectiveResult/FullGroups",
    () =>
      renderEffectiveResultPanel({
        groups: {
          data: [result("source", "文档数据", "2 个来源", "source-config")],
          tools: [
            result("search", "Search Tool", "允许引用检索", "tool-config"),
          ],
          resources: [
            result("resource", "索引资源", "向量索引", "resource-config"),
          ],
          prompts: [
            result("prompt", "问答提示", "含引用要求", "prompt-config"),
          ],
          outputs: [
            result("output", "结构化答案", "JSON 输出", "output-config"),
          ],
          access: [result("access", "项目成员", "只读访问", "access-config")],
          notProvided: [result("none", "原文下载", "不会提供", "risk-config")],
          risks: [result("risk", "生产凭证", "需要确认", "risk-config", true)],
        },
      }).html,
  ),
  story(
    "IssuePanel/BlockingAndWarning",
    () =>
      renderIssuePanel({
        issues: [
          issue("missing-metadata", "步骤 3 · 模块", "blocking"),
          issue("large-file", "步骤 2 · 数据", "warning"),
        ],
      }).html,
  ),
  story(
    "TaskProgress/LongRunning",
    () =>
      renderTaskProgress({
        label: "建立索引",
        percent: 72,
        stages: [
          { label: "上传", state: "complete" },
          { label: "扫描", state: "complete" },
          { label: "解析", state: "complete" },
          { label: "切块", state: "complete" },
          { label: "索引", state: "current" },
          { label: "验证", state: "pending" },
        ],
        detail: "已处理 35 / 48 个段落，预计还需约 20 秒",
        canRunInBackground: true,
        logTargetId: "task-log",
      }).html,
  ),
  story("PageState/StateMatrix", () =>
    (Object.keys(pageStateConfig) as PageStateKind[])
      .map((kind) =>
        renderPageState({
          kind,
          title: `状态：${kind}`,
          description: "保留导航并说明下一步。",
        }),
      )
      .map((rendered) => rendered.html)
      .join(""),
  ),
]);

export function renderUiShowcase(): RenderedUi {
  return {
    html: `<!doctype html><html lang="zh-CN"><head><title>WP-14B UI Showcase</title></head><body><main id="main-content"><h1>WP-14B UI Showcase</h1>${uiStoryMatrix
      .map(
        (item) =>
          `<section aria-labelledby="${attribute(slug(item.title))}"><h2 id="${attribute(
            slug(item.title),
          )}">${text(item.title)}</h2>${item.render()}</section>`,
      )
      .join("")}</main></body></html>`,
  };
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
        : "文件较大，处理时间可能延长",
    reason:
      severity === "blocking"
        ? "引用验证需要元数据能力。"
        : "上传文件超过常规处理大小。",
    impact:
      severity === "blocking"
        ? "引用验证将无法确定引用版本。"
        : "后台任务可能持续更久。",
    recommendation:
      severity === "blocking"
        ? "补齐依赖模块后继续。"
        : "保留输入并等待后台处理。",
    actions: [{ label: "查看模块", targetId: "module-config" }],
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

function slug(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
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

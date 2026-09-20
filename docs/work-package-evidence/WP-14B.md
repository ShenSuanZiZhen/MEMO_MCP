---
work_package: WP-14B
status: BLOCKED
baseline: "51f3f2a097b4bea052e742da1b2e483944d279f3; existing dirty worktree included prior package changes"
completed_at: "2026-09-20T04:27:16Z"
gate: design
depends_on:
  - WP-14A
blocker_owner:
  - authz
  - control-api
  - module-sdk
---

# WP-14B 完成证据

## 状态

WP-14B 表单、状态与反馈组件已经完成实现和包内验证，但工作包要求的 `pnpm verify:affected` 尚未通过，因此本 evidence 保持 `BLOCKED`，不声明 PASS，不填写 reviewer 或 reviewed_at。

`pnpm verify:affected` 在 format 阶段被 WP-14B 范围外文件阻断。按全局范围约束，本次未修改、格式化或还原以下文件：

- `packages/authz/src/index.ts`，blocker owner: authz。
- `packages/module-sdk/src/index.ts`，blocker owner: module-sdk。
- `tests/authz/rbac.test.ts`，blocker owner: authz。
- `tests/control-api/step-up-action.test.ts`，blocker owner: control-api。
- `tests/module-sdk/module-production-gate.test.ts`，blocker owner: module-sdk。

这些范围外格式问题由对应工作包负责人处理后，WP-14B 恢复时只需重新执行验收命令并更新 evidence；不需要继续修改 WP-14B 产品实现，除非恢复验证暴露 WP-14B 直接相关的新失败。

开始前确认：

- `./scripts/check-work-package-ready.sh WP-14B` 输出 `PASS dependency WP-14A`、`READY WP-14B`。
- `docs/work-package-evidence/WP-14A.md` front matter 为 `status: PASS`。
- 已阅读 `work-packages/00_全局开发约束.md`、`work-packages/WP-14B.md`、UI 手册第 6/8/9/13 节和 WP-14A evidence。

## 变更文件

- `packages/ui/package.json`: 增加固定版本测试专用 devDependencies：`axe-core@4.13.0`、`jsdom@30.1.0`、`@types/jsdom@30.0.0`。
- `packages/ui/src/index.ts`: 实现 WP-14B UI primitives、状态矩阵、story registry 和最小 showcase。
- `packages/ui/src/wp14b.stories.ts`: 提供 Storybook CSF 风格 story exports，不引入 Storybook runtime 依赖。
- `tests/ui/components.test.ts`: 增加组件 API、a11y 语义、axe 和视觉快照稳定性测试。
- `pnpm-lock.yaml`: 锁定 UI 测试依赖。
- `docs/work-package-evidence/WP-14B.md`: 本 evidence。

未实现业务页面、后端 handler、业务权限判断、数据库逻辑或 Secret 持久化。未执行 git reset、git checkout 或 git clean；未提交、未推送。

## 组件 API

Public entry: `@modular-mcp/ui`。

Implemented APIs:

- `renderStatusTag(props)`: 覆盖 draft、processing、actionRequired、success、running、paused、failed、blocked、archived。每个状态同时包含文字、图标和语义 tone，不只依赖颜色。
- `renderFormField(props)`: 永久可见 label、required 标记、help text、field error、`aria-describedby`、`aria-invalid`、错误示例、Secret 显示/隐藏按钮。Secret value 不回显。
- `renderEffectiveResultPanel(props)`: 固定分组：数据、Tools、Resources、Prompts、输出、访问、不会提供、风险与问题；每项链接回来源配置并支持 changed 标记。
- `renderIssuePanel(props)`: 按步骤分组 issue，包含级别、标题、原因、影响、修复建议和“前往修改”。不提供“忽略所有问题”。
- `renderTaskProgress(props)`: 含阶段列表、数值 progressbar、`aria-live="polite"` 更新和后台继续/日志入口，不使用 autofocus，不抢焦点。
- `renderPageState(props)`: 覆盖 empty、filteredEmpty、loading、shortTask、longTask、success、partial、retryable、nonretryable、permission、dataChanged、degraded。
- `renderUiShowcase()`: 最小 Web showcase，聚合全部状态矩阵。
- `uiSemanticTokens`: 只暴露语义 token 名称，不硬编码品牌色。
- `uiStoryMatrix`: 冻结的组件状态矩阵 story registry。

## Storybook 和 Showcase

Story paths:

- `packages/ui/src/wp14b.stories.ts`

Exports:

- `StatusTagAllStates`
- `FormFieldErrorAndSecret`
- `EffectiveResultFullGroups`
- `IssuePanelBlockingAndWarning`
- `TaskProgressLongRunning`
- `PageStateStateMatrix`
- `Showcase`

仓库当前没有完整 Storybook runtime 配置；本包提供 CSF 风格 story 对象和 `render()` 输出，后续 Storybook runtime 接入时可直接消费。包内测试验证这些 story exports 都能渲染真实 HTML，并覆盖组件状态矩阵。

## A11y 规则

已验证规则：

- 表单 label 永远可见，不以 placeholder 替代。
- Help/error 通过 `aria-describedby` 关联字段。
- 字段错误使用 `role="alert"`，并包含修复示例。
- Secret 字段保存值不回显，显示/隐藏按钮使用 `aria-pressed` 和 `aria-controls`。
- 状态标签包含文字、图标和 `role="status"` / `aria-label`。
- Task progress 使用 `role="progressbar"`、数值百分比、阶段文字和 polite live region。
- 自动保存/后台刷新类状态不使用 autofocus，不抢焦点。
- Effective Result 和 Issue Panel 使用 heading/section/list 结构。
- axe 在 `renderUiShowcase()` 真实 HTML 上执行；除 jsdom 缺少 canvas 而禁用 `color-contrast` 外，violations 为 0。

## 禁止用法

- 组件不得决定业务权限或绕过服务端 capability。
- StatusTag 和 PageState 不得只靠颜色传达状态。
- FormField 不得用 placeholder 代替 label。
- Secret 字段不得在保存后回显值。
- IssuePanel 不得提供“忽略所有问题”。
- TaskProgress 不得自动抢焦点。
- UI package 源码不得导入 jsdom、axe-core 或 Storybook runtime；这些只用于测试或后续外部工具。

## 验证记录

| 命令                                                                                                                                        | 结果 | 关键输出                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `./scripts/check-work-package-ready.sh WP-14B`                                                                                              | PASS | `PASS dependency WP-14A`, `READY WP-14B`                                                                                                                                                                                                    |
| `./scripts/validate-work-packages.sh`                                                                                                       | PASS | `PASS  71 work packages and dependency references are structurally valid`                                                                                                                                                                   |
| `pnpm vitest run tests/ui`                                                                                                                  | PASS | 1 file, 11 tests passed                                                                                                                                                                                                                     |
| `pnpm --filter @modular-mcp/ui build`                                                                                                       | PASS | `tsc --build tsconfig.json` completed                                                                                                                                                                                                       |
| `pnpm exec prettier --check packages/ui/src/index.ts packages/ui/src/wp14b.stories.ts tests/ui/components.test.ts packages/ui/package.json` | PASS | All matched files use Prettier code style                                                                                                                                                                                                   |
| `pnpm verify:affected`                                                                                                                      | FAIL | format stopped on five WP-14B range-out files: `packages/authz/src/index.ts`, `packages/module-sdk/src/index.ts`, `tests/authz/rbac.test.ts`, `tests/control-api/step-up-action.test.ts`, `tests/module-sdk/module-production-gate.test.ts` |
| `pnpm dependency:scan`                                                                                                                      | PASS | Workspace manifests and lockfile passed pinned dependency policy                                                                                                                                                                            |
| `pnpm secret:scan`                                                                                                                          | PASS | No unallowlisted secret patterns found                                                                                                                                                                                                      |
| `git diff --check`                                                                                                                          | PASS | No whitespace errors                                                                                                                                                                                                                        |
| `git status --short`                                                                                                                        | PASS | Command completed; worktree remains dirty with WP-14B files plus existing off-scope package changes                                                                                                                                         |

## 验收标准核对

- [x] StatusTag 覆盖设计手册状态类别，且不只靠颜色。
- [x] 表单字段具备 label/help/error/required/Secret toggle/`aria-describedby`。
- [x] Effective Result Panel 固定八组并可定位来源配置。
- [x] Issue Panel 按步骤分组，包含原因/影响/修复建议/前往修改，无“忽略所有问题”。
- [x] TaskProgress 具备阶段、数值、live region，不抢焦点。
- [x] PageState 覆盖 empty/loading/partial/retryable/nonretryable/permission/degraded 等状态。
- [x] Storybook CSF 风格 stories 覆盖状态矩阵。
- [x] 组件 axe 检查通过，violations 为 0。
- [x] 视觉快照稳定性用 showcase SHA-256 覆盖。
- [x] `packages/ui` build 通过。
- [ ] `pnpm verify:affected` 通过。当前被范围外格式问题阻断。
- [ ] 人工 design gate 复审通过。

## 全局约束核对

- [x] 范围保持在 `packages/ui`、组件测试、测试依赖元数据和 evidence。
- [x] 未实现业务页面。
- [x] 未修改 contracts、database、authz、module-sdk 或 control-api 范围外文件。
- [x] 未让组件改变业务权限。
- [x] 未硬编码品牌色；状态使用语义 tone token。
- [x] 未新增生产 Secret、真实租户数据或外部写操作。
- [x] 未执行 git reset、git checkout 或 git clean。
- [x] 未提交、未推送。

## 风险和遗留项

- `pnpm verify:affected` 当前被范围外格式问题阻断；WP-14B 不应越界格式化 authz/control-api/module-sdk 文件。
- 仓库尚无完整 Storybook runtime 配置；WP-14B 提供 CSF 风格 story exports 和状态矩阵，后续若启用 Storybook runtime 可直接挂载。
- 组件以 framework-neutral HTML renderer 交付；后续业务页面或具体前端框架接入时需要继续执行浏览器级视觉与交互验证。

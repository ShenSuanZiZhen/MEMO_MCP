---
work_package: WP-14B
status: IMPLEMENTED_AWAITING_REVIEW
baseline: "51f3f2a097b4bea052e742da1b2e483944d279f3; existing dirty worktree included prior package changes"
completed_at: "2026-09-20T04:27:16Z"
updated_at: "2026-09-21T03:05:30Z"
gate: design
depends_on:
  - WP-14A
---

# WP-14B 完成证据

## 状态

WP-14B design gate 第四轮最终最小整改已完成，当前状态保持 `IMPLEMENTED_AWAITING_REVIEW`，等待人工 design gate 复审。不得视为 PASS；本 evidence 未填写 reviewer 或 reviewed_at。

本轮首先复核此前范围外格式阻断，`packages/authz/src/index.ts`、`packages/module-sdk/src/index.ts`、`tests/authz/rbac.test.ts`、`tests/control-api/step-up-action.test.ts` 均已恢复 Prettier PASS。`tests/module-sdk/module-production-gate.test.ts` 的 Ed25519 失败确认为测试 mutation 非确定性：随机合法 Base64URL 签名不一定包含 `-`，旧的 `replaceAll("-", "+")` 可能是 no-op，导致 invalid sample 实际仍为合法签名。已按授权最小修改该测试，使用前导 `+` 生成稳定非法 Base64URL 字符样本，并为每个 mutation 增加不得等于原始合法签名的保护断言。`packages/module-sdk/src/index.ts` 和 Ed25519 产品 decoder/verifier 未修改。

2026-09-21 恢复验收：WP-07A multipart 时间确定性范围外阻断已由对应工作完成，`tests/control-api/upload-multipart.test.ts` 已单独复跑通过，`pnpm verify:affected` 已恢复 PASS。本次恢复只更新 evidence，未继续修改 WP-14B 产品实现。

开始前确认：

- `./scripts/check-work-package-ready.sh WP-14B` 输出 `PASS dependency WP-14A`、`READY WP-14B`。
- 已阅读 `work-packages/00_全局开发约束.md`、`work-packages/WP-14B.md`、UI 手册第 6/8/9/13 节和 WP-14A evidence。

## 变更文件

- `tests/module-sdk/module-production-gate.test.ts`: 修复 Ed25519 非确定性 invalid mutation，仅改测试。
- `packages/ui/package.json`: 增加固定版本 Storybook、axe/jsdom、Playwright、pngjs dev dependencies；增加 `storybook`、`build:storybook`、`install:visual-browser`、清理后生产 build 脚本；导出 `./styles.css`。
- `packages/ui/tsconfig.json`: 生产 build 使用 DOM lib，并排除 `src/**/*.stories.ts`。
- `packages/ui/scripts/clean-dist.mjs`: build 前清理 dist，避免 Storybook/test 残留进入生产扫描。
- `packages/ui/scripts/copy-assets.mjs`: build 后复制生产 CSS。
- `packages/ui/src/index.ts`: 实现 UI primitives、可重复绑定 Secret toggle、多实例安全 ID、HTML/attribute escaping、状态语义和 showcase。
- `packages/ui/src/styles.css`: 新增生产 semantic CSS，使用 CSS custom properties、focus-visible、disabled/hover/focus/reduced-motion。
- `packages/ui/src/wp14b.stories.ts`: 改为真实 Storybook HTML CSF `Meta`/`StoryObj` stories。
- `packages/ui/.storybook/main.ts`、`packages/ui/.storybook/preview.ts`: 最小可构建 Storybook HTML 配置，启用 a11y addon。
- `tests/ui/components.test.ts`: 增加 API、转义、多实例、Secret toggle、permission 泄漏、IssuePanel target gate、axe、managed Chromium 真实浏览器、PNG 视觉回归、生产代码浏览器加载和生产依赖边界相关测试。
- `tests/ui/page-state-props.typecheck.ts`、`tests/ui/tsconfig.page-state-props.json`: 编译期负例，锁定 `PageStateProps` discriminated union。
- `tests/ui/visual-baselines/darwin-arm64/*.png`: macOS Apple Silicon 真实 PNG baseline，覆盖 1280/1024 showcase、FormField error/secret、IssuePanel blocking、TaskProgress running、PageState matrix。
- `tests/ui/visual-baselines/linux-x64/*.png`: Linux x64 真实 PNG baseline，由 linux/amd64 clean container 在 Playwright-managed Chromium v1243 环境生成。
- `.github/workflows/ci.yml`: 为 GitHub Actions 增加显式 `pnpm --filter @modular-mcp/ui exec playwright install --with-deps chromium`，避免假定 `pnpm install` 下载浏览器。
- `pnpm-lock.yaml`: 锁定新增 dev/test/story 依赖。
- `docs/work-package-evidence/WP-14B.md`: 本 evidence。

未实现业务页面、后端 handler、业务权限判断、数据库逻辑或 Secret 持久化。未执行 git reset、git checkout 或 git clean；未提交、未推送。

## 组件 API

Public entry: `@modular-mcp/ui`。

Runtime exports limited to production surface:

- `packageLayer`
- `uiStylesHref`
- `uiSemanticTokens`
- `uiStoryMatrix`
- `renderStatusTag`
- `renderFormField`
- `renderEffectiveResultPanel`
- `renderIssuePanel`
- `renderTaskProgress`
- `renderPageState`
- `renderUiShowcase`
- `attachUiBehaviors`

Key behavior:

- StatusTag covers draft、processing、actionRequired、success、running、paused、failed、blocked、archived. Static tags do not become live regions by default; callers opt in with `announce`.
- FormField provides visible label、required、help、error、`aria-describedby`、`aria-invalid`、select、textarea、JSON and Secret variants. Saved Secret values are never rendered.
- `attachUiBehaviors(root)` is framework-neutral and repeat-safe. Secret toggle supports mouse、Enter、Space, switches `password`/`text`, syncs `aria-pressed` and accessible button text, and keeps focus on the trigger without copying the Secret into attributes or logs.
- EffectiveResult、IssuePanel、TaskProgress、PageState require stable IDs/prefixes where needed, escape id/for/href fragment/aria/data attributes, and support multiple same-kind instances without duplicate IDs.
- IssuePanel maps blocking/warning/info to correct readable severity, has no “ignore all”, and only renders action links for explicitly declared, unique and safe `targetIds`; undeclared/unknown/empty/duplicate/malicious targets render as disabled notes.
- TaskProgress normalizes invalid percent values, avoids `aria-valuenow="NaN"`, supplies `aria-valuetext`, readable stage states, and does not steal focus.
- PageState covers empty、filteredEmpty、loading、shortTask、longTask、success、partial、retryable、nonretryable、permission、dataChanged、degraded. `PageStateProps` is a discriminated union: partial requires `counts`, degraded requires `capabilities`, and permission accepts only the internal safe action enum. Runtime rendering also fails closed; permission ignores caller title、description、details、counts、capabilities、primaryAction and resource IDs.

## Permission PageState 信息隔离

Compile-time gate:

- `tests/ui/page-state-props.typecheck.ts` is checked by `pnpm exec tsc --noEmit --project tests/ui/tsconfig.page-state-props.json`.
- `@ts-expect-error` negative cases cover: partial missing `counts`, degraded missing `capabilities`, and permission carrying `details`、`counts`、`capabilities`.

Runtime gate:

- Permission output is generated from fixed internal content: heading `权限不足`, description `你没有访问此内容所需的权限。请切换上下文或联系管理员。`, and safe actions `切换上下文` / `联系管理员`.
- Permission container no longer uses fixed `id="permission-state-heading"` or `aria-labelledby="permission-state-heading"`; it uses fixed safe `aria-label="权限不足"` on the group and keeps visible `<h2>权限不足</h2>` without a DOM id. No caller-provided id or module-level counter is used.
- Permission does not consume caller `title`、`description`、`details`、`counts`、`counts.impact`、`capabilities.available`、`capabilities.unavailable`、`primaryAction` or `id`.
- Malformed `counts` values including `NaN`、`Infinity` and non-safe values are ignored in permission output.
- Getter and Proxy exceptions return the safe permission state without enumerating or leaking sensitive properties.
- Multi-instance probe after production build rendered two permission PageStates and reported `ids: []`, `duplicateCount: 0`, `containsSecret: false`.
- JSDOM axe and real browser axe both cover multiple permission PageStates, including malformed/downcast props; result: no violations.

Sentinel non-leak results, all PASS:

- `SECRET_TITLE_WORKSPACE_ALPHA`: absent from HTML/attributes/ARIA/data.
- `SECRET_DESCRIPTION_PROJECT_BRAVO`: absent from HTML/attributes/ARIA/data.
- `SECRET_DETAILS_ENV_CHARLIE`: absent from HTML/attributes/ARIA/data.
- `SECRET_PRIMARY_ACTION_DELTA`: absent from HTML/attributes/ARIA/data.
- `SECRET_COUNT_IMPACT_RESOURCE_ECHO`: absent from HTML/attributes/ARIA/data.
- `SECRET_AVAILABLE_CAPABILITY_FOXTROT`: absent from HTML/attributes/ARIA/data.
- `SECRET_UNAVAILABLE_CAPABILITY_GOLF`: absent from HTML/attributes/ARIA/data.
- `SECRET_ID_HOTEL`: absent from HTML/attributes/ARIA/data.
- `SECRET_PROXY_*`: absent from output when getters/Proxy traps throw.

## IssuePanel Target Gate

Issue actions are executable only when their `targetId` is present exactly once in explicit `targetIds` and matches the safe target-id syntax. Results:

- Known target `module-config`: renders `<a href="#module-config" data-target-valid="true">`.
- Unknown target: renders disabled note with `data-target-valid="false"` and no executable link.
- Omitted `targetIds`: fail-closed disabled note, no executable link.
- Empty target: fail-closed disabled note, no executable link.
- Duplicate target declaration: duplicate target is not trusted; disabled note, no executable link.
- Malicious target string containing attribute syntax: no executable link and no injected attribute.

## Storybook

Real Storybook configuration:

- `packages/ui/.storybook/main.ts`: `@storybook/html-vite` framework and `@storybook/addon-a11y`.
- `packages/ui/.storybook/preview.ts`: imports the same production `src/styles.css` used by package consumers and leaves browser color contrast checks enabled.
- `packages/ui/src/wp14b.stories.ts`: real CSF `Meta` / `StoryObj` definitions.

Story coverage:

- `StatusTagAllStates`
- `FormFieldMatrix`
- `EffectiveResultMatrix`
- `IssuePanelMatrix`
- `TaskProgressMatrix`
- `PageStateMatrix`
- `Showcase`
- `IndividualStates`

Static Storybook build command:

- `pnpm --filter @modular-mcp/ui build:storybook`
- Output: `/tmp/modular-mcp-wp14b-storybook`
- Result: PASS, Storybook v10.6.0 completed successfully. Vite reported large-chunk warnings for Storybook/axe assets only; static build succeeded.

## Styling

Production CSS entry:

- Package export: `@modular-mcp/ui/styles.css`
- Source: `packages/ui/src/styles.css`
- Build output: `packages/ui/dist/styles.css`

CSS uses semantic custom properties for surface/text/muted/border/focus、neutral/info/success/warning/danger/paused/archived、spacing/radius/control height and stateful interactions. Components reference semantic variables rather than product brand tokens. `:focus-visible`, disabled, hover/focus/selected-style interactions, and `prefers-reduced-motion: reduce` are implemented.

## A11y

JSDOM axe:

- Command: `pnpm vitest run tests/ui`
- Scope: real rendered HTML from production renderers.
- Note: JSDOM disables `color-contrast` only because it lacks canvas-backed contrast support.
- Result: PASS, no remaining violations in the checked DOM.

Real browser axe:

- Command: `pnpm vitest run tests/ui`
- Browser: Playwright-managed Chromium v1243 / Chrome Headless Shell 153.0.8010.12, installed by `pnpm --filter @modular-mcp/ui install:visual-browser`.
- Playwright version: 1.63.0.
- Viewport: 1280 x 1000 for browser axe.
- Device scale factor: 1.
- Color contrast: enabled.
- Result: PASS, violations `[]`.

Additional a11y and security tests:

- Static StatusTag does not create live regions by default.
- Changed EffectiveResult items show visible and screen-reader-readable `已变化`.
- Two same-kind component instances on one page have no duplicate IDs and pass axe.
- Malicious id/label/step/targetId/summary strings cannot inject attributes, script elements, or broken tags.
- Secret toggle mouse/Enter/Space and repeated binding pass; saved Secret test value is absent from serialized HTML.
- Real browser Secret toggle regression imports production `packages/ui/dist/index.js` as an ESM module in the Playwright page after `pnpm --filter @modular-mcp/ui build`; no test-local `toggleSecretForBrowser()`、`cssEscapeForBrowser()` or private helper reimplementation remains.
- Real browser Secret toggle regression verifies Enter toggles exactly once, Space toggles exactly once, mouse click toggles exactly once, `input.type` / `aria-pressed` / button text stay synchronized, focus remains on the toggle, multiple SecretField instances do not affect each other, repeated `attachUiBehaviors()` does not duplicate listeners, and ids containing quotes/colons exercise the production CSS escape path.

## Visual Regression

HTML SHA-256 is retained only as a structure snapshot, not as visual evidence.

True browser PNG regression runs in `pnpm vitest run tests/ui` using Playwright-managed Chromium v1243 / Chrome Headless Shell 153.0.8010.12, offline deterministic data, fixed viewport widths, reduced motion, and device scale factor 1. Pixel comparison threshold is <= 500 changed pixels per case to avoid subpixel/antialiasing noise while still detecting layout or clipping changes.

Canonical visual environments:

- Browser install command for local tests: `pnpm --filter @modular-mcp/ui install:visual-browser`.
- Browser install command for GitHub Actions / Ubuntu: `pnpm --filter @modular-mcp/ui exec playwright install --with-deps chromium`.
- Playwright version: 1.63.0.
- Browser: Playwright-managed Chromium v1243 / Chrome Headless Shell 153.0.8010.12. Tests use the managed browser; no `channel: "chrome"` or system Google Chrome fallback remains.
- Viewports: 1280 x 1200, 1024 x 1200, component-specific 1280 x 700, and browser axe 1280 x 1000.
- Device scale factor: 1.
- Font: Storybook-bundled `Nunito Sans Regular` (`storybook/assets/browser/nunito-sans-regular.woff2`), injected as a data URL for visual tests; SHA-256 `49fe05ec477bb0f2f815a7494c933070606b5c68e84f96e11374e07c59a64d61`. Nunito Sans is distributed under the SIL Open Font License via the pinned Storybook package.
- Darwin local key: `darwin-arm64`; actual probe output `platform: darwin`, `arch: arm64`, `browserVersion: 153.0.8010.12`, font SHA-256 `49fe05ec477bb0f2f815a7494c933070606b5c68e84f96e11374e07c59a64d61`; baseline directory `tests/ui/visual-baselines/darwin-arm64`.
- Linux CI key: `linux-x64`; generated in a linux/amd64 clean container with Playwright-managed Chromium v1243 / browser version `153.0.8010.12` and the same pinned test font SHA-256; baseline directory `tests/ui/visual-baselines/linux-x64`.
- Unknown platform/arch or missing baseline fails with a clear error. `UPDATE_UI_BASELINES=1` is forbidden when `CI=true`.

PNG baselines:

- `tests/ui/visual-baselines/darwin-arm64/showcase-1280.png` and `tests/ui/visual-baselines/linux-x64/showcase-1280.png`.
- `tests/ui/visual-baselines/darwin-arm64/showcase-1024.png` and `tests/ui/visual-baselines/linux-x64/showcase-1024.png`.
- `tests/ui/visual-baselines/<platform-arch>/form-field-error-secret.png`.
- `tests/ui/visual-baselines/<platform-arch>/issue-panel-blocking.png`.
- `tests/ui/visual-baselines/<platform-arch>/task-progress-running.png`.
- `tests/ui/visual-baselines/<platform-arch>/page-state-matrix.png`.

Result: PASS. Screenshots verified no horizontal overflow, key controls remain visible, focus styles are covered through CSS and interactive tests, and status expression is not color-only. Fourth-round current test suite was executed 10 consecutive times; all 10 runs passed with `1 file, 28 tests` and PNG diffs within the frozen threshold.

## 生产依赖隔离

Build and scan:

- `pnpm --filter @modular-mcp/ui build` PASS.
- `rg -n 'jsdom|axe-core|storybook|playwright|node:' packages/ui/dist` produced no output.

Production dist contains only:

- `packages/ui/dist/index.js`
- `packages/ui/dist/index.d.ts`
- source maps / tsbuildinfo
- `packages/ui/dist/styles.css`

Storybook, jsdom, axe-core, Playwright and PNG tooling are dev/test/story-only and are not exported from `@modular-mcp/ui`.

## 验证记录

| 命令 | 结果 | 关键输出 |
| --- | --- | --- |
| `./scripts/check-work-package-ready.sh WP-14B` | PASS | `PASS dependency WP-14A`, `READY WP-14B` |
| `./scripts/validate-work-packages.sh` | PASS | `PASS 71 work packages and dependency references are structurally valid` |
| `pnpm vitest run tests/control-api/upload-multipart.test.ts` | PASS | `1 file, 4 tests`; confirms the WP-07A multipart determinism blocker is resolved |
| `pnpm --filter @modular-mcp/ui install:visual-browser` | PASS | `playwright install chromium` completed locally; managed Chromium already present |
| `pnpm vitest run tests/ui` | PASS | `1 file, 28 tests`; includes JSDOM axe, real browser axe, production `dist/index.js` Secret toggle test, permission multi-instance duplicate-id test, target gate checks and PNG visual regression |
| `pnpm --filter @modular-mcp/ui build` | PASS | cleaned dist, compiled production entry, copied CSS |
| `pnpm --filter @modular-mcp/ui build:storybook` | PASS | Storybook v10.6.0 static build to `/tmp/modular-mcp-wp14b-storybook` |
| `pnpm verify:affected` | PASS | latest 2026-09-21 run: `19 files, 278 tests`; format/lint/typecheck/unit/contract/build/dependency scan/secret scan all passed |
| `pnpm dependency:scan` | PASS | pinned dependency policy passed |
| `pnpm secret:scan` | PASS | no unallowlisted secret patterns found |
| `git diff --check` | PASS | no whitespace errors |
| `rg -n 'jsdom\|axe-core\|storybook\|playwright\|node:' packages/ui/dist` | PASS | no output |
| Duplicate permission PageState probe | PASS | rendered two permission PageStates from production dist: `ids: []`, `duplicateCount: 0`, `containsSecret: false` |
| Browser helper removal probe | PASS | `rg -n 'toggleSecretForBrowser\|cssEscapeForBrowser' tests/ui/components.test.ts` produced no output |
| Darwin visual environment probe | PASS | `platform: darwin`, `arch: arm64`, `browserVersion: 153.0.8010.12`, font SHA-256 `49fe05ec477bb0f2f815a7494c933070606b5c68e84f96e11374e07c59a64d61`; baseline directory `tests/ui/visual-baselines/darwin-arm64` |
| Linux UI/visual generation and regression in clean linux/amd64 container | PASS | `UPDATE_UI_BASELINES=1 pnpm vitest run tests/ui` generated `tests/ui/visual-baselines/linux-x64`; subsequent linux container run reported `tests/ui/components.test.ts (28 tests)` PASS against linux-x64 PNG baselines |
| Clean linux-x64 container: `pnpm install --frozen-lockfile` | PASS | lockfile and supply-chain policy passed in linux/amd64 container |
| Clean linux-x64 container: `pnpm --filter @modular-mcp/ui exec playwright install --with-deps chromium` | PASS | installed Ubuntu deps and Playwright Chromium v1243 / Chrome for Testing 153.0.8010.12 |
| Clean linux-x64 container: `pnpm test:unit` | FAIL, out of WP-14B scope | UI tests passed, but `tests/control-api/step-up-action.test.ts > allows only explicitly authorized roles...` exceeded its 5000ms timeout under emulated linux/amd64 Docker; no WP-14B product code was changed to mask this |
| Clean linux-x64 container: `pnpm verify:affected` | NOT REACHED | stopped after the out-of-scope `pnpm test:unit` timeout above |
| 10 consecutive `pnpm vitest run tests/ui` visual runs | PASS | 10/10 passed; each run reported `1 file, 28 tests` and PNG diffs within threshold |
| `git status --short` | PASS | command completed; worktree dirty only with intended WP-14B/evidence changes, CI install step, and authorized Ed25519 test fix |

## 验收标准核对

- [x] 真实 Storybook HTML config/build 已接入，stories 使用真实 CSF。
- [x] Storybook 覆盖 StatusTag、FormField、EffectiveResult、IssuePanel、TaskProgress、PageState 和 Showcase 矩阵。
- [x] 生产 semantic CSS 入口已提供，Storybook 与 package build 复用同一 CSS。
- [x] Secret toggle 具备真实 mouse/keyboard interaction，且 saved Secret 不回显。
- [x] Secret toggle 具备真实浏览器 Enter/Space 回归，多实例互不影响，重复绑定不重复触发。
- [x] 组件 ID、attribute escaping、多实例 duplicate-id 风险已测试。
- [x] Permission PageState 编译期和运行时均关闭式隔离调用方敏感字段。
- [x] IssuePanel 未声明、未知、重复、空或恶意 target 关闭式不可跳转。
- [x] StatusTag、EffectiveResult、TaskProgress、IssuePanel、PageState 无障碍语义按要求补齐。
- [x] JSDOM axe 与真实浏览器 axe 均通过；真实浏览器未禁用 color-contrast。
- [x] 真实 PNG 视觉回归覆盖 1280/1024 showcase 和关键组件状态，并使用 Playwright-managed Chromium 与固定测试字体。
- [x] Darwin local 与 Linux x64 CI baseline 分目录冻结，并在 GitHub Actions 中显式安装 Playwright Chromium。
- [x] 生产 dist 不包含 jsdom、axe-core、Storybook、Playwright 或 node-only imports。
- [x] `pnpm verify:affected` PASS。
- [x] dependency scan、secret scan、git diff check PASS。
- [ ] Native GitHub Actions linux-x64 full clean run after the new browser install step; local emulated linux/amd64 container proved UI/visual PASS but hit an out-of-scope control-api 5000ms timeout before `pnpm verify:affected`.
- [ ] 人工 design gate 复审通过。

## 全局约束核对

- [x] 范围保持在 `packages/ui`、Storybook、组件测试、测试依赖元数据、evidence、最小 CI browser install step，以及授权的 `tests/module-sdk/module-production-gate.test.ts` 最小测试修复。
- [x] 未修改 `packages/module-sdk/src/index.ts` 或 Ed25519 产品实现。
- [x] 未实现业务页面。
- [x] 未修改 contracts、database、authz、control-api handler 或业务权限逻辑。
- [x] 未让组件改变业务权限。
- [x] 未新增生产 Secret、真实租户数据或外部写操作。
- [x] 未执行 git reset、git checkout 或 git clean。
- [x] 未提交、未推送。

## 风险和遗留项

- Storybook/axe 浏览器构建存在大 chunk warning，限于 dev/story 输出，不进入生产 UI dist，不阻断 WP-14B。
- WP-07A multipart 时间确定性范围外阻断已解决，`tests/control-api/upload-multipart.test.ts` 和最新 `pnpm verify:affected` 均已通过。
- GitHub Actions 已增加 `playwright install --with-deps chromium`，但本地 linux/amd64 Docker under Apple Silicon 在全仓 `pnpm test:unit` 中稳定被范围外 `tests/control-api/step-up-action.test.ts` 5000ms 超时打断；WP-14B UI/visual tests 在同一容器中通过。该记录保留为非 WP-14B 环境风险，未声称 native GitHub Actions 已运行。
- WP-14B 交付 framework-neutral HTML primitives；后续业务页面接入时仍需在具体页面/框架中继续执行页面级键盘、屏幕阅读器和视觉验证。

---
work_package: WP-14A
status: PASS
baseline: "51f3f2a097b4bea052e742da1b2e483944d279f3; existing dirty worktree included prior WP-14A and other package changes"
completed_at: "2026-09-20T01:36:00Z"
updated_at: "2026-09-20T02:13:36Z"
gate: design
depends_on:
  - WP-01B
  - WP-03A
---

# WP-14A 完成证据

## 状态

WP-14A design gate 下一轮整改已完成实现和设计复核，不需要继续修改 WP-14A 产品代码。本 evidence 不声明 PASS，不填写 reviewer 或 reviewed_at。2026-09-20 最小整改只修复生产 Web 与测试工具隔离、路由策略运行时不可变两个阻断项，未扩大到业务页面、后端 handler、contracts 或数据库。

范围外格式阻断已经由对应负责人解决。WP-14A 已重新执行全部验收并通过，现等待人工 design gate 最终复审。本次恢复没有修改 WP-14A 产品实现，只复跑验证并更新本 evidence。

开始前确认：

- `docs/work-package-evidence/WP-01B.md` front matter 为 `status: PASS`，记录 runtime decoder 增量已通过 API gate。
- `./scripts/check-work-package-ready.sh WP-14A` 输出 `PASS dependency WP-01B`、`PASS dependency WP-03A`、`READY WP-14A`。

## 变更文件

- `apps/web/package.json`: 增加固定版本 DOM/axe 测试依赖。
- `apps/web/tsconfig.json`: 为最小 shell DOM 增加浏览器 DOM 类型库。
- `apps/web/src/index.ts`: 只导出生产 Web public API，不导出 jsdom/axe 测试 helper。
- `apps/web/src/api-client.ts`: 绑定 WP-01B 生成的 runtime decoders，显式校验 HTTP status、JSON Content-Type 和响应 body。
- `apps/web/src/cache.ts`: 增加租户缓存分层失效 API。
- `apps/web/src/session.ts`: 增加 session 快照冻结、非法 scope 关闭式拒绝和分层缓存清理。
- `apps/web/src/routes.ts`: 统一 route access 元数据和已冻结 capability 名称，并运行时冻结 route policy。
- `apps/web/src/shell.ts`: 增加关闭式 route gate、真实 URL 生成、有效 capability 叠加、平台后台关闭式隔离，并冻结 a11y baseline。
- `apps/web/src/shell-render.ts`: 提供生产可用 `renderShell()`、`attachShellFocusBehavior()`、`focusMainContent()`，只依赖标准 DOM 类型。
- `tests/web/api-client.test.ts`: 覆盖 URL、query allowlist、decoder 正负例、错误状态、非 JSON、空 body、additionalProperties 和脱敏失败。
- `tests/web/shell-session.test.ts`: 覆盖分层缓存、非法 scope、route gate、权限叠加、真实 URL、DOM/focus/axe baseline、生产导出边界和 route policy 篡改回归。
- `tests/web/shell-dom-helper.ts`: 测试专用 jsdom/axe runner，使用生产 `renderShell()` 生成的 HTML，不进入 apps/web public production entry。
- `pnpm-lock.yaml`: 锁定 `axe-core@4.13.0`、`jsdom@30.1.0`、`@types/jsdom@30.0.0`。
- `docs/work-package-evidence/WP-14A.md`: 本 evidence。

已删除生产源码中的 `apps/web/src/shell-dom.ts`。未修改 `packages/contracts`，未提交、未推送，未执行 reset/checkout/clean。

## Runtime Decoder 来源

WP-14A 只消费 WP-01B 已通过 API gate 的生成物：

- `@modular-mcp/contracts` 导出的 `packages/contracts/src/generated/control-plane-decoders.ts`。
- 使用的 decoder 包括 `validateWorkspaceListResponse`、`validateWorkspaceResponse`、`validateProjectListResponse`、`validateProjectResponse`、`validateDraftListResponse`、`validateDraftResponse`、`validateDataSourceListResponse`、`validateDataSourceResponse`、`validateDataVersionResponse`、`validateModuleListResponse`、`validateModuleVersionResponse`、`validateJob`、`validateAcceptedJobResponse`、`validateErrorEnvelope`。

API client 已删除普通成功响应中的 `(await readJson(response)) as T`，也删除了 apps/web 内手写的 `isErrorEnvelope` / `isAcceptedJobResponse`。成功响应、`ErrorEnvelope`、`AcceptedJobResponse` 和 `Job` 均经生成 decoder 校验后才返回 UI。

## API Client

`createControlPlaneApiClient()` 现在对每个 operation 显式绑定：

- 预期 HTTP status：GET/PATCH 为 200，create 为 201，异步 job 启动为 202。
- JSON Content-Type：非 JSON、204、空 body 均关闭式失败。
- 生成 runtime decoder：非法字段、缺少 required、错误枚举、additionalProperties 均拒绝。
- 稳定失败面：契约漂移、网络失败、JSON parse 失败返回脱敏的 dependency/contract failure，不包含响应正文、Authorization token 或内部堆栈。

URL/query 行为：

- 每个 endpoint 使用显式 query serializer。
- path 参数不再回流到 query。
- `listDrafts` 和 `listDataSources` 的 query 只允许 `cursor` / `limit`，`environment` 只存在于 path。
- `listModuleCatalog` 按 OpenAPI 保留 `environment` / `cursor` / `limit` query。
- 测试断言完整最终 URL，覆盖 `listProjects`、`listDrafts`、`listDataSources`、`listModuleCatalog`、`getModuleCatalogVersion`。

404/403 行为：

- `AUTHZ_NOT_FOUND_OR_DENIED` 的 404 和 403 均映射为 `authAction: "hide-sensitive-content"`。
- 非法 `ErrorEnvelope.code` / `category` 不会泄漏给 UI，返回稳定契约失败。

负例覆盖：

- malformed success payload。
- malformed `ErrorEnvelope`。
- malformed 202 `AcceptedJobResponse` / `JobStatus`。
- 错误成功状态。
- 204 / 空 body。
- 非 JSON body。
- additionalProperties。
- fetch throw。
- 错误内容不得包含 Authorization token。

## 租户缓存

`TenantQueryCache` 现在保存结构化 scope 元数据，并提供分层失效：

- `clearEnvironment(workspaceId, projectId, environment)`。
- `clearProject(workspaceId, projectId)`。
- `clearWorkspace(workspaceId)`。
- `clearScope(scope)`。
- `clearAll()`。

缓存清理语义：

- `switchWorkspace`: 验证目标 workspace 存在后，清除旧 workspace 下全部 workspace/project/environment 缓存，不误删目标 workspace 缓存，增加 `pageStateRevision`，重置 `focusTargetId`。
- `switchProject`: 验证 project 属于当前 workspace 后，清除旧 project 的全部 environment 缓存，不误删同 workspace 其他 project。
- `switchEnvironment`: 运行时验证目标 environment 属于活动 project 后，只清除旧 environment 精确缓存。
- `signOut`: 调用 `clearAll()`，确保下一登录用户无法读取前一会话租户缓存。

测试预置同一 workspace 多 project、多 environment 缓存，覆盖切换、切回和 sign-out 后 `cache.size === 0`。

## Session 和 Scope

`createSessionController()` 现在复制并深度冻结 session 快照：

- `workspaces` 数组和每个 workspace。
- `projects` 数组和每个 project。
- workspace/project `capabilities` 数组。
- project `environments` 数组。
- `activeScope`。

非法切换全部关闭式拒绝，且保持 session、`pageStateRevision` 和 cache 不变：

- 未知 workspace。
- 跨 workspace project。
- 未知 project。
- 非法 environment 字符串。
- 不属于活动 project 的 environment。

测试还验证 controller 创建后外部修改原始 membership/capability 数组不会改变内部 session，也不会展示新的敏感导航。

## 权限和 Route Gate

Web 端不复制 RBAC 角色矩阵，只使用服务端 session 提供的有效 capability。Project/Environment route 的有效权限采用当前 workspace capabilities 与当前 project capabilities 的交集。

敏感 route 与冻结 capability 对齐：

- `accessCredentials`: `workspace.manage`。
- `review`: `candidate.review`。
- `membersRoles`: `project.member.manage`。
- `projectSettings`: `workspace.manage`。
- `platformOps`: 平台角色契约尚未提供，因此关闭式不可进入，并与普通 project navigation 分离。

`resolveRouteAccess()` 是单一 route access 决策入口，`createShellView()` 和 `visibleNavigation()` 共用它。覆盖：

- public route。
- authenticated route。
- workspace route。
- project route。
- environment route。
- sensitive route `requiredCapability`。
- unknown route。
- platform-only route。

权限或 scope 不满足时，`createShellView()` 返回明确 denied/redirect 结果，不构造敏感页面 shell/content。测试覆盖匿名直接打开敏感 route、缺 capability、unknown route、platformOps、workspace owner + project observer 更严格叠加隐藏敏感导航和主操作。

### 路由策略运行时不可变

route access policy 只有一份来源：`apps/web/src/routes.ts` 的 `routeMap`。模块初始化时会运行时冻结：

- `routeMap` 数组。
- 每个 route entry。
- route entry 上的 `access`、`path`、`requiredCapability`、`platformOnly`、`layoutSlot` 等策略字段所在对象。

`routeById()` 返回的仍是同一份 frozen route entry，因此调用方不能通过返回值删除 `accessCredentials.requiredCapability` 或修改 `platformOps.platformOnly` 来绕过 `resolveRouteAccess()`、`createShellView()` 或 `visibleNavigation()`。`shellA11yBaseline`、`skipLink` 和 `landmarks` 也已运行时冻结。

回归测试和独立探针均验证：

- `Object.isFrozen(routeMap) === true`。
- `Object.isFrozen(routeById("accessCredentials")) === true`。
- 删除 `requiredCapability` 抛出 `TypeError`，且 observer 访问 `accessCredentials` 仍为 `missing_capability`。
- 修改 `platformOnly` 抛出 `TypeError`，且 `platformOps` 仍为 `platform_unavailable`。
- 敏感导航仍不可见。

## 导航 URL

`visibleNavigation()` 返回的 `href` 使用 active scope 生成真实 URL，并对 `workspaceId`、`projectId`、`environment` 执行 `encodeURIComponent`。

测试覆盖：

- 导航结果不包含 `:workspaceId`、`:projectId`、`:environment` 占位符。
- workspace/project/environment 中的特殊字符被正确编码。
- 缺少所需 scope 时不渲染不可导航敏感项。

## 真实 Accessibility Baseline

WP-14A 提供最小可渲染 shell DOM，不实现业务页面。生产 Web 模块只包含：

- `renderShell()`。
- `attachShellFocusBehavior()`。
- `focusMainContent()`。
- 仅依赖标准 DOM 类型的 helper。

测试专用能力已移到 `tests/web/shell-dom-helper.ts`：

- `createShellDom()`。
- `runAxeOnShell()`。
- JSDOM 构造。
- axe-core 执行和测试类型断言。

`apps/web/src/index.ts` 不导出 JSDOM、axe runner 或测试专用 API；构建后的 `apps/web/dist/index.js` 只导出 `api-client`、`cache`、`routes`、`session`、`shell`、`shell-render`。

渲染结果包含：

- 可聚焦 skip link，目标为 `#main-content`。
- `header role="banner"`。
- 具名 `nav` landmark。
- 唯一 `main#main-content`。
- `main` 设置 `tabindex="-1"`，route change 后可接收焦点。
- Workspace/Project/Environment selector 具备可访问标签。
- Production badge 同时包含可读文字和 `role="img"` / `aria-label` 语义，不只依赖 danger 色调。

真实 DOM 测试使用测试路径中的 `jsdom@30.1.0` 和 `axe-core@4.13.0`。`runAxeOnShell()` 对生产 `renderShell()` 生成的真实 HTML 运行 axe。因为 jsdom 没有 canvas 支持，测试禁用 axe 的 `color-contrast` 规则；除该说明外，axe violations 必须为空，不再只过滤 serious/critical。

键盘/focus 测试覆盖：

- Tab 序起点可到达 skip link。
- 激活 skip link 后焦点进入 `main#main-content`。
- route change helper 后 `main#main-content` 获得焦点。
- 隐藏的敏感导航不可被 Tab 到达。

## Route Map 归属

| Route id            | UI manual ownership                                           | Path template                                                                  | Layout slot | Access scope                      | Notes                               |
| ------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------- | --------------------------------- | ----------------------------------- |
| `login`             | UI-01                                                         | `/login`                                                                       | `auth`      | public                            | 独立 route                            |
| `workspaceSelect`   | UI-02                                                         | `/workspaces`                                                                  | `workspace` | authenticated                     | 独立 route                            |
| `projectSelect`     | UI-03                                                         | `/workspaces/:workspaceId/projects`                                            | `workspace` | workspace                         | 独立 route                            |
| `projectOverview`   | UI-04                                                         | `/workspaces/:workspaceId/projects/:projectId/:environment/overview`           | `project`   | environment                       | 独立 route                            |
| `serviceList`       | UI-05                                                         | `/workspaces/:workspaceId/projects/:projectId/:environment/services`           | `project`   | environment                       | 服务能力列表                              |
| `serviceWizard`     | UI-06, UI-07, UI-16, UI-17, UI-18, UI-19, UI-20, UI-21, UI-23 | `/workspaces/:workspaceId/projects/:projectId/:environment/services/new/:step` | `wizard`    | environment                       | wizard steps                        |
| `data`              | UI-08, UI-09, UI-10, UI-11, UI-12, UI-13, UI-14, UI-31        | `/workspaces/:workspaceId/projects/:projectId/:environment/data`               | `project`   | environment                       | 独立 route                            |
| `moduleCatalog`     | UI-15, UI-38                                                  | `/workspaces/:workspaceId/projects/:projectId/:environment/modules`            | `project`   | environment                       | 服务能力/版本入口                           |
| `testCenter`        | UI-22                                                         | `/workspaces/:workspaceId/projects/:projectId/:environment/tests`              | `project`   | environment                       | 任务中心相关项目页                           |
| `review`            | UI-24, UI-25, UI-26                                           | `/workspaces/:workspaceId/projects/:projectId/:environment/review`             | `project`   | environment + `candidate.review`  | Review and Deploy                   |
| `accessCredentials` | UI-27, UI-28, UI-32                                           | `/workspaces/:workspaceId/projects/:projectId/:environment/access`             | `project`   | environment + `workspace.manage`  | Access and Credentials              |
| `operationsAlerts`  | UI-29, UI-33, UI-36, UI-37                                    | `/workspaces/:workspaceId/projects/:projectId/:environment/operations`         | `project`   | environment                       | 通知中心/运维事件                           |
| `membersRoles`      | UI-39                                                         | `/workspaces/:workspaceId/projects/:projectId/members`                         | `project`   | project + `project.member.manage` | Members and Roles                   |
| `projectSettings`   | UI-30, UI-34, UI-35                                           | `/workspaces/:workspaceId/projects/:projectId/settings`                        | `project`   | project + `workspace.manage`      | 版本差异/高影响确认作为 page action/overlay 归属 |
| `platformOps`       | UI-40                                                         | `/platform`                                                                    | `workspace` | platform                          | 平台运营后台，关闭式隔离                        |

UI-06..UI-23 不再作为未定义范围处理；已拆分到 wizard、module catalog、test center、review 等 route/wizard 归属。高影响确认属于对应 project settings/review 的 overlay action；通知中心归属 `operationsAlerts`；服务能力归属 `serviceList` / `moduleCatalog`；版本差异归属 `moduleCatalog` 与 `projectSettings` 的 overlay/action。

## 独立探针

生产依赖边界探针：

```console
$ pnpm --filter @modular-mcp/web build
$ rg -n 'jsdom|axe-core' apps/web/dist
$ rg -n 'node:' apps/web/dist
```

输出：均无匹配。构建后的 production JS/d.ts 不包含 `jsdom`、`axe-core` 或 `node:`，`apps/web/dist/index.js` 不导出 `createShellDom` / `runAxeOnShell`。

路由冻结和篡改探针：

```console
delete requiredCapability: TypeError
modify platformOnly: TypeError
Object.isFrozen(routeMap): true
Object.isFrozen(accessCredentials): true
observer accessCredentials: { ok: false, action: 'denied', reason: 'missing_capability' }
validSession platformOps: { ok: false, action: 'denied', reason: 'platform_unavailable' }
```

## 已解决的范围外阻断

先前阻断 `pnpm verify:affected` 的范围外格式问题已经由对应工作完成，WP-14A 本次恢复未修改这些文件：

- `packages/database/src/index.ts`: 已解决，Prettier PASS。
- `tests/control-api/draft-create.test.ts`: 已解决，Prettier PASS。
- `tests/control-api/upload-multipart.test.ts`: 已解决，Prettier PASS。

## 验证记录

| 命令                                             | 结果   | 关键输出                                                                                                                               |
| ---------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `./scripts/check-work-package-ready.sh WP-14A` | PASS | `PASS dependency WP-01B`, `PASS dependency WP-03A`, `READY WP-14A`                                                                 |
| `./scripts/validate-work-packages.sh`          | PASS | `PASS  71 work packages and dependency references are structurally valid`                                                          |
| `pnpm vitest run tests/web`                    | PASS | 2 files, 21 tests passed                                                                                                           |
| `pnpm --filter @modular-mcp/web build`         | PASS | `tsc --build tsconfig.json` completed                                                                                              |
| `rg -n 'jsdom\|axe-core\|node:' apps/web/dist` | PASS | No matches; production dist contains no jsdom, axe-core, or node: references                                                       |
| `pnpm verify:affected`                         | PASS | format, lint, typecheck, unit, contract, build, dependency scan, and secret scan passed; unit baseline: 18 files, 219 tests passed |
| `pnpm dependency:scan`                         | PASS | Dependency policy passed                                                                                                           |
| `pnpm secret:scan`                             | PASS | No unallowlisted secrets found                                                                                                     |
| `git diff --check`                             | PASS | No whitespace errors                                                                                                               |
| `git status --short`                           | PASS | Command completed; worktree remains dirty with WP-14A files plus pre-existing off-scope package changes                            |

## 验收标准核对

- [x] WP-01B runtime decoder 前置依赖已 PASS，WP-14A ready check 为 READY。
- [x] API client 删除成功响应 `as T` 网络响应断言，并绑定生成 decoders。
- [x] 成功、ErrorEnvelope、AcceptedJobResponse、Job 校验失败时关闭式返回稳定 failure。
- [x] URL/query serializer 不泄漏 path tenant 参数，精确 URL 测试通过。
- [x] TenantQueryCache 支持 workspace/project/environment/all 分层清理。
- [x] Workspace/Project/Environment/signOut 清理语义和回归测试通过。
- [x] Session 快照深度冻结，非法 scope 切换关闭式拒绝。
- [x] Web 使用服务端有效 capability，project/environment 采用 workspace 与 project 交集。
- [x] 受保护 route 有显式 access 策略，敏感 route 直接访问关闭式拒绝。
- [x] Platform Operations 与普通 project navigation 分离，并在平台角色契约未完成时关闭式不可进入。
- [x] 最小可渲染 shell DOM、axe、skip link、landmarks、标题层级和焦点测试通过。
- [x] Production badge 包含文字和非颜色语义。
- [x] jsdom/axe-core 已从 apps/web 生产导出链移除，只存在于测试执行路径。
- [x] 构建后生产 dist 无 `jsdom`、`axe-core`、`node:` 匹配。
- [x] route access policy 和 a11y baseline 已运行时冻结，篡改尝试无效。
- [x] 全部指定验证命令通过。
- [x] 人工 design gate 复审通过。等待 reviewer 后才能改为 PASS。

## 全局约束核对

- [x] 未修改 `packages/contracts`。
- [x] 未在 apps/web 手写第二套 DTO/schema。
- [x] 未使用 `as T` 代替运行时响应契约校验。
- [x] 未把 evidence 改为 PASS。
- [x] 未填写 reviewer 或 reviewed_at。
- [x] 未执行 git reset、git checkout 或 git clean。
- [x] 未提交、未推送。

## 风险和遗留项

- Platform operator/admin 的正式 session 契约尚未纳入 WP-14A 消费面；当前 `platformOps` 按要求关闭式不可进入。该风险不阻断 WP-14A design gate。
- WP-14A 只提供最小 Web shell DOM 和 shell primitives，不实现业务页面；后续业务 UI work packages 需要绑定真实页面组件并继续跑浏览器级无障碍验证。该风险不阻断 WP-14A design gate。

  经最终复审，WP-14A Web Shell、导航、租户切换、Session、类型安全 API Client 和 Accessibility 基座符合 design gate 要求。

评审确认：

1. Web API Client 直接使用 @modular-mcp/contracts 的生成类型和 runtime decoders，没有维护第二套 DTO，也没有使用 unchecked response cast 绕过运行时校验。
2. 成功响应、ErrorEnvelope、AcceptedJobResponse 和 Job 均执行关闭式契约验证；错误状态、空响应、非 JSON、malformed payload、additionalProperties 和网络异常均返回稳定且脱敏的失败结果。
3. Workspace、Project、Environment 切换执行分层缓存清理；非法 scope 不改变 session、revision 或 cache；signOut 清空全部租户缓存。
4. Session 快照及其 membership、capability、environment、activeScope 已防御性复制并冻结。
5. resolveRouteAccess() 是 route access 的单一决策入口；敏感 route、匿名访问、缺少 scope、缺少 capability、unknown route 和 platform-only route 均关闭式处理。
6. routeMap、每个 route entry、routeById() 返回对象和 shellA11yBaseline 已运行时冻结，无法通过修改 requiredCapability 或 platformOnly 绕过敏感内容 gate。
7. 导航与 API URL 使用最终真实路径，动态 path segment 均编码，未残留 workspace/project/environment 模板占位符。
8. jsdom 和 axe-core 仅存在于测试执行路径；生产 apps/web 构建产物不包含 jsdom、axe-core 或 node: 依赖。
9. axe 在生产 renderShell() 输出的真实 HTML 上执行；除已说明的 jsdom color-contrast 限制外，violations 为空。Skip link、landmarks、标题、route focus 和 Production 标识均有实际 DOM 测试。
10. 先前 database/control-api 范围外格式阻断已经解决，WP-14A 的完整验收命令现已全部通过。
11. Web 专项测试 2 files / 21 tests PASS；全仓验证 18 files / 219 tests PASS；format、lint、typecheck、contract、build、dependency scan、secret scan 和 git diff 检查全部通过。
12. 未实现范围外业务页面、平台管理员契约、后端 handler、数据库逻辑或 Secret 持久化。

Platform Operations 在正式平台身份契约尚未提供时保持关闭式不可进入；后续业务页面仍需继续执行浏览器级 accessibility 验证。这两项属于后续工作包范围，不阻断 WP-14A。

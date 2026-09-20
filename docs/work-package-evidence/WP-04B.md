---
work_package: WP-04B
status: PASS
baseline: "51f3f2a"
completed_at: "2026-09-18T07:57:49Z"
gate: architecture
depends_on:
  - WP-04A
---

# WP-04B 完成证据

## 实现结果

实现了纯算法 Module resolver，用于确定性计算依赖闭包、缺失依赖补齐变更集、循环/冲突/不兼容/多版本冲突检测，以及可执行但不自动应用的冲突解决和替代方案。

本包没有修改 manifest schema，没有实现 UI/API，没有改变版本选择策略，没有自动接受高风险模块或替代方案。

Architecture gate 第一轮整改已完成：

- 抽取 resolver core，支持 `buildProposals: false` 的无递归 proposal 验证模式；
- 所有 proposal 在对显式 selected 集合模拟应用 change set 后，重新执行 core；
- 只有验证结果没有阻断 issue 且没有剩余 additions 的 proposal 才对外返回；
- WP-04B 全部 issue code 均视为阻断；
- conflict proposal 由删除/替换原子动作组成，并通过确定性、有界组合搜索生成完整解决计划；
- replacement alternative 会先模拟“删除旧模块、加入替代模块”，再把安全依赖 additions 合入最终 change set 并二次验证；
- recommendation 使用流式 DFS/branch-and-bound，不物化完整笛卡尔积，最大评估数固定为 `10_000`；
- recommendation 按完整 resolver 闭包验证，并按去重后的 `orderedModules` 计算风险、模块数量和 registryKey 排序；
- JSON Pointer 使用原始输入数组位置，不使用规范化排序后的 token index；
- cycle relationship path 修正为 `A -> B -> A`；
- 显式 selected 模块即使先由依赖路径访问，`orderedModules.reason` 仍为 `selected`。

Architecture gate 第二轮整改已完成：

- 为依赖闭包节点建立确定性的 selected-root provenance/reachability 映射；
- provenance 支持多级传递依赖、diamond/shared dependency、多 selected root 共同引用同一依赖，以及输入乱序稳定性；
- 传递依赖冲突的删除/替换动作落在显式 selected root 上，不直接删除调用方未选择的传递依赖；
- 共享依赖冲突按“冲突端点的全部 selected owners 是否被移除”判断覆盖，避免只删除部分 owner 的伪方案；
- conflict proposal 在最终公开前统一应用 change set、合入保留根所需的安全 dependency additions，并再次执行 resolver core；
- 每个公开 proposal 应用到原始 selected 后均满足 `issues=[]` 且 `additions=[]`。

## 变更文件

- `packages/module-sdk/src/index.ts`：新增 resolver 输入/输出类型、`resolveModuleGraph()`、`recommendModuleSelection()`、稳定排序、错误码、自动补齐 change set、替代方案 proposal、selected-root provenance 和传递依赖冲突 proposal 补全验证。
- `tests/module-sdk/module-graph-fixtures.ts`：新增合成模块图 fixture，覆盖 DAG、diamond、cycle、conflict、alternative、missing、incompatible、多版本、high-risk dependency、推荐候选冲突、传递依赖冲突、多级传递冲突、共享 dependency owner 冲突和 proposal 验证场景。
- `tests/module-sdk/module-resolver.test.ts`：新增和扩展纯算法测试，覆盖 architecture gate 第一轮和第二轮整改探针。

## 契约和衔接

Resolver 输入：

```ts
interface ResolveModuleGraphInput {
  readonly knownManifests: readonly unknown[];
  readonly selected: readonly ModuleGraphSelection[];
}

interface ModuleGraphSelection {
  readonly moduleId: string;
  readonly exactVersion: string;
  readonly artifactDigest?: string;
}
```

Resolver 输出：

```ts
interface ModuleGraphResolution {
  readonly orderedModules: readonly ResolvedModuleNode[];
  readonly additions: readonly ModuleGraphAddition[];
  readonly issues: readonly ModuleResolverIssue[];
  readonly proposals: readonly ModuleGraphProposal[];
}
```

排序规则：

- known manifest 先通过 WP-04A loader/registry 校验；
- selected 输入按 `moduleId@exactVersion` 排序后解析；
- 每个 manifest 的 `requires` 按 exact ref 字典序解析；
- `orderedModules` 使用 DFS 后序，保证 dependency-before-dependent；
- `additions` 按 `registryKey` 字典序；
- `issues` 按 `code:pointer:relationshipPath` 字典序；
- `proposals` 按 `code:message` 字典序；
- 随机 known/selected 输入顺序不改变模块、issue、proposal 的语义顺序；
- JSON Pointer 中的数组 index 指向本次调用原始输入位置，因此输入乱序时 pointer index 可以随原始位置变化。

错误码固定为：

- `invalid_manifest`
- `unknown_module`
- `artifact_digest_mismatch`
- `missing_dependency`
- `incompatible_dependency`
- `cycle_detected`
- `module_conflict`
- `multi_version_conflict`
- `high_risk_autofill_blocked`
- `recommendation_search_limit_exceeded`

关系与定位：

- 每个 issue 包含 `pointer`；
- 每个 issue 包含 `relationshipPath`；
- `requires` 问题 pointer 指向 `/knownManifests/<index>/requires/<index>`；
- `conflicts` 问题 pointer 指向 `/knownManifests/<index>/conflicts/<index>`；
- duplicate token 按同 token 在原始数组中的 occurrence 顺序映射；
- selected 问题 pointer 指向 `/selected/<index>` 或其字段。

一键补齐：

- `additions` 只返回满足 exact dependency ref、已知 manifest、非 high-risk 的依赖；
- 如果完整闭包存在任何 issue，`additions` 为空；
- resolver 不修改输入；
- `autofill_dependencies` proposal 只返回执行前 change set；
- `autofill_dependencies` proposal 会被模拟应用并重新验证；
- high-risk 依赖返回 `high_risk_autofill_blocked`，不进入 additions。

替代方案：

- conflict proposal 基于每个冲突的删除/替换原子动作；
- 对多个互不相关冲突，resolver 通过确定性、有界组合搜索返回可一次性解决全部冲突的完整 plan；
- 每个公开 conflict proposal 应用后必须满足 `issues=[]` 且 `additions=[]`；
- removal proposal 只基于显式 selected 模块；
- 若冲突端点是传递依赖，proposal 基于 selected-root provenance 删除或替换使该端点保持活跃的显式 selected root；
- 对共享依赖，只有移除冲突端点的全部 selected owners 才会被视为覆盖该端冲突；
- 公开 proposal 会合入保留 selected root 仍需要的安全 dependency additions，再二次解析验证；
- removal proposal 模拟应用后如果会留下 issue 或需要重新补齐依赖，则不返回；
- 当存在同类型、同 provides 覆盖、非 high-risk、不与所有保留活动模块冲突且完整闭包可执行的模块时，返回 `replace_with_alternative`；
- replacement alternative 的自身 addition 使用 `replacement_alternative` reason，安全依赖 additions 使用 `required_dependency`；
- replacement alternative 允许引入已完整验证的安全依赖；最终 change set 再次应用后必须没有 issue 和剩余 additions；
- alternative 若存在 missing/incompatible/cycle/multi-version/high-risk 问题，不返回 proposal；
- resolver 不替用户确认方案。

推荐：

- `recommendModuleSelection({ knownManifests, desiredProvides })` 以流式 DFS/branch-and-bound 遍历每个 desired provide 的候选组合；
- 推荐搜索最大评估数固定为 `10_000`；
- 超出上限时返回 `recommendation_search_limit_exceeded`，且 `selections=[]`；
- 候选组合按完整 resolver 闭包验证；
- 排序优先级为：无 high-risk、无 issue、去重闭包总风险更低、去重闭包模块数量更少、registryKey 字典序；
- 不会因为已经找到一个候选就在未完整比较时提前返回“最优”结果；
- 找不到安全可执行组合时返回明确 issue，不返回表面成功 selections。

## 验证记录

| 命令                                             | 结果  | 关键输出                                                                                                                     |
| ---------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------ |
| `./scripts/check-work-package-ready.sh WP-04B` | OK  | `READY WP-04B`，dependency WP-04A ready                                                                                   |
| `pnpm --filter @modular-mcp/module-sdk test`   | OK  | 3 files, 41 tests passed                                                                                                 |
| `pnpm --filter @modular-mcp/module-sdk build`  | OK  | `tsc --build tsconfig.json`                                                                                              |
| `pnpm verify:affected`                         | OK  | Local CI reproduction completed: format, lint, typecheck, 12 unit files / 133 tests, contract, build, dependency, secret |
| `pnpm dependency:scan`                         | OK  | `dependency scan passed: pnpm-lock.yaml and workspace manifests use pinned dependency policy`                            |
| `pnpm secret:scan`                             | OK  | `secret scan passed: no unallowlisted secret patterns found`                                                             |
| `git diff --check`                             | OK  | No whitespace errors                                                                                                     |
| `git status --short`                           | OK  | Ran and confirmed WP-04B changes coexist with pre-existing unrelated dirty worktree entries                              |

## 验收标准核对

- [x] DAG closure fixture 通过，并返回执行前 autofill additions。
- [x] Diamond closure fixture 通过，共享依赖只出现一次。
- [x] Cycle fixture 返回 `cycle_detected` 和 relationship path。
- [x] Conflict fixture 返回 `module_conflict` 和可执行 removal/replacement proposals。
- [x] 两个互不相关冲突返回至少一个包含两个必要动作的完整 `resolve_conflicts` 方案。
- [x] manifest/selected 乱序后 conflict proposal 语义和排序稳定。
- [x] 两个传递依赖冲突返回 `module_conflict`、非空 proposal，且 removals 只指向显式 selected root。
- [x] 多级传递依赖冲突返回完整可执行 root-level proposal。
- [x] 共享 dependency owner 冲突不返回只删除部分 owner 的伪方案。
- [x] 传递冲突 fixture 的 knownManifests/selected 乱序后 proposal code、additions、removals 和排序保持确定。
- [x] Alternative fixture 返回非 high-risk replacement proposal。
- [x] replacement alternative 可携带合法 source dependency，并以 `replacement_alternative` 标记替代模块自身。
- [x] Missing dependency fixture 返回 `missing_dependency`。
- [x] Incompatible exact dependency fixture 返回 `incompatible_dependency`，不猜版本。
- [x] Multi-version closure fixture 返回 `multi_version_conflict`。
- [x] 随机 known/selected 输入顺序不改变输出。
- [x] high-risk dependency 不被 one-click autofill 自动加入。
- [x] root -> medium -> high-risk 无可执行 autofill。
- [x] root -> medium -> missing 无可执行 autofill。
- [x] autofill 后产生版本冲突时无可执行 autofill。
- [x] 推荐候选存在 high-risk 传递依赖时不返回成功 selections。
- [x] 两个 desiredProvides 的最低风险候选互相冲突时选择安全备选。
- [x] 推荐候选存在 missing/cycle/multi-version 时不返回成功 selections。
- [x] 推荐评分仅基于去重后的完整闭包，风险相同时选择模块总数更少的组合。
- [x] 推荐搜索超出 `10_000` 评估上限时返回稳定阻断错误和空 selections。
- [x] desired provide 缺失时快速失败，不进入大规模推荐搜索。
- [x] legal alternative 返回前经过完整闭包验证。
- [x] alternative 依赖缺失或与第三个活动模块冲突时不返回。
- [x] 删除 proposal 会破坏保留模块依赖时不返回。
- [x] unsorted requires/conflicts issue pointer 指向原始输入 index。
- [x] duplicate requires token 按原始 occurrence 顺序定位。
- [x] cycle path 精确为 `A -> B -> A`。
- [x] 显式 selected 同时也是另一模块依赖时 reason 仍为 `selected`。
- [x] 每个 proposal 模拟应用 change set 后 resolver 不产生阻断 issue 或剩余 additions。
- [x] `pnpm verify:affected` 完成全链路本地验证。

## 全局约束核对

- [x] 未实现写入、外部 API 写操作、用户代码执行或执行沙箱。
- [x] 未修改 manifest schema、contracts、database migration、UI 或 API。
- [x] 未放宽安全、租户、不可变和关闭式拒绝规则。
- [x] 未自动选择高风险模块或替代方案。
- [x] 测试未跳过、未弱化断言、未降低质量门禁。

## 风险和遗留项

- 本包不做签名验证、审核状态阻止列表或已发布服务影响分析；这些属于 WP-04C。
- Resolver 只解析 manifest 中冻结的 exact `id@version` requires；如未来要支持范围版本，需要新的版本选择策略评审，本包没有实现。
- 

## 人工评审

- 门禁：`architecture`
- 结论：`PASS`

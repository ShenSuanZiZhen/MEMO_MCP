# Codex 可执行开发工作包

本目录把《模块化 MCP 构建套件 Codex 5.4 技术开发工作包》拆成 71 个可直接执行的原子工作包。

## 使用方法

按 `manifest.json` 的依赖顺序执行。给 Codex 的输入只需是：

```text
请执行 work-packages/WP-00A.md。严格遵守其中的范围、验证和停止条件；完成后生成规定的 evidence 文件。
```

后续工作包同理。不要把多个原子工作包合并为一个任务；只有清单标记为同一波次、依赖均已 PASS、且修改目录不重叠时才允许并行。

## 执行前

```bash
./scripts/validate-work-packages.sh
./scripts/list-ready-work-packages.sh
./scripts/check-work-package-ready.sh WP-00A
```

第二条命令列出当前所有可开始且尚未完成的工作包；第三条检查指定工作包的直接依赖证据。首包 WP-00A 没有依赖。

## 执行后

每个工作包必须生成：

```text
docs/work-package-evidence/<工作包ID>.md
```

证据文件必须包含 `status: PASS`、变更文件、契约/迁移影响、实际运行的命令与结果、遗留风险和下游注意事项。没有可复现证据，不能开始依赖它的工作包。

## 权威顺序

冲突时按以下顺序处理：

1. `01_模块化MCP构建套件_产品需求说明书_PRD.md`；
2. `04_模块化MCP构建套件_技术开发方案.md`；
3. `work-packages/00_全局开发约束.md`；
4. 已冻结的 `packages/contracts` Schema 和 ADR；
5. 当前原子工作包；
6. 实现偏好。

遇到上层文件互相冲突时停止并请求决策，不以代码绕过。

## 固定质量门

WP-00A 建立根命令后，每包至少运行：

```bash
pnpm verify:affected
```

里程碑和共享契约包还需运行：

```bash
pnpm verify
```

若命令尚不存在，只有负责创建该命令的工作包可以新增；其他工作包应停止并报告基座缺失。

## 文件说明

- `00_全局开发约束.md`：所有包不可覆盖的产品、架构、安全和交付约束；
- `00_证据模板.md`：完成证据格式；
- `manifest.json`：依赖、波次、风险和人工门禁；
- `WP-*.md`：可直接输入的原子任务。

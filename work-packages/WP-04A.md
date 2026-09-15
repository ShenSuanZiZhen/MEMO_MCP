---
id: WP-04A
depends_on: [WP-01D, WP-02C]
gate: none
---
# WP-04A 模块清单加载与版本规则

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-04A`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 MOD-001/002/006、技术方案第 7 节及依赖 evidence。

## 目标结果
实现 Module Manifest 加载、schema 校验、SemVer 和内置模块注册基座。

## 允许修改
`packages/module-sdk`、最小 built-in fixture、module repository adapter、测试。

## 禁止和非目标
不解析依赖图、不执行模块、不允许运行用户代码或浮动生产版本。

## 实施要求
- Manifest 只接受 WP-01D schema；规范化顺序稳定；
- 生产引用必须 exact SemVer + artifactDigest；
- 配置按 configSchema 校验并给 JSON Pointer；
- 建立 Source/Capability/Output/Prompt 类型与 apiVersion 兼容检查。

## 可验证完成结果
- 非法类型、版本、权限、配置、浮动生产引用均拒绝；
- 相同 manifest 规范化结果稳定；
- `pnpm --filter @studio/module-sdk test`、`pnpm verify:affected` PASS。

## 衔接输出
Evidence 提供 loader/registry API、规范化格式和首批 fixture ID。

## 停止条件
Schema 需要变化或需要实现执行沙箱时停止。

---
id: WP-05A
depends_on: [WP-03B, WP-04A]
gate: none
---
# WP-05A Draft 创建与模板

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-05A`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 CRT-001～004、用户流程第 4/5 节及依赖 evidence。

## 目标结果
实现空白、模板、复制历史版本三种 Draft 创建和三个 P0 模板。

## 允许修改
control-api draft/template application、相关 domain/repository 和测试。

## 禁止和非目标
不做目标编辑/自动保存 UI；不复制凭证、实时用量或生产 Secret。

## 实施要求
- 三种方式都产生独立 Draft/revision；
- 模板包含资料查询、数据验证、目录浏览和强制安全默认值；
- 复制只复制配置/数据绑定引用；
- 创建接口幂等并受 Workspace/Project 权限控制。

## 可验证完成结果
- 三种创建结果隔离；重复请求不重复 Draft；
- 复制结果无 credential/usage；模板无法关闭平台保护；
- API 契约测试与 `pnpm verify:affected` PASS。

## 衔接输出
Evidence 提供创建 use-case、模板版本、默认值来源和 Draft 初始状态。

## 停止条件
模板需要新增 P1 能力或复制语义与 PRD 冲突时停止。

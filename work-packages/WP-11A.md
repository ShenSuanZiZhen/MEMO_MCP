---
id: WP-11A
depends_on: [WP-06D, WP-10B]
gate: none
---
# WP-11A 三视角预览

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-11A`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 PRE-001～004、用户流程第 10 节及依赖 evidence。

## 目标结果
从同一不可变 Definition 生成 Owner、User、MCP Client 三种预览及确认记录。

## 允许修改
preview application/service、API 实现、fixture 和测试。

## 禁止和非目标
不从 Draft 重新编译、不执行真实 Tool、不写前端页面。

## 实施要求
- previewId 绑定 definitionId/digest 和 viewer scenario；
- Owner 展示来源/限制/风险，User 隐藏内部实现，Client 展示真实 schema；
- 未认证/无权/超配额/过期/暂停情景使用同一策略原因；
- 关键 Definition 变化使确认失效，历史预览保留。

## 可验证完成结果
- 三视角共享同一 digest，Client schema 与 runtime snapshot 相同；
- User 预览无模块 digest、路径、Secret；
- 失效/情景测试和 `pnpm verify:affected` PASS。

## 衔接输出
Evidence 提供 preview DTO、scenario 枚举、确认/失效接口。

## 停止条件
必须读取最新 Draft、预览与运行 schema 不一致或需暴露内部字段时停止。

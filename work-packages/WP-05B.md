---
id: WP-05B
depends_on: [WP-05A]
gate: none
---
# WP-05B 目标、步骤与结果摘要

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-05B`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 GOL-001～004、用户流程第 6 节及 WP-05A evidence。

## 目标结果
实现服务基础资料、目标能力、禁止用途、步骤完成状态和可解释结果摘要。

## 允许修改
control-api Draft goal/step application、校验、摘要生成和测试。

## 禁止和非目标
不编译最终 Definition、不实现模块 resolver、不加入写入/下载能力。

## 实施要求
- 校验名称、说明、受众、禁止用途、语言；
- 仅支持浏览/元数据/搜索/按段/引用验证；
- 目标变化输出推荐输入和后续失效范围；
- 保存未完成与标记步骤完成分离。

## 可验证完成结果
- 缺必填可保存但不能完成；写入/删除/整篇/原文件请求拒绝；
- 目标组合摘要稳定且可追溯；
- 契约测试、`pnpm verify:affected` PASS。

## 衔接输出
Evidence 固定目标枚举、步骤状态、摘要 DTO 和失效信号。

## 停止条件
需要新增业务目标或摘要包含未授权能力时停止。

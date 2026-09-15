---
id: WP-11B
depends_on: [WP-10D, WP-11A]
gate: none
---
# WP-11B 测试注册表与后台执行

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-11B`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 TST-001～003、用户流程第 11 节及依赖 evidence。

## 目标结果
实现版本化测试注册表、快速/完整/自定义套件及可恢复后台 TestRun。

## 允许修改
test runner worker、test registry/application/API、合成 fixture/tests。

## 禁止和非目标
不运行任意用户脚本、不覆盖报告、不以 mock 绕过 MCP pipeline。

## 实施要求
- TestRun 绑定 definitionDigest/testSuiteVersion；
- 完整套件含未认证、越权、超限、撤权、数据异常、漂移；
- 后台进度、取消、重试、失败定位；成功用例保留；
- 自定义测试只允许受控输入 schema。

## 可验证完成结果
- Worker kill 后恢复；重复开始幂等；缺必测项标不完整；
- 每个安全负例实际经过 Gateway pipeline；
- workflow/集成测试和 `pnpm verify` PASS。

## 衔接输出
Evidence 提供 suite registry、TestRun 状态、activity 和必测 ID 清单。

## 停止条件
需要任意代码执行、生产数据或跳过真实保护链时停止。

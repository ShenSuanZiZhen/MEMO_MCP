---
id: WP-15C
depends_on: [WP-06B, WP-09B, WP-14C]
gate: design
---
# WP-15C 模块、能力、策略与保护 UI

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-15C`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 UI-15～20、用户流程第 8/9 节及依赖 evidence。

## 目标结果
实现模块推荐/依赖冲突、Tools/Resources/Prompts、访问策略和运行保护配置页面。

## 允许修改
`apps/web` wizard module/config/policy/protection routes、hooks/tests。

## 禁止和非目标
不允许任意策略表达式/JSON 越权；不在高级模式解锁额外权限。

## 实施要求
- 依赖方案显示新增/移除和后续失效，阻断无忽略入口；
- Tool 配置与实时 schema/result 同屏；
- policy scenario 调同一后端 evaluator；
- 展示平台/项目/模块/用户/实际值，不静默改写用户输入。

## 可验证完成结果
- 缺依赖补齐、冲突方案、停 Tool 影响 Prompt、策略情景 Playwright；
- 高级 JSON 扩权被双向校验拒绝；有效值显示准确；
- axe/键盘/`pnpm verify:affected` PASS；设计评审通过。

## 衔接输出
Evidence 提供页面/step IDs、配置 patch、失效导航和阻断映射。

## 停止条件
后端缺少解释/有效值、需要任意表达式或前端绕过阻断时停止。

---
id: WP-01B
depends_on: [WP-01A]
gate: api
---
# WP-01B 核心控制面 OpenAPI

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-01B`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 PRD ACC/CRT/GOL/DAT/MOD、用户流程第 3～9 节及 WP-01A evidence。

## 目标结果
冻结 Workspace、Project、Draft、DataSource/DataVersion 和 Module Catalog 的 P0 REST 契约。

## 允许修改
`packages/contracts` 对应 OpenAPI、示例、生成类型和契约测试。

## 禁止和非目标
不实现 API、不包含 P1 连接器类型、不暴露 Secret 明文读取 endpoint。

## 实施要求
- 写接口含 Idempotency-Key，Draft 更新含 If-Match/revision；
- 上传/处理使用 202 Job 和分阶段错误；
- 无权与不存在响应不泄露存在性；
- 列表使用 cursor，环境字段不可省略。

## 可验证完成结果
- 每个 PRD P0 操作至少有请求/成功/失败示例；
- OpenAPI lint、生成无 diff、breaking test PASS；
- Secret 响应 schema 不允许完整值；`pnpm verify` PASS。

## 衔接输出
Evidence 提供 endpoint 索引、schema 版本及 WP-02/03/05/07/14 的生成类型路径。

## 停止条件
需要新增 PRD 未定义能力或改变公共基元时停止。

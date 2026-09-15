---
id: WP-18C
depends_on: [WP-10D, WP-13C]
gate: release
---
# WP-18C 性能、容量与并发压测

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-18C`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 NFR-PERF、技术方案第 15/17 节及依赖 evidence。

## 目标结果
建立可重复的控制面、搜索、读取、限流和任务积压 k6 基线与容量模型。

## 允许修改
`tests/performance`、合成数据生成器、性能配置/报告；只做证据支持的局部优化。

## 禁止和非目标
不压生产、不关闭安全/telemetry 换性能、不无依据提高目标。

## 实施要求
- 普通 API P95≤800ms、搜索≤2s、按段读取≤3s；
- 覆盖 steady/spike/soak、quota 并发、Worker backlog；
- 数据规模、CPU/内存、并发、预热、统计窗口固定；
- 报告同时记录错误率、拒绝原因和资源瓶颈。

## 可验证完成结果
- `pnpm test:performance` 可复现并输出机器可读报告；
- 目标达标或形成有 owner/期限/证据的签字例外；
- 限流不超发、错误率在预算内；`pnpm verify` PASS；发布评审通过。

## 衔接输出
Evidence 提供数据集、场景、结果、容量拐点、建议资源和例外。

## 停止条件
需要削弱保护、改变 NFR、测试资源不足或瓶颈需架构变更时停止。

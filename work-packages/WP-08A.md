---
id: WP-08A
depends_on: [WP-07C]
gate: security
---
# WP-08A 解析沙箱与 TXT/MD

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-08A`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 NFR-SEC-003、技术方案第 9.1 节及 WP-07C evidence。

## 目标结果
建立受限解析器运行环境，并把 TXT/Markdown 转为稳定规范化文档和 chunk。

## 允许修改
parser worker、sandbox 配置、normalization/chunking 基座、TXT/MD fixture/tests。

## 禁止和非目标
不解析 PDF/Office、不联网、不运行文档代码、不做向量检索。

## 实施要求
- 非 root、只读根、临时盘配额、无默认网络、CPU/内存/时间/输入上限；
- 统一 document/section/chunk 模型和稳定 ID；
- 编码/换行/标题规范化确定；保留来源定位但不暴露存储路径；
- 超限/乱码/空文档给定位错误。

## 可验证完成结果
- TXT/MD golden 重复处理 bit-for-bit 相同；
- 网络、写根、超时、超内存/大小场景被阻断；
- 容器安全断言、`pnpm verify` PASS；安全评审通过。

## 衔接输出
Evidence 固定 normalized model、stable ID 算法、sandbox limits 和 parser port。

## 停止条件
需要 OCR、联网、执行宏或改变规范化模型时停止。

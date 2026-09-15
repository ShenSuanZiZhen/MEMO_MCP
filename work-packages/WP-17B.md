---
id: WP-17B
depends_on: [WP-08D, WP-09A]
gate: security
---
# WP-17B 只读 S3 Connector

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-17B`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 DAT-006/008/009、技术方案第 9.2 节及依赖 evidence。

## 目标结果
实现固定 endpoint/region/bucket/prefix 的只读对象存储连接器及范围预览/抽样。

## 允许修改
connector worker S3 adapter、Secret port、MinIO fixture/tests。

## 禁止和非目标
不写/删对象、不让 MCP 参数改变 endpoint/bucket/prefix、不生成原文件下载链接。

## 实施要求
- 验证并规范化 prefix，对象数量/大小/格式限制；
- 列表、抽样读取和固定清单/受控 prefix 版本策略；
- 凭证只读验证，保存后不回显；
- endpoint 适用 HTTP egress 安全规则。

## 可验证完成结果
- `../`、编码 escape、相似 prefix、改 bucket/endpoint、超数量/大小均拒绝；
- 两 tenant/bucket/prefix 隔离，正常对象可形成候选 DataVersion；
- MinIO/security、`pnpm verify` PASS；安全评审通过。

## 衔接输出
Evidence 提供 connector config、scope normalizer、版本策略和错误阶段。

## 停止条件
需要写权限、客户端动态范围、原文件下载或真实云凭证时停止。

---
id: WP-07A
depends_on: [WP-03B, WP-02D]
gate: none
---
# WP-07A 分片上传与断点恢复

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-07A`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 DAT-001/002、用户流程第 7.2 节和依赖 evidence。

## 目标结果
实现受租户隔离的 multipart 创建、签名、分片确认、完成、取消和过期恢复。

## 允许修改
control-api upload use-case、S3 port/adapter、相关数据模型和集成测试。

## 禁止和非目标
不解析文件、不扫描、不提供原文件下载；不信任客户端 checksum/size。

## 实施要求
- 强制单文件/数量/草稿总量上限；服务端确认 checksum 和已上传分片；
- 对象 key 服务端生成且含隔离维度；签名 URL 短时、只写指定 part；
- complete/abort 幂等；过期后可恢复有效分片或明确拒绝；
- 上传权限每次检查。

## 可验证完成结果
- 中断恢复不重复成功分片；同 key 重试结果相同；
- 越 workspace/project、改 key/part/size/checksum 均拒绝；
- MinIO 集成测试和 `pnpm verify:affected` PASS。

## 衔接输出
Evidence 提供 upload API、对象 key 格式、状态和测试 fixture。

## 停止条件
需要公开读 URL、客户端指定 bucket/key 或扩大 P0 限制时停止。

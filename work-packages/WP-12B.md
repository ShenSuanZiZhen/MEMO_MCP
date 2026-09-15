---
id: WP-12B
depends_on: [WP-12A, WP-04C]
gate: security
---
# WP-12B 发布制品、SBOM、签名与摘要

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-12B`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 PUB-005/006、技术方案第 8.2/14.2 节及依赖 evidence。

## 目标结果
从 approved Candidate 确定性生成运行制品、SBOM、来源证明、摘要和测试签名。

## 允许修改
artifact builder worker、制品 schema/存储 adapter、签名/SBOM 测试和文档。

## 禁止和非目标
不部署、不使用生产签名根、不把 Secret/源码凭证打包。

## 实施要求
- 输入精确 Candidate/Definition/module digest/builder version；
- 构建无网络或受控依赖，输出内容可重现；
- artifact digest 与 manifest/签名/SBOM 关联；
- 重复构建去重，篡改任一字节核验失败。

## 可验证完成结果
- 相同输入两次构建 digest 一致；变更模块/Definition 改变 digest；
- SBOM/签名验证通过，篡改和未批准 Candidate 失败；
- secret scan、`pnpm verify` PASS；安全评审通过。

## 衔接输出
Evidence 提供 artifact manifest、存储 key、verify 命令、测试 trust root 和 provenance。

## 停止条件
构建不可重现、需要生产 key/网络或制品包含 Secret 时停止。

---
id: WP-04C
depends_on: [WP-04B]
gate: security
---
# WP-04C 模块审核、签名与阻止

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-04C`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 MOD-006～008、技术方案第 7.3/14 节及 WP-04B evidence。

## 目标结果
实现模块版本审核状态、签名验证端口、blocked/deprecated 规则和影响查询。

## 允许修改
module application/repository、签名 adapter、开发测试信任根和测试。

## 禁止和非目标
不建立生产信任根、不自动暂停线上服务、不执行自定义模块。

## 实施要求
- 生产 Definition 仅接受 approved、精确版本、digest/签名正确模块；
- blocked 立即阻止新选择/发布并查询受影响版本；
- deprecated 允许历史运行但阻止策略按配置；
- 开发私钥不提交，fixture 使用公开测试密钥。

## 可验证完成结果
- 篡改制品、错 key、未审核、blocked 均阻断；
- 历史版本影响列表按租户隔离；
- secret scan、签名负例、`pnpm verify` PASS；安全评审通过。

## 衔接输出
Evidence 提供 verifier port、状态语义、影响查询和测试 key 用法。

## 停止条件
生产 PKI/阻止后自动处置未决或需运行模块代码时停止。

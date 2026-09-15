---
id: WP-13B
depends_on: [WP-12C, WP-09B]
gate: security
---
# WP-13B OAuth Client、PKCE 与 Scope

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-13B`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 POL-006、用户流程第 13.1/13.3 节及依赖 evidence。

## 目标结果
实现受控 OAuth Client 注册、Authorization Code + PKCE 配置、scope 映射和 token 验证。

## 允许修改
credential/oauth application/API、IdP adapter/dev fixture、Gateway token auth 和测试。

## 禁止和非目标
不自建完整身份提供商、不支持 implicit/password grant、不跨环境复用 client。

## 实施要求
- redirect URI 精确匹配；public client 必须 PKCE S256；
- 校验 issuer/audience/signature/exp/nbf/environment；
- scopes 映射 capability/data 范围并与策略取交集；
- client Secret 一次展示、加密保存或 hash（按用途 ADR）。

## 可验证完成结果
- code replay、错 verifier/redirect/audience/env/scope、过期 token 均拒绝；
- 合法 token 只能看到授权能力；撤权按目标生效；
- `pnpm verify` PASS；安全评审通过。

## 衔接输出
Evidence 提供注册/token metadata、scope catalog、auth adapter 和 IdP 配置点。

## 停止条件
企业 IdP 能力不支持契约、Secret 存储 ADR 未定或需弱化 PKCE 时停止。

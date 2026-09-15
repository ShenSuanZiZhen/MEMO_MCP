---
id: WP-02C
depends_on: [WP-02B]
gate: data
---
# WP-02C 发布访问运营数据模型

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-02C`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读技术方案主表与不可变规则、WP-02B evidence。

## 目标结果
建立 Module、Definition、Candidate、Test、ServiceVersion、Deployment、Policy、Credential、Usage、Audit 数据模型。

## 允许修改
`packages/database` 后续迁移、约束、fixture 和集成测试。

## 禁止和非目标
不实现业务 handler；不保存明文 Secret/正文；不创建可变 Published Definition。

## 实施要求
- Definition/Candidate/Published 只追加；digest 和精确版本有唯一约束；
- Credential 分离密文/hash 与摘要；Audit 普通角色不可改；
- 所有表继承租户/RLS 规则；
- 建立状态、时间、服务版本、trace/usage 查询索引。

## 可验证完成结果
- 更新不可变事实、插入重复 digest/version、跨环境凭证引用均失败；
- schema scan 证明无 secret_plaintext/body 字段；
- 空库和升级迁移、`pnpm verify` PASS；数据评审通过。

## 衔接输出
Evidence 记录新表、约束、migration head 和 repository 待实现端口。

## 停止条件
需要弱化不可变或审计保护，或凭证方案未决时停止。

---
id: WP-09D
depends_on: [WP-06B]
gate: security
---
# WP-09D 输出白名单、脱敏与限制

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-09D`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 POL-001/002、CAP-003～005、技术方案第 11.4 节及 WP-06B evidence。

## 目标结果
实现统一 OutputGuard：字段投影、脱敏、条数/段落/字符/字节限制和安全错误。

## 允许修改
output policy/guard 包、序列化限制、fixture/属性测试。

## 禁止和非目标
不实现具体 Tool、不用截断绕过 schema、不记录被删除的敏感值。

## 实施要求
- 顺序固定：allowlist→redaction→item limits→serialize→total bytes；
- 最多 5 段，任何客户端参数不能扩大；
- 截断结构化标记并保持有效 schema；无法安全截断则拒绝；
- 错误同样经过敏感字段和堆栈审计。

## 可验证完成结果
- PII/Secret/路径/SQL/正文超限 fixture 不泄漏；多字节字符按字节正确限制；
- 属性测试证明未允许字段永不出现；
- `pnpm verify:affected` PASS；安全评审通过。

## 衔接输出
Evidence 提供 OutputGuard API、处理顺序、truncated 契约和限制 fixture。

## 停止条件
输出 schema 无法保持有效或需要返回原文件/整篇时停止。
